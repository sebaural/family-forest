"use client";

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { SettingsLoading, SettingsSection } from "@/components/settings/shared";
import { Spinner } from "@/components/ui/Spinner";
import { errorText, inputClass, mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { describeUserAgent } from "@/lib/user-agent";
import { trpc } from "@/trpc/client";

const PROVIDER_NAMES: Record<string, string> = { github: "GitHub", google: "Google" };
const PASSWORD_MIN_LENGTH = 12;

function PasswordForm() {
  const utils = trpc.useUtils();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [localError, setLocalError] = useState<string | null>(null);
  const change = trpc.users.changePassword.useMutation({
    onSuccess: () => {
      setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
      void utils.users.sessions.invalidate();
    },
  });

  const field = (key: keyof typeof values, label: string, autoComplete: string, hint?: string) => (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-sm font-medium">{label}</span>
        <input
          type="password"
          required
          autoComplete={autoComplete}
          value={values[key]}
          minLength={key === "currentPassword" ? undefined : PASSWORD_MIN_LENGTH}
          aria-describedby={hint ? `${key}-hint` : undefined}
          onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
          className={inputClass}
        />
      </label>
      {hint && (
        <p id={`${key}-hint`} className={`text-xs ${mutedText}`}>
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <form
      className="max-w-sm space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setLocalError(null);
        change.reset();
        if (values.newPassword !== values.confirmPassword) {
          setLocalError("The new passwords don't match.");
          return;
        }
        change.mutate(values);
      }}
    >
      {field("currentPassword", "Current password", "current-password")}
      {field("newPassword", "New password", "new-password", `At least ${PASSWORD_MIN_LENGTH} characters.`)}
      {field("confirmPassword", "Confirm new password", "new-password")}
      <button type="submit" disabled={change.isPending} className={primaryButton}>
        {change.isPending && <Spinner />}
        Change password
      </button>
      <div role="status" className={mutedText}>
        {change.data &&
          `Password changed.${
            change.data.signedOutSessions > 0
              ? ` Signed out ${change.data.signedOutSessions} other ${change.data.signedOutSessions === 1 ? "session" : "sessions"}.`
              : ""
          }`}
      </div>
      {(localError || change.error) && (
        <p role="alert" className={errorText}>
          {localError ?? getErrorMessage(change.error!)}
        </p>
      )}
    </form>
  );
}

function SessionsList() {
  const utils = trpc.useUtils();
  const sessions = trpc.users.sessions.useQuery();
  const revoke = trpc.users.revokeSession.useMutation({
    onSuccess: () => utils.users.sessions.invalidate(),
  });

  if (!sessions.data) {
    return sessions.error ? <p className={errorText}>{getErrorMessage(sessions.error)}</p> : <SettingsLoading />;
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-200 dark:divide-gray-800" aria-label="Active sessions">
        {sessions.data.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {describeUserAgent(session.userAgent)}
                {session.current && (
                  <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                    This device
                  </span>
                )}
              </p>
              <p className={`text-xs ${mutedText}`}>
                {session.ip ?? "Unknown IP"} · Signed in {formatDistanceToNow(session.createdAt, { addSuffix: true })} · Last
                seen {formatDistanceToNow(session.lastSeenAt, { addSuffix: true })}
              </p>
            </div>
            {!session.current && (
              <button
                type="button"
                disabled={revoke.isPending && revoke.variables?.sessionId === session.id}
                onClick={() => revoke.mutate({ sessionId: session.id })}
                className={secondaryButton}
                aria-label={`Sign out ${describeUserAgent(session.userAgent)}, last seen ${formatDistanceToNow(session.lastSeenAt, { addSuffix: true })}`}
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {revoke.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(revoke.error)}
        </p>
      )}
    </div>
  );
}

export function SecuritySettings() {
  const me = trpc.users.me.useQuery();
  if (!me.data) return me.error ? <p className={errorText}>{getErrorMessage(me.error)}</p> : <SettingsLoading />;

  const providers = me.data.providers.map((id) => PROVIDER_NAMES[id] ?? id);
  return (
    <div className="space-y-6">
      {me.data.hasPassword ? (
        <SettingsSection
          legend="Password"
          description="Changing your password signs you out on every other device."
        >
          <PasswordForm />
        </SettingsSection>
      ) : (
        <SettingsSection legend="Sign-in method">
          <p className="text-sm">
            You sign in with <strong>{providers.join(" and ") || "a provider"}</strong>, so there&apos;s no
            FamilyForest password to change.
          </p>
        </SettingsSection>
      )}
      {me.data.hasPassword && providers.length > 0 && (
        <SettingsSection legend="Linked accounts">
          <p className="text-sm">You can also sign in with {providers.join(" and ")}.</p>
        </SettingsSection>
      )}
      <SettingsSection
        legend="Active sessions"
        description="Devices signed in to your account. Signing one out takes effect on its next page load."
      >
        <SessionsList />
      </SettingsSection>
    </div>
  );
}
