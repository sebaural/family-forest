import { createTRPCContext } from "@/server/context";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

export const serverClient = createCallerFactory(appRouter)(createTRPCContext);
