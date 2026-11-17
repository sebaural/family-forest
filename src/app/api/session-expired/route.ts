import { NextResponse, type NextRequest } from "next/server";
import { auth, signOut } from "@/lib/auth";
import { userExists } from "@/server/session";

/** Only same-site relative paths, so this can't become an open redirect. */
function safeCallbackUrl(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/**
 * Clears a session whose user no longer exists, then sends it to sign-in.
 * Pages and tRPC send stale sessions here because the middleware keeps
 * signed-in users away from /auth, so the cookie must go first. A session
 * whose user still exists is left alone, so this can't sign anyone out.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId && (await userExists(userId))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const params = new URLSearchParams({ expired: "1" });
  const callbackUrl = safeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));
  if (callbackUrl) params.set("callbackUrl", callbackUrl);
  const target = `/auth/sign-in?${params.toString()}`;

  if (!session) return NextResponse.redirect(new URL(target, request.url));
  // Clears the session cookie and throws Next's redirect.
  await signOut({ redirectTo: target });
}
