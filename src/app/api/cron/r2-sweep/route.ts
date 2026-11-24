import { NextResponse, type NextRequest } from "next/server";
import { rejectCronRequest } from "@/server/cron-auth";
import { sweepPhotos } from "@/server/r2-sweep";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel Cron (vercel.json): deletes pictures left behind by deleted trees
 * and users, and uploads older than a day that nothing points to.
 * `?dryRun=1` reports what it would delete, without deleting.
 */
export async function GET(request: NextRequest) {
  const rejected = rejectCronRequest(request);
  if (rejected) return rejected;

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const result = await sweepPhotos({ dryRun });
  if (
    !dryRun &&
    (result.removedTreeFolders.length > 0 || result.removedAvatarFolders.length > 0 || result.removedPhotos > 0)
  ) {
    console.info("R2 sweep removed pictures", result);
  }
  return NextResponse.json(result);
}
