import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { PUBLIC_USER_SELECT, userPicture } from "@/lib/user-picture";
import {
  isEmailConfigured,
  sendApprovalRequestEmail,
  sendInviteAcceptedEmail,
  sendInviteEmail,
} from "@/lib/email";
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
import { ensureCollaboratorMember } from "@/server/collaborator-member";
import { protectedProcedure, router } from "@/server/trpc";

/** Error message the client matches to show the collaborator-cap state. */
export const COLLABORATOR_LIMIT = "COLLABORATOR_LIMIT";

const collaboratorLimitError = () =>
  new TRPCError({ code: "FORBIDDEN", message: COLLABORATOR_LIMIT });

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many unanswered invites a non-owner may have out on one tree. */
const MAX_PENDING_PER_INVITER = 10;

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
      // Anyone with access may invite. Invites from non-owners only grant viewer
      // access, and only once the owner approves the person (see approvals router).
      const { ownerId, role: myRole } = await assertTreeAccess(input.treeId, userId, "VIEWER");
      const isOwner = myRole === "OWNER";
      const role = isOwner ? input.role : "VIEWER";

      const [tree, owner, inviter, existingUser] = await Promise.all([
        db.familyTree.findUniqueOrThrow({ where: { id: input.treeId }, select: { name: true } }),
        db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true, email: true } }),
        db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
        db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      ]);

      if (owner.email.toLowerCase() === input.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: isOwner ? "You already own this tree" : "That's the tree's owner",
        });
      }
      if (!isOwner) {
        const mine = await db.invitation.count({
          where: {
            treeId: input.treeId,
            invitedById: userId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
            NOT: { email: input.email },
          },
        });
        if (mine >= MAX_PENDING_PER_INVITER) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You have too many pending invitations" });
        }
      }
      if (existingUser) {
        const already = await db.treeCollaborator.findUnique({
          where: { treeId_userId: { treeId: input.treeId, userId: existingUser.id } },
        });
        if (already) {
          throw new TRPCError({
            code: "CONFLICT",
            message: already.approvedAt
              ? "That person already has access"
              : "That person is already waiting for the owner's approval",
          });
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
            role,
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
        role,
      });
      await db.invitation.update({
        where: { id: invitation.id },
        data: { tokenHash: hashToken(token) },
      });

      const url = inviteUrl(token);
      const emailSent = await sendInviteEmail({
        to: input.email,
        treeName: tree.name,
        inviterName: inviter.name ?? inviter.email,
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
          include: {
            tree: {
              select: {
                ownerId: true,
                name: true,
                owner: { select: { email: true, inviteAcceptedNotify: true } },
              },
            },
            invitedBy: { select: { name: true, email: true } },
          },
        }),
        db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } }),
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

      // Invites sent by anyone but the owner wait for the owner's approval.
      const needsApproval = invitation.invitedById !== invitation.tree.ownerId;
      const limits = await getPlanLimits(invitation.tree.ownerId);
      const { joined, memberAdded, pendingApproval } = await db.$transaction(async (tx) => {
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
            data: {
              treeId: invitation.treeId,
              userId,
              role: invitation.role,
              approvedAt: needsApproval ? null : new Date(),
            },
          });
        }
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date(), acceptedById: userId },
        });
        // Already-approved access (e.g. a second invite) stays approved.
        const pendingApproval = existing ? !existing.approvedAt : needsApproval;
        // Give the collaborator a person node so they appear in the tree; a person
        // waiting for approval gets one when the owner agrees.
        const memberAdded = pendingApproval
          ? false
          : await ensureCollaboratorMember(tx, invitation.treeId, {
              id: userId,
              name: user.name,
              email: user.email,
            });
        return { joined: !existing, memberAdded, pendingApproval };
      });

      await broadcastTreeEvent(invitation.treeId, "access_changed");
      if (memberAdded) await broadcastTreeEvent(invitation.treeId, "members_changed");
      if (pendingApproval) {
        // An action for the owner, so it's sent whatever their notification settings.
        if (joined) {
          await sendApprovalRequestEmail({
            to: invitation.tree.owner.email,
            personName: user.name ?? user.email,
            personEmail: user.email,
            inviterName: invitation.invitedBy?.name ?? invitation.invitedBy?.email ?? "Someone",
            treeName: invitation.tree.name,
          });
        }
        return { treeId: invitation.treeId, pendingApproval: true as const };
      }
      // Only the owner sends invitations, so only the owner hears about accepts.
      if (joined && invitation.tree.owner.inviteAcceptedNotify) {
        await sendInviteAcceptedEmail({
          to: invitation.tree.owner.email,
          collaboratorName: user.name ?? user.email,
          treeName: invitation.tree.name,
          treeId: invitation.treeId,
          role: invitation.role,
        });
      }
      return { treeId: invitation.treeId, pendingApproval: false as const };
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
          select: { treeId: true, acceptedById: true, acceptedAt: true, invitedById: true },
        });
        if (!invitation) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
        treeId = invitation.treeId;
        removeUserId = invitation.acceptedById;
        const { role } = await assertTreeAccess(treeId, ctx.session.user.id, "VIEWER");
        // Others may withdraw only their own invites that nobody has used yet.
        if (
          role !== "OWNER" &&
          (invitation.invitedById !== ctx.session.user.id || invitation.acceptedAt)
        ) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to do that" });
        }
      } else {
        treeId = input.treeId;
        removeUserId = input.userId;
        await assertTreeAccess(treeId, ctx.session.user.id, "OWNER");
      }

      await db.$transaction([
        ...(input.kind === "invitation"
          ? [db.invitation.delete({ where: { id: input.invitationId } })]
          : []),
        ...(removeUserId
          ? [
              db.treeCollaborator.deleteMany({ where: { treeId, userId: removeUserId } }),
              // Their person node stays in the family tree; only the account link goes.
              db.member.updateMany({
                where: { treeId, userId: removeUserId },
                data: { userId: null },
              }),
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
      const me = ctx.session.user.id;
      const { role } = await assertTreeAccess(input.treeId, me, "VIEWER");
      const isOwner = role === "OWNER";

      const [invitations, collaborators] = await Promise.all([
        db.invitation.findMany({
          where: {
            treeId: input.treeId,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
            // Others see only the invites they sent.
            ...(isOwner ? {} : { invitedById: me }),
          },
          orderBy: { createdAt: "desc" },
        }),
        db.treeCollaborator.findMany({
          // Only the owner sees who is waiting for approval.
          where: { treeId: input.treeId, ...(isOwner ? {} : { approvedAt: { not: null } }) },
          include: { user: { select: PUBLIC_USER_SELECT } },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      return {
        isOwner,
        emailEnabled: isEmailConfigured(),
        entries: [
          ...collaborators.map((c) => ({
            key: `user:${c.userId}`,
            kind: "collaborator" as const,
            userId: c.userId,
            invitationId: null,
            email: c.user.email,
            name: c.user.name,
            image: userPicture(c.user),
            role: c.role,
            canRevoke: isOwner,
            status: c.approvedAt ? ("accepted" as const) : ("awaiting_approval" as const),
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
            /** Whether the caller may withdraw it: the owner, or whoever sent it. */
            canRevoke: isOwner || i.invitedById === me,
            invitedAt: i.createdAt,
            acceptedAt: null,
          })),
        ],
      };
    }),
});
