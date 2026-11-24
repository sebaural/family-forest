import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Tokens issued before sessions were tracked (Phase 6) carry no `sid`. Until
 * this date they are upgraded in place (see /api/session-expired) instead of
 * being signed out. JWTs live 30 days by default and slide while in use, so
 * after this date a token without a sid is simply treated as expired. Delete
 * this constant and the "legacy" branch once it has passed.
 */
export const LEGACY_SESSION_ADOPTION_UNTIL = new Date("2027-01-01T00:00:00Z");

export type SessionStatus =
  /** The UserSession row exists, belongs to the user and isn't revoked. */
  | "active"
  /** No sid yet (pre-Phase 6 token), the user exists: upgrade it. */
  | "legacy"
  /** Signed out elsewhere, by a password change, or unknown/foreign sid. */
  | "revoked"
  /** The user no longer exists. */
  | "gone";

export function legacyAdoptionOpen(now = new Date()): boolean {
  return now < LEGACY_SESSION_ADOPTION_UNTIL;
}

/**
 * Sessions are JWTs, so a cookie can outlive its user (for example after an
 * account is deleted) or a "Sign out" from another device. Each JWT carries the
 * id of its UserSession row (`sid`). Cached per request, so it costs at most one
 * or two queries (plus an occasional last-seen update).
 */
export const sessionStatus = cache(
  async (userId: string, sid: string | undefined): Promise<SessionStatus> => {
    if (!sid) {
      if (!legacyAdoptionOpen()) return "revoked";
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      return user ? "legacy" : "gone";
    }

    const row = await db.userSession.findUnique({
      where: { id: sid },
      select: { userId: true, revokedAt: true, lastSeenAt: true },
    });
    if (!row || row.userId !== userId || row.revokedAt) {
      // A deleted user's rows cascade away, so a missing row may mean either.
      const user = row ? true : await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      return user ? "revoked" : "gone";
    }

    if (Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
      void db.userSession
        .update({ where: { id: sid }, data: { lastSeenAt: new Date() } })
        .catch((error) => console.error("Failed to update session last-seen", error));
    }
    return "active";
  },
);

/** True only for a tracked, live session; anything else goes to /api/session-expired. */
export async function sessionIsActive(userId: string, sid: string | undefined): Promise<boolean> {
  return (await sessionStatus(userId, sid)) === "active";
}

/** Where to send a session that is no longer active (or needs upgrading). */
export function sessionExpiredPath(callbackUrl?: string): string {
  return callbackUrl
    ? `/api/session-expired?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/api/session-expired";
}
