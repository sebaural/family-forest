import "server-only";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
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

/** Public URL prefix every picture of this tree lives under. */
export function treePhotoPrefix(treeId: string): string | null {
  const config = getConfig();
  return config && `${config.publicUrl}/trees/${treeId}/`;
}

/**
 * Signs a one-off PUT for a new picture. Content type and length are part of the
 * signature, so the browser can't upload a different kind or size of file.
 */
export async function createPhotoUploadUrl(input: {
  treeId: string;
  contentType: PhotoContentType;
  size: number;
}): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  const config = getConfig();
  if (!config) return null;

  const key = `trees/${input.treeId}/${randomUUID()}.${PHOTO_TYPES[input.contentType]}`;
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

/** Deletes a picture by its public URL. Best effort: failures are logged, not thrown. */
export async function deletePhotoByUrl(url: string | null | undefined): Promise<void> {
  const config = getConfig();
  if (!config || !url || !url.startsWith(`${config.publicUrl}/trees/`)) return;

  const key = url.slice(config.publicUrl.length + 1);
  try {
    await getClient(config).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
  } catch (error) {
    console.error("Failed to delete picture from R2", key, error);
  }
}

const TREE_PHOTO_DELETE_ATTEMPTS = 3;

/** Lists every key under a prefix, following pagination. */
async function listKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const { Key } of page.Contents ?? []) if (Key) keys.push(Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * Deletes every picture stored for a tree, including uploads never saved to a
 * member. Retries until a fresh listing comes back empty. It doesn't throw:
 * the tree is already gone, so anything left is logged for a manual cleanup.
 */
export async function deleteTreePhotos(treeId: string): Promise<void> {
  const config = getConfig();
  if (!config) return;
  const s3 = getClient(config);
  const prefix = `trees/${treeId}/`;

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
  console.error("Failed to delete all tree pictures from R2", prefix, lastError);
}

/** Every tree id that has a picture folder (`trees/<treeId>/`) in the bucket. */
export async function listTreePhotoFolders(): Promise<string[]> {
  const config = getConfig();
  if (!config) return [];
  const s3 = getClient(config);
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: "trees/",
        Delimiter: "/",
        ContinuationToken: token,
      }),
    );
    for (const { Prefix } of page.CommonPrefixes ?? []) {
      const id = Prefix?.slice("trees/".length, -1);
      if (id) ids.push(id);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return ids;
}
