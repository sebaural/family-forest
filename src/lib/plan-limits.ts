import { db } from "@/lib/db";

export const PLAN_LIMITS = {
  FREE: { trees: 1, members: 25, collaborators: 2 },
  PRO: { trees: Infinity, members: Infinity, collaborators: 20 },
  FAMILY: { trees: Infinity, members: Infinity, collaborators: Infinity },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
export type PlanLimits = (typeof PLAN_LIMITS)[PlanName];

export async function getPlan(userId: string): Promise<PlanName> {
  const sub = await db.subscription.findUnique({ where: { userId }, select: { plan: true } });
  const plan = sub?.plan ?? "FREE";
  return plan in PLAN_LIMITS ? plan : "FREE";
}

export async function getPlanLimits(userId: string): Promise<PlanLimits> {
  return PLAN_LIMITS[await getPlan(userId)];
}
