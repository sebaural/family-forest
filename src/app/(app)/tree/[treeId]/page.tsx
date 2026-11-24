import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TreeWorkspace } from "@/components/tree/TreeWorkspace";
import { getRealtimeClientConfig } from "@/lib/realtime";
import { sessionExpiredPath } from "@/server/session";
import { serverClient } from "@/trpc/server";

export const metadata: Metadata = {
  title: "Family tree · FamilyForest",
  description: "View and edit your family tree with relatives.",
};

export default async function TreePage({ params }: { params: { treeId: string } }) {
  try {
    await serverClient.trees.get({ treeId: params.treeId });
  } catch (error) {
    // The layout runs in parallel, so this page can meet a stale session first.
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      redirect(sessionExpiredPath(`/tree/${params.treeId}`));
    }
    // NOT_FOUND covers trees the caller can't access; BAD_REQUEST a malformed id.
    if (error instanceof TRPCError && (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")) {
      redirect("/dashboard?error=tree-not-found");
    }
    throw error;
  }

  return <TreeWorkspace treeId={params.treeId} realtime={getRealtimeClientConfig()} />;
}
