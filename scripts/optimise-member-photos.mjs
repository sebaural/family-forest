// One-off backfill: turns member photos stored as uploaded originals into the
// 256 × 256 WebP (one-year immutable cache) that members.add/update now save.
//
//   node --env-file=.env.local scripts/optimise-member-photos.mjs --dry-run
//   node --env-file=.env.local scripts/optimise-member-photos.mjs
//
// Point --env-file at the environment to fix (e.g. a pulled production env).
// Self-contained on purpose: the app's modules are server-only and use path
// aliases, which plain Node can't load. Keep the settings in step with
// src/server/photo-optimise.ts.
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const SIZE = 256; // MEMBER_PHOTO_SIZE
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const dryRun = process.argv.includes("--dry-run");

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error("R2_* environment variables are missing.");
  process.exit(1);
}
const publicUrl = R2_PUBLIC_URL.replace(/\/+$/, "");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const db = new PrismaClient();

const counts = { optimised: 0, skipped: 0, failed: 0 };
let savedBytes = 0;

try {
  const members = await db.member.findMany({
    where: { photoUrl: { not: null } },
    select: { id: true, treeId: true, photoUrl: true },
  });
  console.log(`${members.length} members with a photo${dryRun ? " (dry run)" : ""}`);

  for (const member of members) {
    const url = member.photoUrl;
    const prefix = `${publicUrl}/trees/${member.treeId}/`;
    if (!url.startsWith(prefix)) {
      console.warn(`skip ${member.id}: not one of this tree's uploads`);
      counts.skipped++;
      continue;
    }
    const key = url.slice(publicUrl.length + 1);
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      if (head.CacheControl === CACHE_CONTROL && head.ContentType === "image/webp") {
        counts.skipped++; // already optimised
        continue;
      }
      if (dryRun) {
        console.log(`would optimise ${member.id}: ${key} (${Math.round((head.ContentLength ?? 0) / 1024)} KB)`);
        counts.optimised++;
        continue;
      }

      const object = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      const original = await object.Body.transformToByteArray();
      const resized = await sharp(original, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(SIZE, SIZE, { fit: "cover" })
        .webp({ quality: 80 })
        .toBuffer();

      const newKey = `trees/${member.treeId}/${randomUUID()}.webp`;
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: newKey,
          Body: resized,
          ContentType: "image/webp",
          CacheControl: CACHE_CONTROL,
        }),
      );
      // Only if nobody changed the photo meanwhile.
      const { count } = await db.member.updateMany({
        where: { id: member.id, photoUrl: url },
        data: { photoUrl: `${publicUrl}/${newKey}` },
      });
      if (count === 0) {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: newKey }));
        console.warn(`skip ${member.id}: photo changed while running`);
        counts.skipped++;
        continue;
      }
      // Another member could share the original (not expected); keep it then.
      const stillUsed = await db.member.count({ where: { photoUrl: url } });
      if (stillUsed === 0) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));

      savedBytes += original.byteLength - resized.byteLength;
      counts.optimised++;
      console.log(`optimised ${member.id}: ${Math.round(original.byteLength / 1024)} KB → ${Math.round(resized.byteLength / 1024)} KB`);
    } catch (error) {
      counts.failed++;
      console.error(`failed ${member.id} (${key}):`, error instanceof Error ? error.message : error);
    }
  }
} finally {
  await db.$disconnect();
}

console.log(
  `${dryRun ? "would optimise" : "optimised"} ${counts.optimised}, skipped ${counts.skipped}, failed ${counts.failed}` +
    (dryRun ? "" : `, saved ${Math.round(savedBytes / 1024)} KB`),
);
if (counts.failed) process.exitCode = 1;
