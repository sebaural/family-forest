import Link from "next/link";
import { SignUpForm } from "@/app/auth/sign-up/sign-up-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Create your FamilyForest account</h1>
      <SignUpForm />
      <p className="text-center text-sm">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-emerald-700 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
