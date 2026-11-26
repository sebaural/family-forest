import "server-only";
import sharp from "sharp";
import { deletePhotoByUrl, getPhotoBytes, putPhoto, type PhotoFolder } from "@/lib/r2";

export const AVATAR_SIZE = 128;
/** Member photos show at most 80 px wide (MemberAvatar lg); 256 covers 3× screens and exports. */
export const MEMBER_PHOTO_SIZE = 256;

/**
 * Turns an uploaded original into a square WebP of `size` pixels, stores it in
 * the same folder with a one-year immutable cache and deletes the original.
 * Returns the new public URL, or null when the upload is missing or isn't a
 * readable image.
 */
export async function optimisePhoto(input: {
  folder: PhotoFolder;
  originalUrl: string;
  size: number;
}): Promise<string | null> {
  const original = await getPhotoBytes(input.originalUrl);
  if (!original) return null;

  let resized: Buffer;
  try {
    resized = await sharp(original, { limitInputPixels: 50_000_000 })
      .rotate() // honour EXIF orientation from phone cameras
      .resize(input.size, input.size, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error("Upload is not a readable image", error);
    await deletePhotoByUrl(input.originalUrl);
    return null;
  }

  const url = await putPhoto({ folder: input.folder, bytes: resized, contentType: "image/webp" });
  await deletePhotoByUrl(input.originalUrl);
  return url;
}

/** The 128 × 128 WebP the app shows for a user everywhere. */
export function optimiseAvatar(userId: string, originalUrl: string): Promise<string | null> {
  return optimisePhoto({ folder: { userId }, originalUrl, size: AVATAR_SIZE });
}
