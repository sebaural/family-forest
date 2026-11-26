"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ActivityPanel } from "@/components/activity/ActivityPanel";
import { DeleteMemberDialog } from "@/components/members/DeleteMemberDialog";
import { MemberPanel, type MemberLink } from "@/components/members/MemberPanel";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import { ShareDialog } from "@/components/share/ShareDialog";
import { MemberList } from "@/components/tree/MemberList";
import { DeleteTreeDialog, RenameTreeDialog } from "@/components/trees/TreeDialogs";
import { Dialog } from "@/components/ui/Dialog";
import { KebabMenu } from "@/components/ui/KebabMenu";
import { errorText, mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { useTreeEvents } from "@/hooks/useTreeEvents";
import { useTreeMembers } from "@/hooks/useTreeMembers";
import { memberFullName } from "@/lib/member-format";
import type { RealtimeClientConfig } from "@/lib/tree-events";
import { MEMBERS_PAGE_SIZE, viewCookieName, type WorkspaceView } from "@/lib/tree-workspace";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member, Relationship, RouterOutputs, TreeDetails } from "@/trpc/types";

// React Flow, dagre and the export code load only when the Graph view is shown.
const TreeGraph = dynamic(() => import("@/components/tree-canvas/TreeCanvas"), {
  ssr: false,
  loading: () => (
    <p className={`flex flex-1 items-center justify-center p-6 ${mutedText}`}>Loading tree…</p>
  ),
});

const viewKey = (treeId: string) => `ff:view:${treeId}`;

function persistView(treeId: string, view: WorkspaceView) {
  // The cookie lets the server render the right view; localStorage is the older store.
  document.cookie = `${viewCookieName(treeId)}=${view}; path=/; max-age=31536000; samesite=lax`;
  try {
    window.localStorage.setItem(viewKey(treeId), view);
  } catch {
    // Not persisted; the toggle still works for this visit.
  }
}

/**
 * List | Graph, remembered per tree. The server reads the cookie and passes
 * `initialView`; without one (older visits) the localStorage value is used.
 */
function useWorkspaceView(treeId: string, initialView: WorkspaceView | null) {
  const [view, setViewState] = useState<WorkspaceView>(initialView ?? "list");
  useEffect(() => {
    if (initialView) return;
    try {
      if (window.localStorage.getItem(viewKey(treeId)) === "graph") {
        setViewState("graph");
        persistView(treeId, "graph");
      }
    } catch {
      // Storage can be blocked (private mode); the list view is the fallback.
    }
  }, [treeId, initialView]);
  const setView = useCallback(
    (next: WorkspaceView) => {
      setViewState(next);
      persistView(treeId, next);
    },
    [treeId],
  );
  return [view, setView] as const;
}

export interface TreeInitialData {
  tree: TreeDetails;
  membersPage: RouterOutputs["members"]["list"];
  relationships: Relationship[];
}

/**
 * Puts the server-fetched data in the query cache before the queries below
 * mount, so the first render already has it (staleTime keeps it from being
 * refetched straight away).
 */
function useSeedTreeCache(treeId: string, initialData: TreeInitialData | undefined) {
  const utils = trpc.useUtils();
  useState(() => {
    if (!initialData) return;
    // Only fill gaps: data already cached this visit is kept current by
    // Realtime, and may be newer than a page payload from Next's router cache.
    const membersInput = { treeId, limit: MEMBERS_PAGE_SIZE };
    if (!utils.trees.get.getData({ treeId })) utils.trees.get.setData({ treeId }, initialData.tree);
    if (!utils.members.list.getInfiniteData(membersInput)) {
      utils.members.list.setInfiniteData(membersInput, {
        pages: [initialData.membersPage],
        pageParams: [null],
      });
    }
    if (!utils.relationships.list.getData({ treeId })) {
      utils.relationships.list.setData({ treeId }, initialData.relationships);
    }
  });
}

const segmentButton = (active: boolean) =>
  `px-3 py-1.5 text-sm font-medium ${
    active
      ? "bg-emerald-700 text-white"
      : "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
  }`;

