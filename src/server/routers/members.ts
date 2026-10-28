import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getPlanLimits } from "@/lib/plan-limits";
import { assertTreeAccess } from "@/server/access";
import { protectedProcedure, router } from "@/server/trpc";

const memberInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  birthDate: z.iso.datetime().optional(),
  deathDate: z.iso.datetime().optional(),
  birthPlace: z.string().trim().max(200).optional(),
  occupation: z.string().trim().max(200).optional(),
  bio: z.string().max(5000).optional(),
  photoUrl: z.url().optional(),
});

const toDate = (value: string | undefined) => (value === undefined ? undefined : new Date(value));

async function getMemberTreeId(memberId: string): Promise<string> {
  const member = await db.member.findUnique({ where: { id: memberId }, select: { treeId: true } });
  if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  return member.treeId;
}

export const membersRouter = router({
  add: protectedProcedure
    .input(memberInput.extend({ treeId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      const { ownerId } = await assertTreeAccess(input.treeId, ctx.session.user.id, "EDITOR");

      // The member cap follows the tree owner's plan, not the editor's.
      const [limits, count] = await Promise.all([
        getPlanLimits(ownerId),
        db.member.count({ where: { treeId: input.treeId } }),
      ]);
      if (count >= limits.members) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This tree has reached its ${limits.members}-member limit. Upgrade to Pro for unlimited members.`,
        });
      }

      const { birthDate, deathDate, ...rest } = input;
      return db.member.create({
        data: { ...rest, birthDate: toDate(birthDate), deathDate: toDate(deathDate) },
      });
    }),

  get: protectedProcedure.input(z.object({ memberId: z.cuid() })).query(async ({ ctx, input }) => {
    const member = await db.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    await assertTreeAccess(member.treeId, ctx.session.user.id);
    return member;
  }),

  update: protectedProcedure
    .input(memberInput.partial().extend({ memberId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      const treeId = await getMemberTreeId(input.memberId);
      await assertTreeAccess(treeId, ctx.session.user.id, "EDITOR");

      const { memberId, birthDate, deathDate, ...rest } = input;
      return db.member.update({
        where: { id: memberId },
        data: { ...rest, birthDate: toDate(birthDate), deathDate: toDate(deathDate) },
      });
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      const treeId = await getMemberTreeId(input.memberId);
      await assertTreeAccess(treeId, ctx.session.user.id, "EDITOR");
      // Relationships referencing this member cascade.
      await db.member.delete({ where: { id: input.memberId } });
      return { id: input.memberId };
    }),

  list: protectedProcedure
    .input(
      z.object({
        treeId: z.cuid(),
        cursor: z.cuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertTreeAccess(input.treeId, ctx.session.user.id);

      const members = await db.member.findMany({
        where: { treeId: input.treeId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });
      // The extra row only signals another page; the cursor is the last row returned.
      const hasMore = members.length > input.limit;
      if (hasMore) members.pop();
      return { members, nextCursor: hasMore ? members.at(-1)?.id : undefined };
    }),
});
