import "server-only";
import type { CollabRole, Prisma } from "@prisma/client";
import { logActivity } from "@/server/activity";

/**
 * Splits an account's display name into member first/last names: the last word
 * is the surname. Without a name, the email's local part becomes the first name.
 * Keep in step with scripts/link-collaborator-members.mjs.
 */
export function splitDisplayName(name: string | null, email: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { firstName: email.split("@")[0] || email, lastName: "" };
  if (words.length === 1) return { firstName: words[0], lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] };
}

/**
 * Makes sure a collaborator has a person node in the tree, so they show on the
 * canvas and can be linked by relationships. Idempotent:
 *  - already linked (Member.userId) → nothing;
 *  - exactly one unlinked member with the same name → link it;
 *  - otherwise → create a new member.
 * The member's role is set to the account's role, so the two always agree.
 * Returns true when the tree's members changed.
 */
export async function ensureCollaboratorMember(
  tx: Prisma.TransactionClient,
  treeId: string,
  user: { id: string; name: string | null; email: string },
  role: CollabRole,
): Promise<boolean> {
  const linked = await tx.member.findFirst({ where: { treeId, userId: user.id }, select: { id: true } });
  if (linked) {
    await tx.member.update({ where: { id: linked.id }, data: { role } });
    return false;
  }

  const { firstName, lastName } = splitDisplayName(user.name, user.email);
  const sameName = await tx.member.findMany({
    where: {
      treeId,
      userId: null,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
    select: { id: true },
    take: 2,
  });

  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  if (sameName.length === 1) {
    await tx.member.update({ where: { id: sameName[0].id }, data: { userId: user.id, role } });
    return false;
  }

  await tx.member.create({ data: { treeId, firstName, lastName, userId: user.id, role } });
  await logActivity(tx, {
    treeId,
    actorId: user.id,
    action: "MEMBER_ADDED",
    description: `${fullName} joined the tree`,
  });
  return true;
}
