"use client";

import { useState } from "react";
import { signOutAction } from "@/app/(app)/actions";
import { SettingsLoading, SettingsSection } from "@/components/settings/shared";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { dangerButton, errorText, inputClass, secondaryButton } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

function DeleteAccountDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const remove = trpc.users.deleteAccount.useMutation({
    // The account is gone: clear this device's cookie and leave the app.
    onSuccess: () => signOutAction(),
  });
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (matches) remove.mutate({ email: typed });
      }}
    >
      <p className="text-sm">
        This permanently deletes your account, every tree you own (with its members, photos and
        history) and your access to trees shared with you. It can&apos;t be undone.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Type <strong className="select-all">{email}</strong> to confirm
        </span>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={inputClass}
        />
      </label>
      {remove.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(remove.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={remove.isPending} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" disabled={!matches || remove.isPending || remove.isSuccess} className={dangerButton}>
          {(remove.isPending || remove.isSuccess) && <Spinner />}
          Delete my account
        </button>
      </div>
    </form>
  );
}

export function DangerZone() {
  const me = trpc.users.me.useQuery();
  const [open, setOpen] = useState(false);
  if (!me.data) return me.error ? <p className={errorText}>{getErrorMessage(me.error)}</p> : <SettingsLoading />;

  return (
    <SettingsSection
      legend="Delete account"
      tone="danger"
      description="Delete your account and all trees you own. Collaborators lose access to those trees."
    >
      <button type="button" onClick={() => setOpen(true)} className={dangerButton}>
        Delete my account
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <DeleteAccountDialog email={me.data.email} onClose={() => setOpen(false)} />
      </Dialog>
    </SettingsSection>
  );
}
