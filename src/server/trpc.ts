import { initTRPC, TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import superjson from "superjson";
import { sessionIsActive } from "@/server/session";

export interface TRPCContext {
  session: Session | null;
}

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
  // A JWT can outlive its user or be signed out elsewhere; the client sends these to /api/session-expired.
  if (!(await sessionIsActive(ctx.session.user.id, ctx.session.user.sid))) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session expired" });
  }
  // Narrow the session so procedures can use ctx.session.user.id directly.
  return next({ ctx: { ...ctx, session: ctx.session } });
});
