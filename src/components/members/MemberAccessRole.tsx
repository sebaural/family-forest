"use client";

import { useState } from "react";
import { errorText, inputClass, mutedText } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member } from "@/trpc/types";

type Role = "EDITOR" | "VIEWER";

const ROLE_LABEL = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" } as const;

const badge = "rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800";

/**
 * Every member's role. Everyone can see it; only the tree's owner can change it.
 * For a member linked to a collaborator it's that account's role (what grants
 * access); otherwise it's stored on the member and applies if they ever join.
 */
export function MemberAccessRole({ treeId, member }: { treeId: string; member: Member }) {
  const utils = trpc.useUtils();
  const tree = trpc.trees.get.useQuery({ treeId });
  const [saved, setSaved] = useState(false);
  const setRole = trpc.members.setRole.useMutation({
    onSuccess: () => {
      setSaved(true);
      void utils.members.list.invalidate({ treeId });
      void utils.trees.get.invalidate({ treeId });
      void utils.invitations.list.invalidate({ treeId });
    },
  });

  if (!tree.data) return null;
  const isTreeOwner = Boolean(member.userId) && tree.data.owner.id === member.userId;
  const collaborator = member.userId
    ? tree.data.collaborators.find((c) => c.user.id === member.userId)
    : undefined;
  const role: Role = collaborator?.role ?? member.role;
  const canChange = tree.data.role === "OWNER" && !isTreeOwner;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Role</span>
        {isTreeOwner ? (
          <span className={badge}>{ROLE_LABEL.OWNER}</span>
        ) : canChange ? (
          <select
            aria-label={`Role of ${member.firstName} ${member.lastName}`.trim()}
            value={setRole.isPending ? setRole.variables.role : role}
            disabled={setRole.isPending}
            onChange={(event) => {
              setSaved(false);
              setRole.mutate({ memberId: member.id, role: event.target.value as Role });
            }}
            className={`${inputClass} w-auto py-1`}
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
        ) : (
          <span className={badge}>{ROLE_LABEL[role]}</span>
        )}
        {collaborator && <span className={`truncate text-xs ${mutedText}`}>{collaborator.user.email}</span>}
        {canChange && (setRole.isPending || saved) && (
          <span role="status" className={`text-xs ${mutedText}`}>
            {setRole.isPending ? "Saving…" : "Saved."}
          </span>
        )}
      </div>
      {!isTreeOwner && !collaborator && (
        <p className={`text-xs ${mutedText}`}>No account — applies if they ever join.</p>
      )}
      {canChange && collaborator && (
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
