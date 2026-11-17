import "server-only";
import type { Prisma, RelType } from "@prisma/client";
import { db } from "@/lib/db";
import { formatLifeYears, memberFullName } from "@/lib/member-format";

export const ACTIVITY_ACTIONS = [
  "MEMBER_ADDED",
  "MEMBER_UPDATED",
  "MEMBER_DELETED",
  "RELATIONSHIP_ADDED",
  "RELATIONSHIP_REMOVED",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

type MemberLabel = {
  firstName: string;
  lastName: string;
  birthDate?: Date | null;
  deathDate?: Date | null;
};

/** The acting user's display name, snapshotted into the description. */
export async function actorLabel(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return user?.name?.trim() || user?.email || "Someone";
}

/** "Jane Doe (1942–2018)", or just "Jane Doe" without known dates. */
export function memberLabel(member: MemberLabel, withYears = false): string {
  const name = memberFullName(member);
  if (!withYears) return name;
  const years = formatLifeYears(member.birthDate ?? null, member.deathDate ?? null);
  return years ? `${name} (${years})` : name;
}

/** "Jane Doe as parent of Bob Doe" / "Jane Doe and Bob Doe as spouses". */
export function relationshipPhrase(type: RelType, from: MemberLabel, to: MemberLabel): string {
  if (type === "PARENT_CHILD") return `${memberLabel(from)} as parent of ${memberLabel(to)}`;
  const kind = type === "SPOUSE" ? "spouses" : "partners";
  return `${memberLabel(from)} and ${memberLabel(to)} as ${kind}`;
}

export const RELATIONSHIP_NOUN: Record<RelType, string> = {
  PARENT_CHILD: "parent link",
  SPOUSE: "spouse link",
  PARTNER: "partner link",
};

/** Writes an entry inside the caller's transaction, so it commits with the change. */
export function logActivity(
  tx: Prisma.TransactionClient,
  entry: { treeId: string; actorId: string; action: ActivityAction; description: string },
) {
  return tx.activityLog.create({ data: entry });
}
