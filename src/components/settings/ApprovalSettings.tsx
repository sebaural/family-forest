"use client";

import { format } from "date-fns";
import { SettingsLoading, SettingsSection } from "@/components/settings/shared";
import { errorText, mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

/** People invited by a collaborator, waiting for the tree owner to agree or decline. */
export function ApprovalSettings() {
  const utils = trpc.useUtils();
  const pending = trpc.approvals.list.useQuery();
  const decide = trpc.approvals.decide.useMutation({
    onSuccess: (_result, { treeId }) => {
      void utils.approvals.list.invalidate();
      void utils.approvals.count.invalidate();
      void utils.trees.get.invalidate({ treeId });
      void utils.invitations.list.invalidate({ treeId });
    },
  });

  return (
    <SettingsSection
      legend="People waiting for approval"
      description="People invited by others to your trees can't see a tree until you agree. Declining removes only their access to that tree."
    >
      {pending.isPending && <SettingsLoading />}
      {pending.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(pending.error)}
        </p>
      )}
      {pending.data?.length === 0 && <p className={mutedText}>No one is waiting for approval.</p>}

      <ul className="divide-y divide-gray-200 dark:divide-gray-800">
        {pending.data?.map((entry) => {
          const busy = decide.isPending && decide.variables?.userId === entry.user.id;
          return (
            <li key={entry.key} className="flex flex-wrap items-center gap-3 py-3">
              {entry.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar hosts vary
                <img
                  src={entry.user.image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold uppercase dark:bg-gray-800"
                >
                  {(entry.user.name ?? entry.user.email).charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {entry.user.name ?? entry.user.email}
                  {entry.user.name && <span className={`ml-2 font-normal ${mutedText}`}>{entry.user.email}</span>}
                </p>
                <p className={`text-xs ${mutedText}`}>
                  {entry.invitedBy ? `Invited by ${entry.invitedBy}` : "Invited"} to{" "}
                  <strong>{entry.treeName}</strong> · {format(entry.requestedAt, "MMM d, yyyy")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ treeId: entry.treeId, userId: entry.user.id, approve: true })}
                  className={primaryButton}
                >
                  {busy && decide.variables?.approve ? "Agreeing…" : "Agree"}
                </button>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ treeId: entry.treeId, userId: entry.user.id, approve: false })}
                  className={secondaryButton}
                >
                  {busy && !decide.variables?.approve ? "Declining…" : "Decline"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {decide.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(decide.error)}
        </p>
      )}
    </SettingsSection>
  );
}
