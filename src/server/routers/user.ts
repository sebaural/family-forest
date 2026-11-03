import { getPlanLimits } from "@/lib/plan-limits";
import { protectedProcedure, router } from "@/server/trpc";

export const userRouter = router({
  plan: protectedProcedure.query(({ ctx }) => getPlanLimits(ctx.session.user.id)),
});
