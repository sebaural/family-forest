"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MemberPanel } from "@/components/members/MemberPanel";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import { MemberList } from "@/components/tree/MemberList";
import { DeleteTreeDialog, RenameTreeDialog } from "@/components/trees/TreeDialogs";
import { Dialog } from "@/components/ui/Dialog";
import { KebabMenu } from "@/components/ui/KebabMenu";
import { errorText, mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { useTreeMembers } from "@/hooks/useTreeMembers";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

export function TreeWorkspace({ treeId }: { treeId: string }) {
  const router = useRouter();
  const tree = trpc.trees.get.useQuery({ treeId });
  const { members, isLoading, isLoadingMore, error, refetch } = useTreeMembers(treeId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [treeDialog, setTreeDialog] = useState<"rename" | "delete" | null>(null);

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
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden md:block">{addMemberButton}</div>
          {isOwner && (
            <KebabMenu
              label="Tree actions"
              items={[
                { label: "Rename tree", onSelect: () => setTreeDialog("rename") },
                { label: "Delete tree", danger: true, onSelect: () => setTreeDialog("delete") },
                { label: "Share (coming soon)", disabled: true },
              ]}
            />
          )}
        </div>
      </header>

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

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add member" variant="drawer">
        {atLimit ? (
          <div className="space-y-4">
            <PlanLimitBanner current={memberCount} limit={memberLimit} resource="members" />
            <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>
              Close
            </button>
          </div>
        ) : (
          <MemberPanel
            treeId={treeId}
            photoUploadsEnabled={photoUploadsEnabled}
            members={members}
            canEdit
            onClose={() => setAdding(false)}
            onAdded={(memberId) => {
              setAdding(false);
              setSelectedId(memberId);
            }}
          />
        )}
      </Dialog>

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
