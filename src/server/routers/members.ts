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
import { protectedProcedure, router } from "@/server/trpc";
import { RELATIVE_NOUN, relativeEdge } from "@/lib/relationship-kind";
import { addEdge, buildKinship, kindError, NEW_MEMBER_ID, subjectView } from "@/lib/relationship-rules";

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

/**
 * Adds each member's account picture (when the member is linked to an account), so
 * the tree shows the same picture as that person's header.
 */
async function withAccountPhotos<T extends { userId: string | null }>(
  members: T[],
): Promise<(T & { accountPhotoUrl: string | null })[]> {
  const userIds = Array.from(new Set(members.flatMap((member) => (member.userId ? [member.userId] : []))));
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, avatarUrl: true, image: true },
      })
    : [];
  const photoById = new Map(users.map((user) => [user.id, user.avatarUrl ?? user.image]));
  return members.map((member) => ({
    ...member,
    accountPhotoUrl: (member.userId && photoById.get(member.userId)) || null,
  }));
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
        /** The caller is adding themselves: link the new member to their account. */
        isSelf: z.boolean().optional(),
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
      const [targets, edges] = links.length
        ? await Promise.all([
            db.member.findMany({
              where: { id: { in: links.map((link) => link.memberId) }, treeId: input.treeId },
              select: { id: true, firstName: true, lastName: true, birthDate: true },
            }),
            db.relationship.findMany({
              where: { treeId: input.treeId },
              select: { type: true, fromId: true, toId: true },
            }),
          ])
        : [[], []];
      if (targets.length !== links.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      const targetById = new Map(targets.map((target) => [target.id, target]));

      // Check each link with the rules the Add relationship dialog applies, counting the
      // links before it, so e.g. a child that is an ancestor of a parent (a loop) fails.
      const kinship = buildKinship(edges);
      const newMember = { id: NEW_MEMBER_ID, birthDate: input.birthDate ?? null };
      for (const link of links) {
        const target = targetById.get(link.memberId)!;
        const ruleError = kindError(subjectView(kinship, target), newMember, link.as);
        if (ruleError) throw new TRPCError({ code: "BAD_REQUEST", message: ruleError });
        addEdge(kinship, relativeEdge(link.as, target.id, NEW_MEMBER_ID));
      }

      const actor = await actorLabel(userId);
      const { treeId, firstName, lastName, birthPlace, bio, birthDate, deathDate } = input;
      const photoUrl = input.photoUrl && (await optimiseMemberPhoto(treeId, input.photoUrl));
      // An account is at most one person per tree.
      const selfUserId =
        input.isSelf && !(await db.member.findFirst({ where: { treeId, userId }, select: { id: true } }))
          ? userId
          : null;
      const created = await db.$transaction(async (tx) => {
        const member = await tx.member.create({
          data: {
            treeId,
            userId: selfUserId,
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
    const [withPhoto] = await withAccountPhotos([member]);
    return withPhoto;
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

  /** Marks a member as the caller themselves ("This is me"), or undoes it. */
  linkSelf: protectedProcedure
    .input(z.object({ memberId: z.cuid(), linked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const member = await db.member.findUnique({
        where: { id: input.memberId },
        select: { id: true, treeId: true, userId: true, firstName: true, lastName: true },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      await assertTreeAccess(member.treeId, userId, "EDITOR");

      if (input.linked && member.userId && member.userId !== userId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This member is already linked to someone else's account",
        });
      }
      if (!input.linked && member.userId !== userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This member isn't linked to you" });
      }
      if (input.linked && member.userId === userId) return { ok: true as const };

      const actor = await actorLabel(userId);
      await db.$transaction(async (tx) => {
        if (input.linked) {
          // An account is at most one person per tree: move the link here.
          await tx.member.updateMany({
            where: { treeId: member.treeId, userId },
            data: { userId: null },
          });
        }
        await tx.member.update({
          where: { id: member.id },
          data: { userId: input.linked ? userId : null },
        });
        await logActivity(tx, {
          treeId: member.treeId,
          actorId: userId,
          action: "MEMBER_UPDATED",
          description: input.linked
            ? `${actor} marked ${memberLabel(member)} as themselves`
            : `${actor} unlinked themselves from ${memberLabel(member)}`,
        });
      });
      await broadcastTreeEvent(member.treeId, "members_changed");
      return { ok: true as const };
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
      return {
        members: await withAccountPhotos(members),
        nextCursor: hasMore ? members.at(-1)?.id : undefined,
      };
    }),
});
