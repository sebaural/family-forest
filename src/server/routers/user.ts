import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { ONBOARDING_COMPLETE } from "@/lib/onboarding";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, type PhotoContentType } from "@/lib/photo";
import { getPlan, PLAN_LIMITS } from "@/lib/plan-limits";
import {
  avatarPrefix,
  createPhotoUploadUrl,
  deleteAvatarFolder,
  deletePhotoByUrl,
  deleteTreePhotos,
} from "@/lib/r2";
import { broadcastTreeEvent } from "@/lib/realtime";
import { optimiseAvatar } from "@/server/photo-optimise";
import { protectedProcedure, router } from "@/server/trpc";

export const PASSWORD_MIN_LENGTH = 12;

const profileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
  avatarUrl: true,
  password: true,
  digestEnabled: true,
  inviteAcceptedNotify: true,
  onboardingStep: true,
  accounts: { select: { provider: true } },
} as const;

export const userRouter = router({
  /** The caller's own plan name and its limits. */
  plan: protectedProcedure.query(async ({ ctx }) => {
    const plan = await getPlan(ctx.session.user.id);
    return { plan, ...PLAN_LIMITS[plan] };
  }),

  /** The caller's profile, for the nav, settings and onboarding. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: profileSelect,
    });
    const { password, accounts, image, avatarUrl, ...rest } = user;
    return {
      ...rest,
      /** What to show: the uploaded avatar, else the OAuth provider's picture. */
      avatar: avatarUrl ?? image,
      hasUploadedAvatar: avatarUrl !== null,
      hasPassword: password !== null,
      providers: Array.from(new Set(accounts.map((account) => account.provider))),
    };
  }),

  avatarUploadUrl: protectedProcedure
    .input(
      z.object({
        contentType: z.enum(Object.keys(PHOTO_TYPES) as [PhotoContentType, ...PhotoContentType[]]),
        size: z.number().int().positive().max(PHOTO_MAX_BYTES, "Pictures must be 5 MB or smaller"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const signed = await createPhotoUploadUrl({
        folder: { userId: ctx.session.user.id },
        contentType: input.contentType,
        size: input.size,
      });
      if (!signed) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Picture uploads aren't configured" });
      }
      return signed;
    }),

  /**
   * Saves the display name and/or avatar. A new avatarUrl must be an upload from
   * avatarUploadUrl: it's resized to 128 × 128 WebP, and the previous avatar is
   * deleted. avatarUrl: null removes the avatar.
   */
  updateProfile: protectedProcedure
    .input(
      z
        .object({
          name: z.string().trim().min(1, "Enter a name").max(100).optional(),
          avatarUrl: z.url().max(500).nullable().optional(),
        })
        .refine((value) => value.name !== undefined || value.avatarUrl !== undefined, {
          message: "Nothing to update",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const current = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { avatarUrl: true },
      });

      let avatarUrl: string | null | undefined;
      if (input.avatarUrl === null) {
        avatarUrl = null;
      } else if (input.avatarUrl !== undefined) {
        const prefix = avatarPrefix(userId);
        if (!prefix || !input.avatarUrl.startsWith(prefix)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid picture" });
        }
        avatarUrl = await optimiseAvatar(userId, input.avatarUrl);
        if (!avatarUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That file couldn't be read as a picture. Try a JPEG, PNG or WebP.",
          });
        }
      }

      await db.user.update({
        where: { id: userId },
        data: { name: input.name, avatarUrl },
      });
      if (avatarUrl !== undefined && current.avatarUrl && current.avatarUrl !== avatarUrl) {
        await deletePhotoByUrl(current.avatarUrl);
      }
      if (avatarUrl !== undefined && avatarUrl !== current.avatarUrl) {
        // Trees show this picture on the user's linked members: refresh any open ones.
        const linked = await db.member.findMany({
          where: { userId },
          select: { treeId: true },
          distinct: ["treeId"],
        });
        await Promise.all(linked.map(({ treeId }) => broadcastTreeEvent(treeId, "members_changed")));
      }
      return { ok: true as const };
    }),

  changePassword: protectedProcedure
    .input(
      z
        .object({
          currentPassword: z.string().min(1, "Enter your current password").max(200),
          newPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
            .max(200),
          confirmPassword: z.string(),
        })
        .refine((value) => value.newPassword === value.confirmPassword, {
          message: "The new passwords don't match",
          path: ["confirmPassword"],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { password: true },
      });
      if (!user.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This account signs in with a provider and has no password",
        });
      }
      if (!(await bcrypt.compare(input.currentPassword, user.password))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your current password is incorrect" });
      }

      const hash = await bcrypt.hash(input.newPassword, 12);
      const { count } = await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { password: hash } });
        // Every other device must sign in again with the new password.
        return tx.userSession.updateMany({
          where: { userId, revokedAt: null, id: { not: ctx.session.user.sid } },
          data: { revokedAt: new Date() },
        });
      });
      return { signedOutSessions: count };
    }),

  /** The caller's active sessions, newest activity first. */
  sessions: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.userSession.findMany({
      where: { userId: ctx.session.user.id, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
      take: 50,
    });
    return rows.map((row) => ({ ...row, current: row.id === ctx.session.user.sid }));
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.cuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sessionId === ctx.session.user.sid) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Use Sign out to end this session" });
      }
      const { count } = await db.userSession.updateMany({
        where: { id: input.sessionId, userId: ctx.session.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return { ok: true as const };
    }),

  updateNotifications: protectedProcedure
    .input(
      z
        .object({
          digestEnabled: z.boolean().optional(),
          inviteAcceptedNotify: z.boolean().optional(),
        })
        .refine((value) => Object.values(value).some((v) => v !== undefined), {
          message: "Nothing to update",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      return db.user.update({
        where: { id: ctx.session.user.id },
        data: input,
        select: { digestEnabled: true, inviteAcceptedNotify: true },
      });
    }),

  /** Moves onboarding forward; it never goes back. */
  advanceOnboarding: protectedProcedure
    .input(z.object({ step: z.number().int().min(1).max(ONBOARDING_COMPLETE) }))
    .mutation(async ({ ctx, input }) => {
      await db.user.updateMany({
        where: { id: ctx.session.user.id, onboardingStep: { lt: input.step } },
        data: { onboardingStep: input.step },
      });
      return { ok: true as const };
    }),

  /**
   * Permanently deletes the caller's account. The typed email must match.
   * Owned trees (members, relationships, invitations, collaborators, activity)
   * cascade with the user; activity the user wrote in other trees stays, as
   * "Deleted user". Pictures are removed from R2 afterwards.
   */
  deleteAccount: protectedProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().max(320) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { ownedTreeIds, sharedTreeIds } = await db.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
        if (user.email.toLowerCase() !== input.email) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The email address doesn't match" });
        }
        const [owned, shared] = await Promise.all([
          tx.familyTree.findMany({ where: { ownerId: userId }, select: { id: true } }),
          tx.treeCollaborator.findMany({ where: { userId }, select: { treeId: true } }),
        ]);
        await tx.user.delete({ where: { id: userId } });
        return {
          ownedTreeIds: owned.map((tree) => tree.id),
          sharedTreeIds: shared.map((row) => row.treeId),
        };
      });

      for (const treeId of ownedTreeIds) await deleteTreePhotos(treeId);
      // Collaborators with a deleted tree open are sent back to their dashboard;
      // owners of trees the user had joined see the access list update.
      await Promise.all(
        [...ownedTreeIds, ...sharedTreeIds].map((treeId) => broadcastTreeEvent(treeId, "access_changed")),
      );
      await deleteAvatarFolder(userId);
      return { ok: true as const };
    }),
});
