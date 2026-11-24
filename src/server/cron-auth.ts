import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Returns a response
 * to send back when the request isn't allowed, or null when it is.
 */
export function rejectCronRequest(request: NextRequest): NextResponse | null {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