export function TreeWorkspace({
  treeId,
  realtime,
  initialData,
  initialView = null,
}: {
  treeId: string;
  realtime: RealtimeClientConfig | null;
  initialData?: TreeInitialData;
  initialView?: WorkspaceView | null;
}) {
  useSeedTreeCache(treeId, initialData);
  const router = useRouter();
  const tree = trpc.trees.get.useQuery({ treeId });
  const { members, isLoading, isLoadingMore, error, refetch } = useTreeMembers(treeId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addLink, setAddLink] = useState<MemberLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [view, setView] = useWorkspaceView(treeId, initialView);
  const [treeDialog, setTreeDialog] = useState<"rename" | "delete" | "share" | null>(null);

  useTreeEvents(treeId, realtime);

  // Access can be revoked (or the tree deleted) while the workspace is open.
  const lostAccess = tree.error?.data?.code === "NOT_FOUND";
  useEffect(() => {
    if (lostAccess) router.replace("/dashboard?error=tree-not-found");
  }, [lostAccess, router]);

  if (lostAccess) {
    return <p className={`px-4 py-8 ${mutedText}`}>You no longer have access to this tree.</p>;
  }
  if (tree.error) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-2 px-4 py-8">
        <p role="alert" className={errorText}>
          {getErrorMessage(tree.error)}
        </p>
        <button type="button" onClick={() => tree.refetch()} className={secondaryButton}>
          Try again
        </button>
      </main>
    );
  }
  if (!tree.data) {
    return <p className={`px-4 py-8 ${mutedText}`}>Loading tree…</p>;
  }

  const { name, role, memberLimit, photoUploadsEnabled } = tree.data;
  const memberCount = tree.data.members.length;
  const canEdit = role !== "VIEWER";
  const isOwner = role === "OWNER";
  const atLimit = memberCount >= memberLimit;
  const selected = members.find((member) => member.id === selectedId) ?? null;
  const summary = { id: treeId, name, memberCount };

  const addMemberButton = canEdit && (
    <button
      type="button"
      disabled={atLimit}
      title={atLimit ? `This tree has reached its ${memberLimit}-member limit.` : undefined}
      onClick={() => setAdding(true)}
      className={primaryButton}
    >
      Add Member
    </button>
  );

  const switchView = (next: WorkspaceView) => {
    setSelectedId(null);
    setView(next);
  };
  const closeAdd = () => {
    setAdding(false);
    setAddLink(null);
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold" title={name}>
            {name}
          </h1>
          <p className={mutedText}>
            {memberCount} {memberCount === 1 ? "member" : "members"}
            {role === "VIEWER" && " · View only"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            role="group"
            aria-label="View"
            className="flex overflow-hidden rounded border border-gray-300 dark:border-gray-700"
          >
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => switchView("list")}
              className={segmentButton(view === "list")}
            >
              List
            </button>
            <button
              type="button"
              aria-pressed={view === "graph"}
              onClick={() => switchView("graph")}
              className={segmentButton(view === "graph")}
            >
              Graph
            </button>
          </div>
          <div className="hidden md:block">{addMemberButton}</div>
          {isOwner && (
            <button type="button" onClick={() => setActivityOpen(true)} className={secondaryButton}>
              Activity
            </button>
          )}
          <button type="button" onClick={() => setTreeDialog("share")} className={secondaryButton}>
            Share
          </button>
          {isOwner && (
            <KebabMenu
              label="Tree actions"
              items={[
                { label: "Rename tree", onSelect: () => setTreeDialog("rename") },
                { label: "Delete tree", danger: true, onSelect: () => setTreeDialog("delete") },
              ]}
            />
          )}
        </div>
      </header>

      {view === "graph" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {canEdit && (
            <div className="shrink-0 px-4 pt-3 empty:hidden">
              <PlanLimitBanner current={memberCount} limit={memberLimit} resource="members" />
            </div>
          )}
          <TreeGraph
            treeId={treeId}
            canEdit={canEdit}
            addMemberButton={addMemberButton}
            onOpenMember={(member) => setSelectedId(member.id)}
            onEdit={(member) => setSelectedId(member.id)}
            onAddRelative={(member, as) => {
              setAddLink({ member, as });
              setAdding(true);
            }}
            onDelete={setDeleteTarget}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-full min-w-0 flex-col gap-3 p-4 md:w-80 md:shrink-0 md:border-r md:border-gray-200 md:dark:border-gray-800">
            {canEdit && (
              <PlanLimitBanner current={memberCount} limit={memberLimit} resource="members" />
            )}
            {addMemberButton}
            {isLoading && <p className={mutedText}>Loading members…</p>}
            {error && (
              <div className="space-y-2">
                <p role="alert" className={errorText}>
                  {getErrorMessage(error)}
                </p>
                <button type="button" onClick={() => refetch()} className={secondaryButton}>
                  Try again
                </button>
              </div>
            )}
            {!isLoading && !error && members.length === 0 ? (
              <p className={mutedText}>No members yet.</p>
            ) : (
              <MemberList members={members} selectedId={selectedId} onSelect={setSelectedId} />
            )}
            {isLoadingMore && !isLoading && <p className={mutedText}>Loading more members…</p>}
          </aside>

          {/* On mobile the list fills the screen and the detail panel overlays it. */}
          <main
            className={
              selected
                ? "fixed inset-0 z-20 overflow-y-auto bg-background p-4 md:static md:z-auto md:flex-1 md:p-6"
                : "hidden flex-1 items-center justify-center p-6 md:flex"
            }
          >
            {selected ? (
              <MemberPanel
                key={selected.id}
                treeId={treeId}
                photoUploadsEnabled={photoUploadsEnabled}
                member={selected}
                members={members}
                canEdit={canEdit}
                onClose={() => setSelectedId(null)}
              />
            ) : (
              <p className={mutedText}>
                {members.length > 0
                  ? "Select a member to see their details."
                  : "Your family members will appear here."}
              </p>
            )}
          </main>
        </div>
      )}

      {view === "graph" && (
        <Dialog
          open={selected !== null}
          onClose={() => setSelectedId(null)}
          title={selected ? memberFullName(selected) : "Member"}
          variant="drawer"
        >
          {selected && (
            <MemberPanel
              key={selected.id}
              treeId={treeId}
              photoUploadsEnabled={photoUploadsEnabled}
              member={selected}
              members={members}
              canEdit={canEdit}
              onClose={() => setSelectedId(null)}
              hideTitle
            />
          )}
        </Dialog>
      )}

      <Dialog
        open={adding}
        onClose={closeAdd}
        title={addLink ? `Add a relative of ${memberFullName(addLink.member)}` : "Add member"}
        variant="drawer"
      >
        {atLimit ? (
          <div className="space-y-4">
            <PlanLimitBanner current={memberCount} limit={memberLimit} resource="members" />
            <button type="button" onClick={closeAdd} className={secondaryButton}>
              Close
            </button>
          </div>
        ) : (
          <MemberPanel
            treeId={treeId}
            photoUploadsEnabled={photoUploadsEnabled}
            members={members}
            canEdit
            link={addLink ?? undefined}
            onClose={closeAdd}
            onAdded={(memberId) => {
              closeAdd();
              // The list view opens the new member; the graph shows it in place.
              if (view === "list") setSelectedId(memberId);
            }}
          />
        )}
      </Dialog>

      {isOwner && (
        <Dialog
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
          title="Activity"
          variant="drawer"
        >
          <ActivityPanel treeId={treeId} onClose={() => setActivityOpen(false)} />
        </Dialog>
      )}

      {canEdit && (
        <DeleteMemberDialog
          treeId={treeId}
          member={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <ShareDialog
        tree={tree.data}
        open={treeDialog === "share"}
        onClose={() => setTreeDialog(null)}
      />

      {isOwner && (
        <>
          <RenameTreeDialog
            tree={summary}
            open={treeDialog === "rename"}
            onClose={() => setTreeDialog(null)}
          />
          <DeleteTreeDialog
            tree={summary}
            open={treeDialog === "delete"}
            onClose={() => setTreeDialog(null)}
            onDeleted={() => router.push("/dashboard")}
          />
        </>
      )}
    </div>
  );
}
