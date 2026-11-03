"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { DeleteTreeDialog, RenameTreeDialog } from "@/components/trees/TreeDialogs";
import { KebabMenu } from "@/components/ui/KebabMenu";
import { mutedText, secondaryButton } from "@/components/ui/styles";
import type { TreeListItem } from "@/trpc/types";

export function TreeCard({ tree, isOwner }: { tree: TreeListItem; isOwner: boolean }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const memberCount = tree._count.members;
  const summary = { id: tree.id, name: tree.name, memberCount };

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold" title={tree.name}>
            {tree.name}
          </h2>
          <p className={mutedText}>Created {format(tree.createdAt, "MMM d, yyyy")}</p>
        </div>
        {isOwner && (
          <KebabMenu
            label={`Actions for ${tree.name}`}
            items={[
              { label: "Rename", onSelect: () => setDialog("rename") },
              { label: "Delete", danger: true, onSelect: () => setDialog("delete") },
            ]}
          />
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
          {!isOwner && <span className={mutedText}>Shared with you</span>}
        </div>
        <Link href={`/tree/${tree.id}`} className={secondaryButton}>
          Open
        </Link>
      </div>
      <RenameTreeDialog tree={summary} open={dialog === "rename"} onClose={() => setDialog(null)} />
      <DeleteTreeDialog
        tree={summary}
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onDeleted={() => setDialog(null)}
      />
    </li>
  );
}
