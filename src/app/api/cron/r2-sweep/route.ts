import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import { sweepDeletedTreePhotos } from "@/server/r2-sweep";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  if (!env.CRON_SECRET) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Daily Vercel Cron (vercel.json): deletes pictures left behind by deleted trees. */
export async function GET(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sweepDeletedTreePhotos();
  if (result.removed.length > 0) {
    console.info("R2 sweep removed picture folders of deleted trees", result.removed);
  }
  return NextResponse.json(result);
}
