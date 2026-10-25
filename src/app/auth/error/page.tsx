import Link from "next/link";

// NextAuth redirects here with ?error=<code>; map codes to readable messages.
const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "There is a problem with the server configuration.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The sign-in link is no longer valid. It may have been used already or expired.",
  OAuthAccountNotLinked:
    "This email is already linked to another sign-in method. Sign in with the method you used originally.",
  CredentialsSignin: "Invalid email or password.",
};

const DEFAULT_MESSAGE = "An unexpected error occurred while signing in.";

type AuthErrorPageProps = {
  searchParams: { error?: string };
};

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const message = (searchParams.error && ERROR_MESSAGES[searchParams.error]) || DEFAULT_MESSAGE;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Sign-in error</h1>
      <p role="alert">{message}</p>
      <Link href="/auth/sign-in" className="font-medium text-emerald-700 underline">
        Back to sign in
      </Link>
    </main>
  );
}
