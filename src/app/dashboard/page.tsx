import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Welcome, {session.user.name ?? session.user.email}</h1>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 hover:text-gray-900"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
