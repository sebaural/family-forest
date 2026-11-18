import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { memberFullName } from "@/lib/member-format";
import { CYCLE_ERROR_MESSAGE } from "@/lib/trpc-error";
import { broadcastTreeEvent } from "@/lib/realtime";
import { actorLabel, logActivity, RELATIONSHIP_NOUN, relationshipPhrase } from "@/server/activity";
import { assertTreeAccess } from "@/server/access";
import { wouldCreateCycle } from "@/server/relationship-graph";
import { protectedProcedure, router } from "@/server/trpc";

export const relationshipsRouter = router({
  add: protectedProcedure
    .input(
      z.object({
        treeId: z.cuid(),
        fromId: z.cuid(),
        toId: z.cuid(),
        type: z.enum(["PARENT_CHILD", "SPOUSE", "PARTNER"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { treeId, fromId, toId, type } = input;
      await assertTreeAccess(treeId, ctx.session.user.id, "EDITOR");

      if (fromId === toId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A person cannot be linked to themselves",
        });
      }

      const people = await db.member.findMany({
        where: { treeId, id: { in: [fromId, toId] } },
        select: { id: true, firstName: true, lastName: true },
      });
      const from = people.find((member) => member.id === fromId);
      const to = people.find((member) => member.id === toId);
      if (!from || !to) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

      if (type === "PARENT_CHILD" && (await wouldCreateCycle(treeId, fromId, toId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: CYCLE_ERROR_MESSAGE });
      }

      // SPOUSE and PARTNER are symmetric, so B→A duplicates A→B.
      const pairs =
        type === "PARENT_CHILD"
          ? [{ fromId, toId }]
          : [
              { fromId, toId },
              { fromId: toId, toId: fromId },
            ];
      const existing = await db.relationship.findFirst({
        where: { treeId, type, OR: pairs },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "This relationship already exists" });
      }

      const actor = await actorLabel(ctx.session.user.id);
      const created = await db.$transaction(async (tx) => {
        const relationship = await tx.relationship.create({ data: { treeId, fromId, toId, type } });
        await logActivity(tx, {
          treeId,
          actorId: ctx.session.user.id,
          action: "RELATIONSHIP_ADDED",
          description: `${actor} linked ${relationshipPhrase(type, from, to)}`,
        });
        return relationship;
      });
      await broadcastTreeEvent(treeId, "members_changed");
      return created;
    }),

  remove: protectedProcedure
    .input(z.object({ relationshipId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      const relationship = await db.relationship.findUnique({
        where: { id: input.relationshipId },
        select: {
          treeId: true,
          type: true,
          from: { select: { firstName: true, lastName: true } },
          to: { select: { firstName: true, lastName: true } },
        },
      });
      if (!relationship) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Relationship not found" });
      }
      await assertTreeAccess(relationship.treeId, ctx.session.user.id, "EDITOR");
      const actor = await actorLabel(ctx.session.user.id);
      const { from, to, type } = relationship;
      const between =
        type === "PARENT_CHILD"
          ? `between ${memberFullName(from)} and their child ${memberFullName(to)}`
          : `between ${memberFullName(from)} and ${memberFullName(to)}`;
      await db.$transaction(async (tx) => {
        await tx.relationship.delete({ where: { id: input.relationshipId } });
        await logActivity(tx, {
          treeId: relationship.treeId,
          actorId: ctx.session.user.id,
          action: "RELATIONSHIP_REMOVED",
          description: `${actor} removed the ${RELATIONSHIP_NOUN[type]} ${between}`,
        });
      });
      await broadcastTreeEvent(relationship.treeId, "members_changed");
      return { id: input.relationshipId };
    }),

  list: protectedProcedure.input(z.object({ treeId: z.cuid() })).query(async ({ ctx, input }) => {
    await assertTreeAccess(input.treeId, ctx.session.user.id);
    return db.relationship.findMany({ where: { treeId: input.treeId } });
  }),
});
