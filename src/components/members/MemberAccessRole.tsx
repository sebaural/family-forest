"use client";

import { useState } from "react";
import { errorText, inputClass, mutedText } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member } from "@/trpc/types";

const ROLE_LABEL = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" } as const;

const badge = "rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800";

/**
 * The tree role of the account a member is linked to. Everyone can see it; only
 * the tree's owner can change it.
 */
export function MemberAccessRole({ treeId, member }: { treeId: string; member: Member }) {
  const utils = trpc.useUtils();
  const tree = trpc.trees.get.useQuery({ treeId });
  const [saved, setSaved] = useState(false);
  const setRole = trpc.invitations.setRole.useMutation({
    onSuccess: () => {
      setSaved(true);
      void utils.trees.get.invalidate({ treeId });
      void utils.invitations.list.invalidate({ treeId });
    },
  });

  if (!tree.data || !member.userId) return null;
  const isTreeOwner = tree.data.owner.id === member.userId;
  const collaborator = tree.data.collaborators.find((c) => c.user.id === member.userId);
  if (!isTreeOwner && !collaborator) return null;
  const canChange = tree.data.role === "OWNER" && collaborator;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Account role</span>
        {isTreeOwner ? (
          <span className={badge}>{ROLE_LABEL.OWNER}</span>
        ) : canChange ? (
          <select
            aria-label={`Role of ${collaborator.user.name ?? collaborator.user.email}`}
            value={setRole.isPending ? setRole.variables.role : collaborator.role}
            disabled={setRole.isPending}
            onChange={(event) => {
              setSaved(false);
              setRole.mutate({
                treeId,
                userId: collaborator.user.id,
                role: event.target.value as "EDITOR" | "VIEWER",
              });
            }}
            className={`${inputClass} w-auto py-1`}
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
        ) : (
          <span className={badge}>{ROLE_LABEL[collaborator!.role]}</span>
        )}
        {collaborator && <span className={`truncate text-xs ${mutedText}`}>{collaborator.user.email}</span>}
        {canChange && (setRole.isPending || saved) && (
          <span role="status" className={`text-xs ${mutedText}`}>
            {setRole.isPending ? "Saving…" : "Saved."}
          </span>
        )}
      </div>
      {canChange && (
        <p className={`text-xs ${mutedText}`}>
          Editors can add and change people and relationships; viewers can view and add
          relationships.
        </p>
      )}
      {setRole.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(setRole.error)}
        </p>
      )}
    </div>
  );
}
