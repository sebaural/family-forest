// Picture upload limits, shared by the server (signing) and the client (pre-checks).
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type PhotoContentType = keyof typeof PHOTO_TYPES;

export function isPhotoContentType(type: string): type is PhotoContentType {
  return Object.hasOwn(PHOTO_TYPES, type);
}
