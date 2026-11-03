"use client";

import Link from "next/link";
import { useState } from "react";
import { TreeCard } from "@/components/trees/TreeCard";
import { CreateTreeModal } from "@/components/trees/TreeDialogs";
import { errorText, mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

export function TreeDashboard({
  userId,
  treeNotFound,
}: {
  userId: string;
  treeNotFound: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const trees = trpc.trees.list.useQuery();
  const plan = trpc.user.plan.useQuery();

  // The tree cap counts trees the user owns, not trees shared with them.
  const ownedCount = trees.data?.filter((tree) => tree.ownerId === userId).length ?? 0;
  const atTreeLimit = plan.data ? ownedCount >= plan.data.trees : false;
  const limitMessage = plan.data
    ? `Your plan includes ${plan.data.trees} ${plan.data.trees === 1 ? "tree" : "trees"}. Upgrade to Pro to create more.`
    : undefined;
  const canCreate = !!plan.data && !!trees.data && !atTreeLimit;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8">
      {treeNotFound && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          That tree doesn&apos;t exist or you don&apos;t have access to it.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Your trees</h1>
        {/* Disabled buttons don't reliably show a title, so the wrapper carries it. */}
        <span title={atTreeLimit ? limitMessage : undefined}>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => setCreateOpen(true)}
            className={primaryButton}
          >
            New Tree
          </button>
        </span>
      </div>

      {atTreeLimit && (
        <p className={mutedText}>
          {limitMessage}{" "}
          <Link href="/pricing" className="underline">
            See plans
          </Link>
        </p>
      )}

      {trees.isPending && <p className={mutedText}>Loading your trees…</p>}

      {trees.error && (
        <div className="space-y-2">
          <p role="alert" className={errorText}>
            {getErrorMessage(trees.error)}
          </p>
          <button type="button" onClick={() => trees.refetch()} className={secondaryButton}>
            Try again
          </button>
        </div>
      )}

      {trees.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center dark:border-gray-700">
          <h2 className="text-lg font-semibold">No family trees yet</h2>
          <p className={`mb-4 mt-1 ${mutedText}`}>Start by creating a tree for your family.</p>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => setCreateOpen(true)}
            className={primaryButton}
          >
            Create your first tree
          </button>
        </div>
      )}

      {!!trees.data?.length && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trees.data.map((tree) => (
            <TreeCard key={tree.id} tree={tree} isOwner={tree.ownerId === userId} />
          ))}
        </ul>
      )}

      <CreateTreeModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </main>
  );
}
