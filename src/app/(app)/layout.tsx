import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { secondaryButton } from "@/components/ui/styles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-4 dark:border-gray-800">
        <Link href="/dashboard" className="font-semibold">
          FamilyForest
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden truncate text-sm sm:inline">
            {session.user.name ?? session.user.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className={secondaryButton}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
