import "server-only";
import { db } from "@/lib/db";

/**
 * A new PARENT_CHILD edge fromId → toId (parent → child) closes a loop when
 * toId is already an ancestor of fromId. Walks up fromId's parents breadth-first,
 * one query per generation, scoped to the tree.
 */
export async function wouldCreateCycle(
  treeId: string,
  fromId: string,
  toId: string,
): Promise<boolean> {
  const seen = new Set<string>([fromId]);
  let frontier = [fromId];

  while (frontier.length > 0) {
    const parents = await db.relationship.findMany({
      where: { treeId, type: "PARENT_CHILD", toId: { in: frontier } },
      select: { fromId: true },
    });
    const next: string[] = [];
    for (const { fromId: parentId } of parents) {
      if (parentId === toId) return true;
      if (!seen.has(parentId)) {
        seen.add(parentId);
        next.push(parentId);
      }
    }
    frontier = next;
  }
  return false;
}
