import { z } from "zod";
import { db } from "@/lib/db";
import { assertTreeAccess } from "@/server/access";
import { protectedProcedure, router } from "@/server/trpc";

export const ACTIVITY_LIMIT = 50;

export const activityRouter = router({
  /** The 50 newest entries, newest first. Every role can read them. */
  list: protectedProcedure.input(z.object({ treeId: z.cuid() })).query(async ({ ctx, input }) => {
    await assertTreeAccess(input.treeId, ctx.session.user.id);
    const entries = await db.activityLog.findMany({
      where: { treeId: input.treeId },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        action: true,
        description: true,
        createdAt: true,
        actor: { select: { name: true, email: true, image: true } },
      },
    });
    return entries.map(({ actor, ...entry }) => ({
      ...entry,
      actorName: actor ? actor.name?.trim() || actor.email : "Deleted user",
      actorImage: actor?.image ?? null,
    }));
  }),
});
