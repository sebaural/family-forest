import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Sessions are JWTs, so a cookie can outlive its user (for example after an
 * account is deleted). Cached per request, so it costs at most one query.
 */
export const userExists = cache(async (userId: string): Promise<boolean> => {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user !== null;
});

/** Where to send a session whose user no longer exists. */
export function sessionExpiredPath(callbackUrl?: string): string {
  return callbackUrl
    ? `/api/session-expired?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/api/session-expired";
}
