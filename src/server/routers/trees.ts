import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPlanLimits } from "@/lib/plan-limits";
import { assertTreeAccess } from "@/server/access";
import { protectedProcedure, router } from "@/server/trpc";

const treeId = z.cuid();
const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(1000);

export const treesRouter = router({
  create: protectedProcedure
    .input(z.object({ name, description: description.optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [limits, owned] = await Promise.all([
        getPlanLimits(userId),
        db.familyTree.count({ where: { ownerId: userId } }),
      ]);
      if (owned >= limits.trees) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Upgrade to Pro to create more trees" });
      }
      return db.familyTree.create({
        data: { name: input.name, description: input.description, ownerId: userId },
      });
    }),

  list: protectedProcedure.query(({ ctx }) => {
    const userId = ctx.session.user.id;
    return db.familyTree.findMany({
      where: { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: protectedProcedure.input(z.object({ treeId })).query(async ({ ctx, input }) => {
    await assertTreeAccess(input.treeId, ctx.session.user.id);
    return db.familyTree.findUniqueOrThrow({
      where: { id: input.treeId },
      include: {
        members: {
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        },
        collaborators: {
          select: {
            role: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });
  }),

  update: protectedProcedure
    .input(
      z.object({
        treeId,
        name: name.optional(),
        // null clears the description
        description: description.nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreeAccess(input.treeId, ctx.session.user.id, "OWNER");
      return db.familyTree.update({
        where: { id: input.treeId },
        data: { name: input.name, description: input.description },
      });
    }),

  delete: protectedProcedure.input(z.object({ treeId })).mutation(async ({ ctx, input }) => {
    await assertTreeAccess(input.treeId, ctx.session.user.id, "OWNER");
    // Members, relationships, invitations and collaborators cascade.
    await db.familyTree.delete({ where: { id: input.treeId } });
    return { id: input.treeId };
  }),
});
