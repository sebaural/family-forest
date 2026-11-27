"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { errorText, primaryButton } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const accept = trpc.invitations.accept.useMutation({
    onSuccess: ({ treeId, pendingApproval }) => {
      void utils.trees.list.invalidate();
      // Invites from anyone but the owner wait for the owner's approval first.
      if (!pendingApproval) router.push(`/tree/${treeId}` as Route);
    },
  });

  const error =
    accept.error?.message === "COLLABORATOR_LIMIT"
      ? "This tree has reached its collaborator limit. Ask the owner to upgrade or remove someone."
      : accept.error && getErrorMessage(accept.error);

  return (
    <div className="space-y-3">
      {!accept.data?.pendingApproval && (
        <button
          type="button"
          disabled={accept.isPending || accept.isSuccess}
          onClick={() => accept.mutate({ token })}
          className={`${primaryButton} self-start`}
        >
          {(accept.isPending || accept.isSuccess) && <Spinner />}
          Accept Invitation
        </button>
      )}
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      {accept.data?.pendingApproval && (
        <p role="status" className="text-sm">
          Thanks! The tree&apos;s owner has been asked to approve you. We&apos;ll email you when you
          have access.
        </p>
      )}
    </div>
  );
}
