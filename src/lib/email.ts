import "server-only";
import { render } from "@react-email/render";
import { createElement } from "react";
import { Resend } from "resend";
import DigestEmail, { type DigestTree } from "@/emails/DigestEmail";
import InviteAcceptedEmail from "@/emails/InviteAcceptedEmail";
import WelcomeEmail from "@/emails/WelcomeEmail";
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

/** Absolute link into the app, for emails. */
export function appUrl(path: string): string {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

/** Renders a react-email template to HTML and plain text, then sends it. Never throws. */
async function sendTemplate(input: {
  to: string;
  subject: string;
  element: React.ReactElement;
  label: string;
}): Promise<boolean> {
  if (!resend || !env.RESEND_FROM) return false;
  try {
    const [html, text] = await Promise.all([
      render(input.element),
      render(input.element, { plainText: true }),
    ]);
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM,
      to: input.to,
      subject: input.subject,
      html,
      text,
    });
    if (error) {
      console.error(`Failed to send ${input.label} email`, error);
      return false;
    }
    console.info(`Sent ${input.label} email`, data?.id);
    return true;
  } catch (error) {
    console.error(`Failed to send ${input.label} email`, error);
    return false;
  }
}

export function sendWelcomeEmail(input: { to: string; name: string | null }): Promise<boolean> {
  return sendTemplate({
    to: input.to,
    subject: "Welcome to FamilyForest 🌳",
    label: "welcome",
    element: createElement(WelcomeEmail, { name: input.name, dashboardUrl: appUrl("/dashboard") }),
  });
}

export function sendInviteAcceptedEmail(input: {
  to: string;
  collaboratorName: string;
  treeName: string;
  treeId: string;
  role: "EDITOR" | "VIEWER";
}): Promise<boolean> {
  return sendTemplate({
    to: input.to,
    subject: `${input.collaboratorName} accepted your invitation to ${input.treeName}`,
    label: "invite-accepted",
    element: createElement(InviteAcceptedEmail, {
      collaboratorName: input.collaboratorName,
      treeName: input.treeName,
      role: input.role,
      treeUrl: appUrl(`/tree/${input.treeId}`),
      settingsUrl: appUrl("/settings/notifications"),
    }),
  });
}

export function sendDigestEmail(input: {
  to: string;
  name: string | null;
  trees: DigestTree[];
}): Promise<boolean> {
  const total = input.trees.reduce((sum, tree) => sum + tree.entries.length + tree.more, 0);
  return sendTemplate({
    to: input.to,
    subject: `Your FamilyForest digest: ${total} ${total === 1 ? "change" : "changes"}`,
    label: "digest",
    element: createElement(DigestEmail, {
      name: input.name,
      trees: input.trees,
      settingsUrl: appUrl("/settings/notifications"),
    }),
  });
}
