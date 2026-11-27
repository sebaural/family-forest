import { activityRouter } from "@/server/routers/activity";
import { approvalsRouter } from "@/server/routers/approvals";
import { invitationsRouter } from "@/server/routers/invitations";
import { membersRouter } from "@/server/routers/members";
import { relationshipsRouter } from "@/server/routers/relationships";
import { treesRouter } from "@/server/routers/trees";
import { userRouter } from "@/server/routers/user";
import { router } from "@/server/trpc";

export const appRouter = router({
  activity: activityRouter,
  trees: treesRouter,
  members: membersRouter,
  relationships: relationshipsRouter,
  users: userRouter,
  invitations: invitationsRouter,
  approvals: approvalsRouter,
});

export type AppRouter = typeof appRouter;
