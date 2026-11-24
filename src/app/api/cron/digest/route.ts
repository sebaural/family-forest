import { NextResponse, type NextRequest } from "next/server";
import { rejectCronRequest } from "@/server/cron-auth";
import { runDigest } from "@/server/digest";

export const dynamic = "force-dynamic";

/**
 * Daily Vercel Cron at 08:00 UTC (vercel.json): the activity digest email.
 * `?dryRun=1` returns who would get what, without sending.
 */
export async function GET(request: NextRequest) {
  const rejected = rejectCronRequest(request);
  if (rejected) return rejected;

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const result = await runDigest({ dryRun });
  if (!dryRun) {
    console.info("Digest run", { recipients: result.recipients.length, sent: result.sent, failed: result.failed });
  }
  return NextResponse.json(result);
}
