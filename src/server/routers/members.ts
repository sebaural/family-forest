import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoContentType } from "@/lib/photo";
import { getPlanLimits } from "@/lib/plan-limits";
import { broadcastTreeEvent } from "@/lib/realtime";
import { createPhotoUploadUrl, deletePhotoByUrl, treePhotoPrefix } from "@/lib/r2";
import { actorLabel, logActivity, memberLabel } from "@/server/activity";
import { assertTreeAccess } from "@/server/access";
import { MEMBER_PHOTO_SIZE, optimisePhoto } from "@/server/photo-optimise";
import { wouldCreateCycle } from "@/server/relationship-graph";
import { protectedProcedure, router } from "@/server/trpc";
import { RELATIVE_NOUN, relativeEdge } from "@/lib/relationship-kind";
import { CYCLE_ERROR_MESSAGE } from "@/lib/trpc-error";

/** Most relationships a new member can be created with. */
const MAX_LINKS = 20;

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
    select: { treeId: true, photoUrl: true, firstName: true, lastName: true },
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

/**
 * Resizes a newly uploaded picture to a small WebP (and deletes the original).
 * A URL some member already uses is kept as is: optimising it would delete
 * that member's picture.
 */
async function optimiseMemberPhoto(treeId: string, photoUrl: string): Promise<string> {
  const inUse = await db.member.count({ where: { treeId, photoUrl } });
  if (inUse > 0) return photoUrl;
  const optimised = await optimisePhoto({
    folder: { treeId },
    originalUrl: photoUrl,
    size: MEMBER_PHOTO_SIZE,
  });
  if (!optimised) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That file couldn't be read as a picture. Try a JPEG, PNG or WebP.",
    });
  }
  return optimised;
}

export const membersRouter = router({
  add: protectedProcedure
    .input(
      memberInput.extend({
        treeId: z.cuid(),
        /** Links the new member to existing ones in the same transaction. */
        links: z
          .array(
            z.object({
              memberId: z.cuid(),
              /** What the new member is to memberId. */
              as: z.enum(["PARENT", "CHILD", "SPOUSE", "PARTNER"]),
            }),
          )
          .max(MAX_LINKS)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { ownerId } = await assertTreeAccess(input.treeId, userId, "EDITOR");

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

      const links = input.links ?? [];
      if (new Set(links.map((link) => link.memberId)).size !== links.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Each family member can only be linked once",
        });
      }
      const targets = links.length
        ? await db.member.findMany({
            where: { id: { in: links.map((link) => link.memberId) }, treeId: input.treeId },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
      if (targets.length !== links.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      const targetById = new Map(targets.map((target) => [target.id, target]));

      // The new member sits between its parents and its children, so a child that is
      // already an ancestor of one of its parents would close a loop.
      const parentIds = links.filter((link) => link.as === "CHILD").map((link) => link.memberId);
      const childIds = links.filter((link) => link.as === "PARENT").map((link) => link.memberId);
      for (const parentId of parentIds) {
        for (const childId of childIds) {
          if (await wouldCreateCycle(input.treeId, parentId, childId)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: CYCLE_ERROR_MESSAGE });
          }
        }
      }

      const actor = await actorLabel(userId);
      const { treeId, firstName, lastName, birthPlace, bio, birthDate, deathDate } = input;
      const photoUrl = input.photoUrl && (await optimiseMemberPhoto(treeId, input.photoUrl));
      const created = await db.$transaction(async (tx) => {
        const member = await tx.member.create({
          data: {
            treeId,
            firstName,
            lastName,
            birthPlace,
            bio,
            photoUrl,
            birthDate: toDate(birthDate),
            deathDate: toDate(deathDate),
          },
        });
        let description = `${actor} added ${memberLabel(member, true)}`;
        const phrases: string[] = [];
        for (const link of links) {
          const target = targetById.get(link.memberId)!;
          // "The new member is link.as of target" = "target's relative is the new member".
          const edge = relativeEdge(link.as, target.id, member.id);
          await tx.relationship.create({ data: { treeId: input.treeId, ...edge } });
          phrases.push(`${RELATIVE_NOUN[link.as]} of ${memberLabel(target)}`);
        }
        if (phrases.length) description += ` as ${phrases.join(", ")}`;
        await logActivity(tx, { treeId: input.treeId, actorId: userId, action: "MEMBER_ADDED", description });
        return member;
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

      const actor = await actorLabel(ctx.session.user.id);
      const { memberId, birthDate, deathDate, ...rest } = input;
      if (rest.photoUrl && rest.photoUrl !== existing.photoUrl) {
        rest.photoUrl = await optimiseMemberPhoto(existing.treeId, rest.photoUrl);
      }
      const updated = await db.$transaction(async (tx) => {
        const member = await tx.member.update({
          where: { id: memberId },
          data: { ...rest, birthDate: toDate(birthDate), deathDate: toDate(deathDate) },
        });
        const renamed = memberLabel(existing) !== memberLabel(member);
        await logActivity(tx, {
          treeId: existing.treeId,
          actorId: ctx.session.user.id,
          action: "MEMBER_UPDATED",
          description: renamed
            ? `${actor} updated ${memberLabel(existing)} (now ${memberLabel(member)})`
            : `${actor} updated ${memberLabel(member)}`,
        });
        return member;
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
      const actor = await actorLabel(ctx.session.user.id);
      // Relationships referencing this member cascade.
      await db.$transaction(async (tx) => {
        await tx.member.delete({ where: { id: input.memberId } });
        await logActivity(tx, {
          treeId: existing.treeId,
          actorId: ctx.session.user.id,
          action: "MEMBER_DELETED",
          description: `${actor} removed ${memberLabel(existing)}`,
        });
      });
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
      const signed = await createPhotoUploadUrl({
        folder: { treeId: input.treeId },
        contentType: input.contentType,
        size: input.size,
      });
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
