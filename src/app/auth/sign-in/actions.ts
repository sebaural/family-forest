"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { env } from "@/env";
import { signIn } from "@/lib/auth";

export type SignInState = { error?: string };

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  callbackUrl: z.string().optional().transform(toSameOriginPath).catch(undefined),
});

// Only same-origin destinations are allowed after sign-in (middleware sends
// absolute URLs); anything else falls back to the dashboard.
function toSameOriginPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
  if (!URL.canParse(value, appUrl)) return undefined;
  const url = new URL(value, appUrl);
  return url.origin === appUrl.origin ? `${url.pathname}${url.search}` : undefined;
}

export async function signInWithCredentials(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: parsed.data.callbackUrl ?? "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          error.type === "CredentialsSignin"
            ? "Invalid email or password."
            : "Something went wrong. Please try again.",
      };
    }
    // signIn signals a successful sign-in by throwing a redirect; let it through.
    throw error;
  }

  return {};
}

const providerSchema = z.enum(["google", "github"]);

export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = providerSchema.parse(formData.get("provider"));
  await signIn(provider, { redirectTo: "/dashboard" });
}
