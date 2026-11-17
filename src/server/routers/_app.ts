import { activityRouter } from "@/server/routers/activity";
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
  user: userRouter,
  invitations: invitationsRouter,
});

export type AppRouter = typeof appRouter;
