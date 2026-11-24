import "server-only";
import sharp from "sharp";
import { deletePhotoByUrl, getPhotoBytes, putPhoto } from "@/lib/r2";

export const AVATAR_SIZE = 128;

/**
 * Turns an uploaded original into the 128 × 128 WebP the app shows everywhere,
 * stores it in the user's avatar folder and deletes the original. Returns the
 * new public URL, or null when the upload is missing or isn't a readable image.
 */
export async function optimiseAvatar(userId: string, originalUrl: string): Promise<string | null> {
  const original = await getPhotoBytes(originalUrl);
  if (!original) return null;

  let resized: Buffer;
  try {
    resized = await sharp(original, { limitInputPixels: 50_000_000 })
      .rotate() // honour EXIF orientation from phone cameras
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error("Avatar is not a readable image", error);
    await deletePhotoByUrl(originalUrl);
    return null;
  }

  const url = await putPhoto({ folder: { userId }, bytes: resized, contentType: "image/webp" });
  await deletePhotoByUrl(originalUrl);
  return url;
}
