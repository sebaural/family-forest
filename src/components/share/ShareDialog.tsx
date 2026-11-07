"use client";

import { useState } from "react";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import {
  errorText,
  inputClass,
  mutedText,
  primaryButton,
  secondaryButton,
} from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { TreeDetails } from "@/trpc/types";

type Role = "EDITOR" | "VIEWER";

const roleLabel = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" } as const;

function Avatar({ name, email, image }: { name: string | null; email: string; image: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar hosts vary
      <img src={image} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full" />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold uppercase dark:bg-gray-800"
    >
      {(name ?? email).charAt(0)}
    </span>
  );
}

function PersonRow({
  name,
  email,
  image,
  role,
  status,
  action,
}: {
  name: string | null;
  email: string;
  image: string | null;
  role: keyof typeof roleLabel;
  status?: "pending" | "accepted";
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={name} email={email} image={image} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name ?? email}</p>
        {name && <p className={`truncate text-xs ${mutedText}`}>{email}</p>}
      </div>
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">{roleLabel[role]}</span>
      {status && (
        <span
          className={
            status === "pending"
              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          }
        >
          {status === "pending" ? "Pending" : "Accepted"}
        </span>
      )}
      {action}
    </li>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={url} aria-label="Invite link" className={`${inputClass} text-xs`} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className={secondaryButton}
        onClick={() => {
          void navigator.clipboard.writeText(url).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : "Copy invite link"}
      </button>
    </div>
  );
}

function OwnerView({ tree }: { tree: TreeDetails }) {
  const utils = trpc.useUtils();
  const access = trpc.invitations.list.useQuery({ treeId: tree.id });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [sent, setSent] = useState<{ email: string; url: string; emailSent: boolean } | null>(null);

  const refresh = () => {
    void utils.invitations.list.invalidate({ treeId: tree.id });
    void utils.trees.get.invalidate({ treeId: tree.id });
  };
  const send = trpc.invitations.send.useMutation({
    onSuccess: (result, variables) => {
      setSent({ email: variables.email, url: result.inviteUrl, emailSent: result.emailSent });
      setEmail("");
      refresh();
    },
  });
  const revoke = trpc.invitations.revoke.useMutation({ onSuccess: refresh });

  const collaboratorCount = tree.collaborators.length;
  const atCap = collaboratorCount >= tree.collaboratorLimit;
  const sendError =
    send.error?.message === "COLLABORATOR_LIMIT"
      ? "This tree has reached its collaborator limit."
      : send.error && getErrorMessage(send.error);

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSent(null);
          send.mutate({ treeId: tree.id, email, role });
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Invite by email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={inputClass}
          />
        </label>
        <div className="flex gap-2">
          <select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={`${inputClass} w-auto`}
          >
            <option value="EDITOR">Editor</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button type="submit" disabled={atCap || send.isPending} className={primaryButton}>
            {send.isPending && <Spinner />}
            Send invite
          </button>
        </div>
        <PlanLimitBanner
          current={collaboratorCount}
          limit={tree.collaboratorLimit}
          resource="collaborators"
        />
        {sendError && (
          <p role="alert" className={errorText}>
            {sendError}
          </p>
        )}
        {sent && (
          <div role="status" className="space-y-2">
            <p className={mutedText}>
              {sent.emailSent
                ? `Invite emailed to ${sent.email}. You can also share the link:`
                : `Invite created for ${sent.email}. Send them this link:`}
            </p>
            <CopyLink url={sent.url} />
            <p className={`text-xs ${mutedText}`}>
              The link expires in 7 days and only works for {sent.email}.
            </p>
          </div>
        )}
      </form>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">People with access</h3>
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          <PersonRow name={tree.owner.name} email={tree.owner.email} image={tree.owner.image} role="OWNER" />
          {access.data?.entries.map((entry) => (
            <PersonRow
              key={entry.key}
              name={entry.name}
              email={entry.email}
              image={entry.image}
              role={entry.role}
              status={entry.status}
              action={
                <button
                  type="button"
                  disabled={revoke.isPending}
                  aria-label={`Remove ${entry.name ?? entry.email}`}
                  onClick={() =>
                    revoke.mutate(
                      entry.kind === "invitation"
                        ? { kind: "invitation", invitationId: entry.invitationId }
                        : { kind: "collaborator", treeId: tree.id, userId: entry.userId },
                    )
                  }
                  className="text-sm text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              }
            />
          ))}
        </ul>
        {access.isPending && <p className={mutedText}>Loading…</p>}
        {access.error && (
          <p role="alert" className={errorText}>
            {getErrorMessage(access.error)}
          </p>
        )}
        {revoke.error && (
          <p role="alert" className={errorText}>
            {getErrorMessage(revoke.error)}
          </p>
        )}
      </section>
    </div>
  );
}

function ReadOnlyView({ tree }: { tree: TreeDetails }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold">People with access</h3>
      <ul className="divide-y divide-gray-200 dark:divide-gray-800">
        <PersonRow name={tree.owner.name} email={tree.owner.email} image={tree.owner.image} role="OWNER" />
        {tree.collaborators.map((c) => (
          <PersonRow key={c.user.id} name={c.user.name} email={c.user.email} image={c.user.image} role={c.role} />
        ))}
      </ul>
      <p className={`pt-2 text-xs ${mutedText}`}>Only the owner can invite or remove people.</p>
    </section>
  );
}

export function ShareDialog({
  tree,
  open,
  onClose,
}: {
  tree: TreeDetails;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Share “${tree.name}”`}>
      {tree.role === "OWNER" ? <OwnerView tree={tree} /> : <ReadOnlyView tree={tree} />}
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
