import "server-only";
import { db } from "@/lib/db";
import { deleteTreePhotos, listTreePhotoFolders } from "@/lib/r2";

/**
 * Removes the picture folders of trees that no longer exist. trees.delete already
 * cleans up, but an upload URL signed just before the delete stays valid for a few
 * minutes and can land afterwards; this sweep catches those and any failed cleanup.
 */
export async function sweepDeletedTreePhotos(): Promise<{ folders: number; removed: string[] }> {
  const folderIds = await listTreePhotoFolders();
  if (folderIds.length === 0) return { folders: 0, removed: [] };

  const live = await db.familyTree.findMany({
    where: { id: { in: folderIds } },
    select: { id: true },
  });
  const liveIds = new Set(live.map((tree) => tree.id));
  const removed = folderIds.filter((id) => !liveIds.has(id));
  for (const treeId of removed) await deleteTreePhotos(treeId);
  return { folders: folderIds.length, removed };
}
