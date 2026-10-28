import { treesRouter } from "@/server/routers/trees";
import { router } from "@/server/trpc";

export const appRouter = router({
  trees: treesRouter,
});

export type AppRouter = typeof appRouter;
