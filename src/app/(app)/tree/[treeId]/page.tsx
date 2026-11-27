import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TreeWorkspace } from "@/components/tree/TreeWorkspace";
import { db } from "@/lib/db";
import { getRealtimeClientConfig } from "@/lib/realtime";
import { MEMBERS_PAGE_SIZE, viewCookieName } from "@/lib/tree-workspace";
import { sessionExpiredPath } from "@/server/session";
import { serverClient } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Family tree · FamilyForest",
  description: "View and edit your family tree with relatives.",
};

export default async function TreePage({ params }: { params: { treeId: string } }) {
  const { treeId } = params;
  // Fetched here, in parallel, so the tree renders without waiting on client
  // requests after hydration. The client cache is seeded with these.
  let initialData;
  try {
    const [tree, membersPage, relationships] = await Promise.all([
      serverClient.trees.get({ treeId }),
      serverClient.members.list({ treeId, limit: MEMBERS_PAGE_SIZE }),
      serverClient.relationships.list({ treeId }),
    ]);
    initialData = { tree, membersPage, relationships };
  } catch (error) {
    // The layout runs in parallel, so this page can meet a stale session first.
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      redirect(sessionExpiredPath(`/tree/${treeId}`));
    }
    // NOT_FOUND covers trees the caller can't access; BAD_REQUEST a malformed id.
    if (error instanceof TRPCError && (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")) {
      // Waiting for the owner's approval: the dashboard says so.
      const session = await auth();
      const awaiting =
        error.code === "NOT_FOUND" &&
        session?.user &&
        (await db.treeCollaborator.findFirst({
          where: { treeId, userId: session.user.id, approvedAt: null },
          select: { treeId: true },
        }));
      redirect(awaiting ? "/dashboard" : "/dashboard?error=tree-not-found");
    }
    throw error;
  }

  const savedView = cookies().get(viewCookieName(treeId))?.value;
  const initialView = savedView === "graph" || savedView === "list" ? savedView : null;

  return (
    <TreeWorkspace
      treeId={treeId}
      realtime={getRealtimeClientConfig()}
      initialData={initialData}
      initialView={initialView}
    />
  );
}
