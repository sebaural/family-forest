import Link from "next/link";
import { signInWithProvider } from "@/app/auth/sign-in/actions";
import { SignInForm } from "@/app/auth/sign-in/sign-in-form";
import { configuredOAuthProviders } from "@/lib/auth.config";

type SignInPageProps = {
  searchParams: { callbackUrl?: string; registered?: string };
};

export default function SignInPage({ searchParams }: SignInPageProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Sign in to FamilyForest</h1>

      {searchParams.registered && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Account created. Please sign in.
        </p>
      )}

      <SignInForm callbackUrl={searchParams.callbackUrl} />

      {configuredOAuthProviders.length > 0 && (
        <div className="space-y-2">
          <p className="text-center text-sm text-gray-500">or continue with</p>
          {configuredOAuthProviders.map((provider) => (
            <form key={provider.id} action={signInWithProvider}>
              <input type="hidden" name="provider" value={provider.id} />
              <button
                type="submit"
                className="w-full rounded border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 hover:text-gray-900"
              >
                Sign in with {provider.name}
              </button>
            </form>
          ))}
        </div>
      )}

      <p className="text-center text-sm">
        No account yet?{" "}
        <Link href="/auth/sign-up" className="font-medium text-emerald-700 underline">
          Create one
        </Link>
      </p>
    </main>
  );
}
