import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";
import {
  hashToken,
  INVITE_TTL_DAYS,
  inviteUrl,
  signInviteToken,
  verifyInviteToken,
} from "@/lib/invite-token";
import { getPlanLimits } from "@/lib/plan-limits";
import { broadcastTreeEvent } from "@/lib/realtime";
import { assertTreeAccess } from "@/server/access";
import { protectedProcedure, router } from "@/server/trpc";

/** Error message the client matches to show the collaborator-cap state. */
export const COLLABORATOR_LIMIT = "COLLABORATOR_LIMIT";

const collaboratorLimitError = () =>
  new TRPCError({ code: "FORBIDDEN", message: COLLABORATOR_LIMIT });

const DAY_MS = 24 * 60 * 60 * 1000;

export const invitationsRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        treeId: z.cuid(),
        email: z.email().trim().toLowerCase(),
        role: z.enum(["EDITOR", "VIEWER"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { ownerId } = await assertTreeAccess(input.treeId, userId, "OWNER");

      const [tree, owner, existingUser] = await Promise.all([
        db.familyTree.findUniqueOrThrow({ where: { id: input.treeId }, select: { name: true } }),
        db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true, email: true } }),
        db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      ]);

      if (owner.email.toLowerCase() === input.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this tree" });
      }
      if (existingUser) {
        const already = await db.treeCollaborator.findUnique({
          where: { treeId_userId: { treeId: input.treeId, userId: existingUser.id } },
        });
        if (already) {
          throw new TRPCError({ code: "CONFLICT", message: "That person already has access" });
        }
      }

      // The cap follows the tree owner's plan, not the inviter's.
      const [limits, collaborators] = await Promise.all([
        getPlanLimits(ownerId),
        db.treeCollaborator.count({ where: { treeId: input.treeId } }),
      ]);
      if (collaborators >= limits.collaborators) throw collaboratorLimitError();

      // A new invite replaces any pending one for the same address.
      const invitation = await db.$transaction(async (tx) => {
        await tx.invitation.deleteMany({
          where: { treeId: input.treeId, email: input.email, acceptedAt: null },
        });
        return tx.invitation.create({
          data: {
            treeId: input.treeId,
            email: input.email,
            role: input.role,
            // Replaced with the real hash once the token (which embeds the id) is signed.
            tokenHash: `pending:${crypto.randomUUID()}`,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS),
            invitedById: userId,
          },
        });
      });

      const token = await signInviteToken({
        invitationId: invitation.id,
        treeId: input.treeId,
        role: input.role,
      });
      await db.invitation.update({
        where: { id: invitation.id },
        data: { tokenHash: hashToken(token) },
      });

      const url = inviteUrl(token);
      const emailSent = await sendInviteEmail({
        to: input.email,
        treeName: tree.name,
        inviterName: owner.name ?? owner.email,
        url,
      });

      return { ok: true as const, emailSent, inviteUrl: url };
    }),

  accept: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const verified = await verifyInviteToken(input.token);
      if (!verified.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            verified.reason === "expired" ? "This invitation has expired" : "Invalid invitation link",
        });
      }

      const [invitation, user] = await Promise.all([
        db.invitation.findUnique({
          where: { tokenHash: hashToken(input.token) },
          include: { tree: { select: { ownerId: true } } },
        }),
        db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      ]);
      if (!invitation || invitation.id !== verified.claims.invitationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This invitation is no longer valid" });
      }
      if (invitation.acceptedAt) {
        throw new TRPCError({ code: "CONFLICT", message: "This invitation has already been used" });
      }
      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invitation has expired" });
      }
      if (user.email.toLowerCase() !== invitation.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.`,
        });
      }
      if (invitation.tree.ownerId === userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already own this tree" });
      }

      const limits = await getPlanLimits(invitation.tree.ownerId);
      await db.$transaction(async (tx) => {
        // Lock the tree row so concurrent accepts can't both slip under the cap.
        await tx.$queryRaw`SELECT id FROM "FamilyTree" WHERE id = ${invitation.treeId} FOR UPDATE`;

        // Re-read inside the lock: a parallel accept of this same link may have won.
        const fresh = await tx.invitation.findUnique({
          where: { id: invitation.id },
          select: { acceptedAt: true },
        });
        if (!fresh || fresh.acceptedAt) {
          throw new TRPCError({ code: "CONFLICT", message: "This invitation has already been used" });
        }

        const existing = await tx.treeCollaborator.findUnique({
          where: { treeId_userId: { treeId: invitation.treeId, userId } },
        });
        if (!existing) {
          const count = await tx.treeCollaborator.count({ where: { treeId: invitation.treeId } });
          if (count >= limits.collaborators) throw collaboratorLimitError();
          await tx.treeCollaborator.create({
            data: { treeId: invitation.treeId, userId, role: invitation.role },
          });
        }
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date(), acceptedById: userId },
        });
      });

      await broadcastTreeEvent(invitation.treeId, "access_changed");
      return { treeId: invitation.treeId };
    }),

  revoke: protectedProcedure
    .input(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("invitation"), invitationId: z.cuid() }),
        z.object({ kind: z.literal("collaborator"), treeId: z.cuid(), userId: z.cuid() }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      let treeId: string;
      let removeUserId: string | null;

      if (input.kind === "invitation") {
        const invitation = await db.invitation.findUnique({
          where: { id: input.invitationId },
          select: { treeId: true, acceptedById: true },
        });
        if (!invitation) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
        treeId = invitation.treeId;
        removeUserId = invitation.acceptedById;
      } else {
        treeId = input.treeId;
        removeUserId = input.userId;
      }
      await assertTreeAccess(treeId, ctx.session.user.id, "OWNER");

      await db.$transaction([
        ...(input.kind === "invitation"
          ? [db.invitation.delete({ where: { id: input.invitationId } })]
          : []),
        ...(removeUserId
          ? [
              db.treeCollaborator.deleteMany({ where: { treeId, userId: removeUserId } }),
              // Accepted invites for that person go too, so the list stays consistent.
              db.invitation.deleteMany({ where: { treeId, acceptedById: removeUserId } }),
            ]
          : []),
      ]);

      await broadcastTreeEvent(treeId, "access_changed");
      return { ok: true as const };
    }),

  list: protectedProcedure
    .input(z.object({ treeId: z.cuid() }))
    .query(async ({ ctx, input }) => {
      await assertTreeAccess(input.treeId, ctx.session.user.id, "OWNER");

      const userSelect = { id: true, name: true, email: true, image: true } satisfies Prisma.UserSelect;
      const [invitations, collaborators] = await Promise.all([
        db.invitation.findMany({
          where: { treeId: input.treeId, acceptedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        }),
        db.treeCollaborator.findMany({
          where: { treeId: input.treeId },
          include: { user: { select: userSelect } },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      return {
        emailEnabled: isEmailConfigured(),
        entries: [
          ...collaborators.map((c) => ({
            key: `user:${c.userId}`,
            kind: "collaborator" as const,
            userId: c.userId,
            invitationId: null,
            email: c.user.email,
            name: c.user.name,
            image: c.user.image,
            role: c.role,
            status: "accepted" as const,
            invitedAt: null,
            acceptedAt: c.createdAt,
          })),
          ...invitations.map((i) => ({
            key: `invite:${i.id}`,
            kind: "invitation" as const,
            userId: null,
            invitationId: i.id,
            email: i.email,
            name: null,
            image: null,
            role: i.role,
            status: "pending" as const,
            invitedAt: i.createdAt,
            acceptedAt: null,
          })),
        ],
      };
    }),
});
