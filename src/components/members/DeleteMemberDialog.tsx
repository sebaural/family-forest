"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { dangerButton, errorText, secondaryButton } from "@/components/ui/styles";
import { memberFullName } from "@/lib/member-format";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member } from "@/trpc/types";

/** Confirms, then removes a member (its relationships cascade). */
export function DeleteMemberDialog({
  treeId,
  member,
  onClose,
}: {
  treeId: string;
  member: Member | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const removeMember = trpc.members.remove.useMutation({
    onSuccess: () => {
      void utils.members.list.invalidate({ treeId });
      void utils.relationships.list.invalidate({ treeId });
      void utils.trees.get.invalidate({ treeId });
      void utils.trees.list.invalidate();
      void utils.activity.list.invalidate({ treeId });
      onClose();
    },
  });

  return (
    <Dialog open={member !== null} onClose={onClose} title="Delete member">
      {member && (
        <div className="space-y-4">
          <p className="text-sm">
            Remove <strong>{memberFullName(member)}</strong> and all of their links from this tree?
          </p>
          {removeMember.error && (
            <p role="alert" className={errorText}>
              {getErrorMessage(removeMember.error)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={removeMember.isPending}
              onClick={() => removeMember.mutate({ memberId: member.id })}
              className={dangerButton}
            >
              {removeMember.isPending && <Spinner />}
              Delete
            </button>
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
