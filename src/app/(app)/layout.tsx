import Link from "next/link";
import { redirect } from "next/navigation";
import { UserMenu } from "@/components/user/UserMenu";
import { auth } from "@/lib/auth";
import { sessionExpiredPath, sessionStatus } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");
  // A pre-Phase 6 ("legacy") token renders on: the page's first tRPC call gets
  // UNAUTHORIZED and goes through /api/session-expired with this page as the
  // callbackUrl, which upgrades the token and comes straight back. The layout
  // doesn't know the current path, so redirecting from here would lose it.
  const status = await sessionStatus(session.user.id, session.user.sid);
  if (status === "revoked" || status === "gone") redirect(sessionExpiredPath());

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-4 dark:border-gray-800">
        <Link href="/dashboard" className="font-semibold">
          FamilyForest
        </Link>
        <UserMenu initialName={session.user.name ?? null} email={session.user.email ?? ""} />
      </header>
      {children}
    </div>
  );
}
