import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    DIRECT_URL: z.url(),
    NEXTAUTH_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    // Cloudflare R2 (member pictures). Picture uploads are hidden unless all five are set.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_PUBLIC_URL: z.url().optional(),
    // Vercel Cron sends it as a Bearer token; cron routes refuse to run without it.
    CRON_SECRET: z.string().min(16).optional(),
    // Resend (invite emails). Without it, invites are shared by copying the link.
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM: z.string().optional(),
    // Supabase Realtime (live updates for collaborators), named as the Supabase dashboard
    // lists them for server use. All three are server variables: the secret key broadcasts
    // events and must never be NEXT_PUBLIC_. The URL and publishable key reach the browser
    // as props from the tree page (see getRealtimeClientConfig), not through the bundle.
    SUPABASE_URL: z.url().optional(),
    SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_").optional(),
    SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_").optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM: process.env.RESEND_FROM,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  // Escape hatch for builds without real secrets (set SKIP_ENV_VALIDATION=1).
  // `next lint` loads next.config.mjs too, but never needs the real env.
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event === "lint",
  emptyStringAsUndefined: true,
});

/** True for a legacy Supabase service_role JWT (header.payload.signature). */
function isServiceRoleJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "service_role";
  } catch {
    return false;
  }
}

// NEXT_PUBLIC_ values are inlined into browser code, so a secret there is public.
// Fail startup and builds if one holds a Supabase secret key. Names only the variable.
if (typeof window === "undefined" && !process.env.SKIP_ENV_VALIDATION) {
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (value.trim().startsWith("sb_secret_") || isServiceRoleJwt(value.trim())) {
      throw new Error(
        `${name} holds a Supabase secret key. Secret keys must never use a NEXT_PUBLIC_ variable; use SUPABASE_SECRET_KEY.`,
      );
    }
  }
}
