import { NextResponse, type NextRequest } from "next/server";
import { auth, signOut, unstable_update } from "@/lib/auth";
import { sessionStatus } from "@/server/session";

/** Only same-site relative paths, so this can't become an open redirect. */
function safeCallbackUrl(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/**
 * Pages and tRPC send sessions that aren't active here.
 * - A token from before sessions were tracked is upgraded in place (it gets a
 *   UserSession row) and sent back where it came from, so nobody is signed
 *   out by the Phase 6 deploy.
 * - A revoked session, or one whose user is gone, has its cookie cleared and
 *   goes to sign-in. The middleware keeps signed-in users away from /auth, so
 *   the cookie must go first.
 * An active session is left alone, so this can't sign anyone out.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const callbackUrl = safeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));

  if (session && userId) {
    const status = await sessionStatus(userId, session.user.sid);
    if (status === "active") {
      return NextResponse.redirect(new URL(callbackUrl ?? "/dashboard", request.url));
    }
    if (status === "legacy") {
      try {
        // Runs the jwt callback with trigger "update", which adds the sid,
        // and rewrites the session cookie.
        const updated = await unstable_update({});
        if (updated?.user?.sid) {
          return NextResponse.redirect(new URL(callbackUrl ?? "/dashboard", request.url));
        }
      } catch (error) {
        console.error("Failed to upgrade a legacy session", error);
      }
      // Fall through: sign in again, as before.
    }
  }

  const params = new URLSearchParams({ expired: "1" });
  if (callbackUrl) params.set("callbackUrl", callbackUrl);
  const target = `/auth/sign-in?${params.toString()}`;

  if (!session) return NextResponse.redirect(new URL(target, request.url));
  // Clears the session cookie and throws Next's redirect.
  await signOut({ redirectTo: target });
}
