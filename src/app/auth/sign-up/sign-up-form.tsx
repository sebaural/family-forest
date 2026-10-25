"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { signUp, type SignUpResult } from "@/app/auth/sign-up/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
    >
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [state, formAction] = useFormState<SignUpResult | null, FormData>(signUp, null);

  useEffect(() => {
    if (state && "success" in state) router.push("/auth/sign-in?registered=1");
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Name</span>
        <input
          name="name"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
        />
      </label>
      {state && "error" in state && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
