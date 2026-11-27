import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { userPicture } from "@/lib/user-picture";
import { sendAccessApprovedEmail } from "@/lib/email";
import { broadcastTreeEvent } from "@/lib/realtime";
import { assertTreeAccess } from "@/server/access";
import { ensureCollaboratorMember } from "@/server/collaborator-member";
import { protectedProcedure, router } from "@/server/trpc";

/**
 * People who accepted an invite sent by someone other than the owner wait here
 * (TreeCollaborator.approvedAt null, no access) until the owner agrees or declines.
 */
export const approvalsRouter = router({
  /** Everyone waiting on trees the caller owns, oldest first. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const pending = await db.treeCollaborator.findMany({
      where: { approvedAt: null, tree: { ownerId: ctx.session.user.id } },
      orderBy: { createdAt: "asc" },
      select: {
        treeId: true,
        createdAt: true,
        tree: { select: { name: true } },
        user: { select: { id: true, name: true, email: true, image: true, avatarUrl: true } },
      },
    });
    if (pending.length === 0) return [];

    // Who sent each invite, from the invitation the person accepted.
    const invitations = await db.invitation.findMany({
      where: {
        OR: pending.map((entry) => ({ treeId: entry.treeId, acceptedById: entry.user.id })),
      },
      orderBy: { acceptedAt: "desc" },
      select: {
        treeId: true,
        acceptedById: true,
        invitedBy: { select: { name: true, email: true } },
      },
    });
    const inviterOf = new Map<string, string>();
    for (const invitation of invitations) {
      const key = `${invitation.treeId}:${invitation.acceptedById}`;
      if (!inviterOf.has(key) && invitation.invitedBy) {
        inviterOf.set(key, invitation.invitedBy.name ?? invitation.invitedBy.email);
      }
    }

    return pending.map((entry) => ({
      key: `${entry.treeId}:${entry.user.id}`,
      treeId: entry.treeId,
      treeName: entry.tree.name,
      user: {
        id: entry.user.id,
        name: entry.user.name,
        email: entry.user.email,
        image: userPicture(entry.user),
      },
      invitedBy: inviterOf.get(`${entry.treeId}:${entry.user.id}`) ?? null,
      requestedAt: entry.createdAt,
    }));
  }),

  /** How many are waiting, for the settings badge. */
  count: protectedProcedure.query(({ ctx }) =>
    db.treeCollaborator.count({
      where: { approvedAt: null, tree: { ownerId: ctx.session.user.id } },
    }),
  ),

  decide: protectedProcedure
    .input(z.object({ treeId: z.cuid(), userId: z.cuid(), approve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { treeId, userId } = input;
      await assertTreeAccess(treeId, ctx.session.user.id, "OWNER");

      const pending = await db.treeCollaborator.findUnique({
        where: { treeId_userId: { treeId, userId } },
        select: {
          approvedAt: true,
          role: true,
          tree: { select: { name: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
      if (!pending || pending.approvedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This request has already been answered" });
      }

      if (!input.approve) {
        // Only the pending access goes; the person's account is theirs to keep.
        await db.$transaction([
          db.treeCollaborator.delete({ where: { treeId_userId: { treeId, userId } } }),
          db.invitation.deleteMany({ where: { treeId, acceptedById: userId } }),
        ]);
        await broadcastTreeEvent(treeId, "access_changed");
        return { ok: true as const };
      }

      const memberAdded = await db.$transaction(async (tx) => {
        await tx.treeCollaborator.update({
          where: { treeId_userId: { treeId, userId } },
          data: { approvedAt: new Date() },
        });
        return ensureCollaboratorMember(tx, treeId, pending.user, pending.role);
      });
      await broadcastTreeEvent(treeId, "access_changed");
      if (memberAdded) await broadcastTreeEvent(treeId, "members_changed");
      await sendAccessApprovedEmail({ to: pending.user.email, treeName: pending.tree.name, treeId });
      return { ok: true as const };
    }),
});
