import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";
import { PHOTO_TYPES, type PhotoContentType } from "@/lib/photo";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;

function getConfig() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    return null;
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicUrl: R2_PUBLIC_URL.replace(/\/+$/, ""),
  };
}

export function isR2Configured(): boolean {
  return getConfig() !== null;
}

let client: S3Client | undefined;
function getClient(config: NonNullable<ReturnType<typeof getConfig>>): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Default CRC32 checksums would be signed into the URL and break browser uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

/** Where a picture lives: a tree's member photos or one user's avatars. */
export type PhotoFolder = { treeId: string } | { userId: string };

function folderPath(folder: PhotoFolder): string {
  return "treeId" in folder ? `trees/${folder.treeId}` : `avatars/${folder.userId}`;
}

/** Public URL prefix every picture of this tree lives under. */
export function treePhotoPrefix(treeId: string): string | null {
  const config = getConfig();
  return config && `${config.publicUrl}/trees/${treeId}/`;
}

/** Public URL prefix of one user's avatar pictures. */
export function avatarPrefix(userId: string): string | null {
  const config = getConfig();
  return config && `${config.publicUrl}/avatars/${userId}/`;
}

/**
 * Signs a one-off PUT for a new picture: a member photo (`trees/<treeId>/`) or a
 * user avatar (`avatars/<userId>/`). Content type and length are part of the
 * signature, so the browser can't upload a different kind or size of file.
 */
export async function createPhotoUploadUrl(input: {
  folder: PhotoFolder;
  contentType: PhotoContentType;
  size: number;
}): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  const config = getConfig();
  if (!config) return null;

  const key = `${folderPath(input.folder)}/${randomUUID()}.${PHOTO_TYPES[input.contentType]}`;
  const uploadUrl = await getSignedUrl(
    getClient(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.size,
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );
  return { uploadUrl, publicUrl: `${config.publicUrl}/${key}` };
}

/** The bucket key behind one of our public picture URLs, or null for any other URL. */
function keyFromUrl(config: NonNullable<ReturnType<typeof getConfig>>, url: string): string | null {
  const ours = [`${config.publicUrl}/trees/`, `${config.publicUrl}/avatars/`];
  return ours.some((prefix) => url.startsWith(prefix)) ? url.slice(config.publicUrl.length + 1) : null;
}

/** Downloads a picture by its public URL (null when missing or not ours). */
export async function getPhotoBytes(url: string): Promise<Uint8Array | null> {
  const config = getConfig();
  const key = config && keyFromUrl(config, url);
  if (!config || !key) return null;
  try {
    const object = await getClient(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return (await object.Body?.transformToByteArray()) ?? null;
  } catch (error) {
    console.error("Failed to read picture from R2", key, error);
    return null;
  }
}

/** Stores a processed picture next to the original and returns its public URL. */
export async function putPhoto(input: {
  folder: PhotoFolder;
  bytes: Uint8Array;
  contentType: "image/webp";
}): Promise<string | null> {
  const config = getConfig();
  if (!config) return null;
  const key = `${folderPath(input.folder)}/${randomUUID()}.webp`;
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${config.publicUrl}/${key}`;
}

/** Deletes a picture by its public URL. Best effort: failures are logged, not thrown. */
export async function deletePhotoByUrl(url: string | null | undefined): Promise<void> {
  const config = getConfig();
  const key = config && url ? keyFromUrl(config, url) : null;
  if (!config || !key) return;

  try {
    await getClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    console.error("Failed to delete picture from R2", key, error);
  }
}

const TREE_PHOTO_DELETE_ATTEMPTS = 3;

export interface StoredObject {
  key: string;
  lastModified: Date | null;
}

/** Lists every object under a prefix, following pagination. */
async function listObjects(s3: S3Client, bucket: string, prefix: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const { Key, LastModified } of page.Contents ?? []) {
      if (Key) objects.push({ key: Key, lastModified: LastModified ?? null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

async function listKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  return (await listObjects(s3, bucket, prefix)).map((object) => object.key);
}

/**
 * Deletes every picture stored for a tree, including uploads never saved to a
 * member. Retries until a fresh listing comes back empty. It doesn't throw:
 * the tree is already gone, so anything left is logged for a manual cleanup.
 */
export function deleteTreePhotos(treeId: string): Promise<void> {
  return deleteFolder(`trees/${treeId}/`);
}

/** Deletes every avatar picture of a user (account deletion, sweep). */
export function deleteAvatarFolder(userId: string): Promise<void> {
  return deleteFolder(`avatars/${userId}/`);
}

async function deleteFolder(prefix: string): Promise<void> {
  const config = getConfig();
  if (!config) return;
  const s3 = getClient(config);

  let lastError: unknown;
  // One extra pass only re-lists, to confirm the last round of deletes.
  for (let attempt = 0; attempt <= TREE_PHOTO_DELETE_ATTEMPTS; attempt++) {
    try {
      const keys = await listKeys(s3, config.bucket, prefix);
      if (keys.length === 0) return;
      if (attempt === TREE_PHOTO_DELETE_ATTEMPTS) {
        lastError ??= new Error(`${keys.length} objects remain`);
        break;
      }
      // One request per object: the R2 token is object-scoped and known to allow DeleteObject.
      const results = await Promise.allSettled(
        keys.map((Key) => s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))),
      );
      const failed = results.find((result) => result.status === "rejected");
      if (failed) lastError = failed.reason;
    } catch (error) {
      lastError = error;
    }
  }
  console.error("Failed to delete all pictures from R2", prefix, lastError);
}

/** Every tree id that has a picture folder (`trees/<treeId>/`) in the bucket. */
export function listTreePhotoFolders(): Promise<string[]> {
  return listFolders("trees/");
}

/** Every user id that has an avatar folder (`avatars/<userId>/`) in the bucket. */
export function listAvatarFolders(): Promise<string[]> {
  return listFolders("avatars/");
}

async function listFolders(root: "trees/" | "avatars/"): Promise<string[]> {
  const config = getConfig();
  if (!config) return [];
  const s3 = getClient(config);
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: root,
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const { Prefix } of page.CommonPrefixes ?? []) {
      const id = Prefix?.slice(root.length, -1);
      if (id) ids.push(id);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return ids;
}

/**
 * The pictures in one folder, with their public URL and upload time, so a sweep
 * can find uploads nothing points to.
 */
export async function listFolderPhotos(
  folder: { treeId: string } | { userId: string },
): Promise<{ url: string; key: string; lastModified: Date | null }[]> {
  const config = getConfig();
  if (!config) return [];
  const prefix = "treeId" in folder ? `trees/${folder.treeId}/` : `avatars/${folder.userId}/`;
  const objects = await listObjects(getClient(config), config.bucket, prefix);
  return objects.map((object) => ({ ...object, url: `${config.publicUrl}/${object.key}` }));
}
