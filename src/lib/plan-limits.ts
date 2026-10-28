import { db } from "@/lib/db";

const PLAN_LIMITS = {
  FREE: { trees: 1, members: 50, collaborators: 2 },
  PRO: { trees: Infinity, members: Infinity, collaborators: 20 },
  FAMILY: { trees: Infinity, members: Infinity, collaborators: Infinity },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
export type PlanLimits = (typeof PLAN_LIMITS)[PlanName];

export async function getPlanLimits(userId: string): Promise<PlanLimits> {
  const sub = await db.subscription.findUnique({ where: { userId }, select: { plan: true } });
  const plan: PlanName = sub?.plan ?? "FREE";
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
}
