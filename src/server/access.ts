import { TRPCError } from "@trpc/server";
import { db } from "@/lib/db";

const ROLE_RANK = { VIEWER: 0, EDITOR: 1, OWNER: 2 } as const;

export type TreeRole = keyof typeof ROLE_RANK;

/**
 * Resolves the caller's role on a tree. Callers with no access get NOT_FOUND
 * (so tree ids don't leak); callers whose role is below `minRole` get FORBIDDEN.
 */
export async function assertTreeAccess(
  treeId: string,
  userId: string,
  minRole: TreeRole = "VIEWER",
): Promise<{ ownerId: string; role: TreeRole }> {
  const tree = await db.familyTree.findUnique({
    where: { id: treeId },
    select: { ownerId: true, collaborators: { where: { userId }, select: { role: true } } },
  });

  const role: TreeRole | undefined =
    tree?.ownerId === userId ? "OWNER" : tree?.collaborators[0]?.role;
  if (!tree || !role) throw new TRPCError({ code: "NOT_FOUND", message: "Tree not found" });

  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to do that" });
  }
  return { ownerId: tree.ownerId, role };
}
