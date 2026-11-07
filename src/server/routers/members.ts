import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoContentType } from "@/lib/photo";
import { getPlanLimits } from "@/lib/plan-limits";
import { broadcastTreeEvent } from "@/lib/realtime";
import { createPhotoUploadUrl, deletePhotoByUrl, treePhotoPrefix } from "@/lib/r2";
import { assertTreeAccess } from "@/server/access";
import { protectedProcedure, router } from "@/server/trpc";

const memberInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  birthDate: z.iso.datetime().optional(),
  deathDate: z.iso.datetime().optional(),
  birthPlace: z.string().trim().max(200).optional(),
  bio: z.string().max(5000).optional(),
  photoUrl: z.url().max(500).optional(),
});

// On update, undefined leaves a field unchanged and null clears it.
const memberUpdateInput = memberInput.partial().extend({
  memberId: z.cuid(),
  birthDate: memberInput.shape.birthDate.nullable(),
  deathDate: memberInput.shape.deathDate.nullable(),
  birthPlace: memberInput.shape.birthPlace.nullable(),
  bio: memberInput.shape.bio.nullable(),
  photoUrl: memberInput.shape.photoUrl.nullable(),
});

function toDate(value: string | undefined): Date | undefined;
function toDate(value: string | null | undefined): Date | null | undefined;
function toDate(value: string | null | undefined) {
  return value == null ? value : new Date(value);
}

async function getMemberRef(memberId: string) {
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { treeId: true, photoUrl: true },
  });
  if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
  return member;
}

// Pictures must be ones uploaded for this tree, so a member can't point at arbitrary URLs.
function assertTreePhoto(treeId: string, photoUrl: string | null | undefined) {
  if (photoUrl == null) return;
  const prefix = treePhotoPrefix(treeId);
  if (!prefix || !photoUrl.startsWith(prefix)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid picture URL" });
  }
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

      assertTreePhoto(input.treeId, input.photoUrl);

      const { birthDate, deathDate, ...rest } = input;
      const created = await db.member.create({
        data: { ...rest, birthDate: toDate(birthDate), deathDate: toDate(deathDate) },
      });
      await broadcastTreeEvent(input.treeId, "members_changed");
      return created;
    }),

  get: protectedProcedure.input(z.object({ memberId: z.cuid() })).query(async ({ ctx, input }) => {
    const member = await db.member.findUnique({ where: { id: input.memberId } });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    await assertTreeAccess(member.treeId, ctx.session.user.id);
    return member;
  }),

  update: protectedProcedure
    .input(memberUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await getMemberRef(input.memberId);
      await assertTreeAccess(existing.treeId, ctx.session.user.id, "EDITOR");
      assertTreePhoto(existing.treeId, input.photoUrl);

      const { memberId, birthDate, deathDate, ...rest } = input;
      const updated = await db.member.update({
        where: { id: memberId },
        data: { ...rest, birthDate: toDate(birthDate), deathDate: toDate(deathDate) },
      });
      // A replaced or cleared picture is no longer referenced.
      if (input.photoUrl !== undefined && existing.photoUrl !== updated.photoUrl) {
        await deletePhotoByUrl(existing.photoUrl);
      }
      await broadcastTreeEvent(existing.treeId, "members_changed");
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getMemberRef(input.memberId);
      await assertTreeAccess(existing.treeId, ctx.session.user.id, "EDITOR");
      // Relationships referencing this member cascade.
      await db.member.delete({ where: { id: input.memberId } });
      await deletePhotoByUrl(existing.photoUrl);
      await broadcastTreeEvent(existing.treeId, "members_changed");
      return { id: input.memberId };
    }),

  /**
   * Signs a direct browser-to-R2 upload. The returned publicUrl is then saved as
   * the member's photoUrl through add or update.
   */
  photoUploadUrl: protectedProcedure
    .input(
      z.object({
        treeId: z.cuid(),
        contentType: z.enum(Object.keys(PHOTO_TYPES) as [PhotoContentType, ...PhotoContentType[]]),
        size: z
          .number()
          .int()
          .positive()
          .max(PHOTO_MAX_BYTES, "Pictures must be 5 MB or smaller"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertTreeAccess(input.treeId, ctx.session.user.id, "EDITOR");
      const signed = await createPhotoUploadUrl(input);
      if (!signed) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Picture uploads aren't configured",
        });
      }
      return signed;
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
