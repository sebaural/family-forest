import { Resend } from "resend";
import { env } from "@/env";
import { INVITE_TTL_DAYS } from "@/lib/invite-token";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export function isEmailConfigured(): boolean {
  return resend !== null && !!env.RESEND_FROM;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Sends the invite email. Returns false (never throws) when email isn't configured or fails. */
export async function sendInviteEmail(input: {
  to: string;
  treeName: string;
  inviterName: string;
  url: string;
}): Promise<boolean> {
  if (!resend || !env.RESEND_FROM) return false;

  const treeName = escapeHtml(input.treeName);
  const inviter = escapeHtml(input.inviterName);
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM,
    to: input.to,
    subject: `You've been invited to ${input.treeName} on FamilyForest`,
    text: `${input.inviterName} invited you to the family tree "${input.treeName}" on FamilyForest.\n\nAccept the invitation: ${input.url}\n\nThis link expires in ${INVITE_TTL_DAYS} days.`,
    html: `<p>${inviter} invited you to the family tree <strong>${treeName}</strong> on FamilyForest.</p>
<p><a href="${escapeHtml(input.url)}">Accept the invitation</a></p>
<p style="color:#666">This link expires in ${INVITE_TTL_DAYS} days.</p>`,
  });
  if (error) {
    console.error("Failed to send invite email", error);
    return false;
  }
  return true;
}
