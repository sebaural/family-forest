import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertTreeAccess } from "@/server/access";
import { protectedProcedure, router } from "@/server/trpc";

/**
 * A new PARENT_CHILD edge fromId → toId (parent → child) closes a loop when
 * toId is already an ancestor of fromId. Walks up fromId's parents breadth-first,
 * one query per generation, scoped to the tree.
 */
async function wouldCreateCycle(treeId: string, fromId: string, toId: string): Promise<boolean> {
  const seen = new Set<string>([fromId]);
  let frontier = [fromId];

  while (frontier.length > 0) {
    const parents = await db.relationship.findMany({
      where: { treeId, type: "PARENT_CHILD", toId: { in: frontier } },
      select: { fromId: true },
    });
    const next: string[] = [];
    for (const { fromId: parentId } of parents) {
      if (parentId === toId) return true;
      if (!seen.has(parentId)) {
        seen.add(parentId);
        next.push(parentId);
      }
    }
    frontier = next;
  }
  return false;
}

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

      const inTree = await db.member.count({ where: { treeId, id: { in: [fromId, toId] } } });
      if (inTree !== 2) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

      if (type === "PARENT_CHILD" && (await wouldCreateCycle(treeId, fromId, toId))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This would make someone their own ancestor",
        });
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
        where: { type, OR: pairs },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "This relationship already exists" });
      }

      return db.relationship.create({ data: { treeId, fromId, toId, type } });
    }),

  remove: protectedProcedure
    .input(z.object({ relationshipId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      const relationship = await db.relationship.findUnique({
        where: { id: input.relationshipId },
        select: { treeId: true },
      });
      if (!relationship) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Relationship not found" });
      }
      await assertTreeAccess(relationship.treeId, ctx.session.user.id, "EDITOR");
      await db.relationship.delete({ where: { id: input.relationshipId } });
      return { id: input.relationshipId };
    }),

  list: protectedProcedure.input(z.object({ treeId: z.cuid() })).query(async ({ ctx, input }) => {
    await assertTreeAccess(input.treeId, ctx.session.user.id);
    return db.relationship.findMany({ where: { treeId: input.treeId } });
  }),
});
