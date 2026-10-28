import { membersRouter } from "@/server/routers/members";
import { relationshipsRouter } from "@/server/routers/relationships";
import { treesRouter } from "@/server/routers/trees";
import { router } from "@/server/trpc";

export const appRouter = router({
  trees: treesRouter,
  members: membersRouter,
  relationships: relationshipsRouter,
});

export type AppRouter = typeof appRouter;
