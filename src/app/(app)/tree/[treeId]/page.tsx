import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
import { TreeWorkspace } from "@/components/tree/TreeWorkspace";
import { serverClient } from "@/trpc/server";

export default async function TreePage({ params }: { params: { treeId: string } }) {
  try {
    await serverClient.trees.get({ treeId: params.treeId });
  } catch (error) {
    // NOT_FOUND covers trees the caller can't access; BAD_REQUEST a malformed id.
    if (error instanceof TRPCError && (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")) {
      redirect("/dashboard?error=tree-not-found");
    }
    throw error;
  }

  return <TreeWorkspace treeId={params.treeId} />;
}
