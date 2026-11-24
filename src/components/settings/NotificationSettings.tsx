"use client";

import { SettingsLoading, SettingsSection } from "@/components/settings/shared";
import { errorText, mutedText } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

type Key = "digestEnabled" | "inviteAcceptedNotify";

const OPTIONS: { key: Key; label: string; description: string }[] = [
  {
    key: "digestEnabled",
    label: "Daily activity digest email",
    description: "Once a day (08:00 UTC), a summary of changes others made in your trees. Skipped when nothing changed.",
  },
  {
    key: "inviteAcceptedNotify",
    label: "Email me when someone accepts my invitation",
    description: "Sent when a relative you invited joins one of your trees.",
  },
];

/** Each switch saves as soon as it changes; there's no submit button. */
export function NotificationSettings() {
  const utils = trpc.useUtils();
  const me = trpc.users.me.useQuery();
  const update = trpc.users.updateNotifications.useMutation({
    onMutate: async (input) => {
      await utils.users.me.cancel();
      const previous = utils.users.me.getData();
      utils.users.me.setData(undefined, (old) => (old ? { ...old, ...input } : old));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) utils.users.me.setData(undefined, context.previous);
    },
    onSettled: () => utils.users.me.invalidate(),
  });

  if (!me.data) return me.error ? <p className={errorText}>{getErrorMessage(me.error)}</p> : <SettingsLoading />;
  const data = me.data;

  return (
    <SettingsSection legend="Email notifications" description="Changes are saved automatically.">
      <ul className="space-y-4">
        {OPTIONS.map((option) => {
          const checked = data[option.key];
          const descriptionId = `${option.key}-description`;
          return (
            <li key={option.key} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span id={`${option.key}-label`} className="block text-sm font-medium">
                  {option.label}
                </span>
                <span id={descriptionId} className={`block text-xs ${mutedText}`}>
                  {option.description}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={`${option.key}-label`}
                aria-describedby={descriptionId}
                onClick={() => update.mutate({ [option.key]: !checked })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  checked ? "bg-emerald-700" : "bg-gray-400 dark:bg-gray-600"
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    checked ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className={`text-xs ${mutedText}`}>
        {update.isPending ? "Saving…" : update.isSuccess ? "Saved." : ""}
      </p>
      {update.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(update.error)}
        </p>
      )}
    </SettingsSection>
  );
}
