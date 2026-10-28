import { membersRouter } from "@/server/routers/members";
import { treesRouter } from "@/server/routers/trees";
import { router } from "@/server/trpc";

export const appRouter = router({
  trees: treesRouter,
  members: membersRouter,
});

export type AppRouter = typeof appRouter;
