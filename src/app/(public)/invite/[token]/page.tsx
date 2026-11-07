import type { Route } from "next";
import Link from "next/link";
import { AcceptInvitation } from "@/app/(public)/invite/[token]/accept-invitation";
import { mutedText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashToken, verifyInviteToken } from "@/lib/invite-token";

export const metadata = { title: "Invitation · FamilyForest" };

const roleLabel = { EDITOR: "an editor", VIEWER: "a viewer" } as const;

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </main>
  );
}

function Problem({ title, message }: { title: string; message: string }) {
  return (
    <Shell title={title}>
      <p className={mutedText}>{message}</p>
      <p className={mutedText}>Ask the tree owner to send you a new invitation.</p>
      <Link href="/" className={`${secondaryButton} self-start`}>
        Go to FamilyForest
      </Link>
    </Shell>
  );
}

export default async function InvitePage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const verified = await verifyInviteToken(token);
  if (!verified.ok) {
    return verified.reason === "expired" ? (
      <Problem title="Invitation expired" message="This invitation link is more than 7 days old." />
    ) : (
      <Problem title="Invalid invitation" message="This invitation link isn't valid." />
    );
  }

  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      tree: { select: { id: true, name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });
  if (!invitation || invitation.id !== verified.claims.invitationId) {
    return (
      <Problem
        title="Invitation no longer valid"
        message="This invitation was withdrawn or replaced by a newer one."
      />
    );
  }

  const session = await auth();
  const signedInUserId = session?.user?.id;

  if (invitation.acceptedAt) {
    const isYours = signedInUserId && invitation.acceptedById === signedInUserId;
    return isYours ? (
      <Shell title="Already accepted">
        <p className={mutedText}>You already have access to {invitation.tree.name}.</p>
        <Link href={`/tree/${invitation.tree.id}` as Route} className={`${primaryButton} self-start`}>
          Open tree
        </Link>
      </Shell>
    ) : (
      <Problem title="Invitation already used" message="This invitation has already been accepted." />
    );
  }
  if (invitation.expiresAt < new Date()) {
    return <Problem title="Invitation expired" message="This invitation link is more than 7 days old." />;
  }

  const inviter = invitation.invitedBy?.name ?? invitation.invitedBy?.email ?? "Someone";
  const intro = (
    <p>
      {inviter} invited you to join <strong>{invitation.tree.name}</strong> as{" "}
      {roleLabel[invitation.role]}.
    </p>
  );

  if (!signedInUserId) {
    const callbackUrl = `/invite/${encodeURIComponent(token)}`;
    return (
      <Shell title="You're invited">
        {intro}
        <p className={mutedText}>
          Sign in as <strong>{invitation.email}</strong> to accept. New to FamilyForest? Create an
          account with that email first.
        </p>
        <div className="flex gap-2">
          <Link
            href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` as Route}
            className={primaryButton}
          >
            Sign in to accept
          </Link>
          <Link
            href={`/auth/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}` as Route}
            className={secondaryButton}
          >
            Create account
          </Link>
        </div>
      </Shell>
    );
  }

  const user = await db.user.findUnique({ where: { id: signedInUserId }, select: { email: true } });
  if (user?.email.toLowerCase() !== invitation.email) {
    return (
      <Shell title="Wrong account">
        {intro}
        <p className={mutedText}>
          This invitation was sent to <strong>{invitation.email}</strong>, but you&apos;re signed in
          as <strong>{user?.email}</strong>. Sign out and sign in with the invited account.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title="You're invited">
      {intro}
      <AcceptInvitation token={token} />
    </Shell>
  );
}
