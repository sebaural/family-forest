import "server-only";
import { db } from "@/lib/db";
import {
  deleteAvatarFolder,
  deletePhotoByUrl,
  deleteTreePhotos,
  listAvatarFolders,
  listFolderPhotos,
  listTreePhotoFolders,
} from "@/lib/r2";

/** An upload must be this old before the sweep may treat it as abandoned. */
export const UNSAVED_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  treeFolders: number;
  removedTreeFolders: string[];
  avatarFolders: number;
  removedAvatarFolders: string[];
  /** Unsaved uploads deleted from live trees and users. */
  removedPhotos: number;
  /** Public URLs of those uploads. */
  removedPhotoUrls: string[];
  /** True when nothing was deleted, only reported. */
  dryRun: boolean;
}

/**
 * Removes pictures nothing points to:
 * - folders of trees and users that no longer exist (an upload URL signed just
 *   before a delete stays valid for a few minutes and can land afterwards);
 * - uploads older than `maxAgeMs` in live folders that no member photo or user
 *   avatar uses (picked in a form that was then cancelled, or replaced).
 */
export async function sweepPhotos(
  options: { maxAgeMs?: number; dryRun?: boolean } = {},
): Promise<SweepResult> {
  const { maxAgeMs = UNSAVED_UPLOAD_MAX_AGE_MS, dryRun = false } = options;
  const cutoff = Date.now() - maxAgeMs;
  const isOld = (lastModified: Date | null) => lastModified !== null && lastModified.getTime() < cutoff;

  const [treeIds, userIds] = await Promise.all([listTreePhotoFolders(), listAvatarFolders()]);
  const removedPhotoUrls: string[] = [];
  const removePhoto = async (url: string) => {
    removedPhotoUrls.push(url);
    if (!dryRun) await deletePhotoByUrl(url);
  };

  // Trees
  const liveTrees = await db.familyTree.findMany({
    where: { id: { in: treeIds } },
    select: { id: true, members: { where: { photoUrl: { not: null } }, select: { photoUrl: true } } },
  });
  const liveTreeIds = new Set(liveTrees.map((tree) => tree.id));
  const removedTreeFolders = treeIds.filter((id) => !liveTreeIds.has(id));
  if (!dryRun) for (const treeId of removedTreeFolders) await deleteTreePhotos(treeId);

  for (const tree of liveTrees) {
    const used = new Set(tree.members.map((member) => member.photoUrl));
    for (const photo of await listFolderPhotos({ treeId: tree.id })) {
      if (!used.has(photo.url) && isOld(photo.lastModified)) await removePhoto(photo.url);
    }
  }

  // Avatars
  const liveUsers = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, avatarUrl: true },
  });
  const liveUserIds = new Set(liveUsers.map((user) => user.id));
  const removedAvatarFolders = userIds.filter((id) => !liveUserIds.has(id));
  if (!dryRun) for (const userId of removedAvatarFolders) await deleteAvatarFolder(userId);

  for (const user of liveUsers) {
    for (const photo of await listFolderPhotos({ userId: user.id })) {
      if (photo.url !== user.avatarUrl && isOld(photo.lastModified)) await removePhoto(photo.url);
    }
  }

  return {
    treeFolders: treeIds.length,
    removedTreeFolders,
    avatarFolders: userIds.length,
    removedAvatarFolders,
    removedPhotos: removedPhotoUrls.length,
    removedPhotoUrls,
    dryRun,
  };
}
