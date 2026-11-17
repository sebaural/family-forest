import { getPlan, PLAN_LIMITS } from "@/lib/plan-limits";
import { protectedProcedure, router } from "@/server/trpc";

export const userRouter = router({
  /** The caller's own plan name and its limits. */
  plan: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getPlan(ctx.session.user.id);
    return { plan, ...PLAN_LIMITS[plan] };
  }),
});
