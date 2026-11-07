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
    onSuccess: ({ treeId }) => {
      void utils.trees.list.invalidate();
      router.push(`/tree/${treeId}` as Route);
    },
  });

  const error =
    accept.error?.message === "COLLABORATOR_LIMIT"
      ? "This tree has reached its collaborator limit. Ask the owner to upgrade or remove someone."
      : accept.error && getErrorMessage(accept.error);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={accept.isPending || accept.isSuccess}
        onClick={() => accept.mutate({ token })}
        className={`${primaryButton} self-start`}
      >
        {(accept.isPending || accept.isSuccess) && <Spinner />}
        Accept Invitation
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
    </div>
  );
}
