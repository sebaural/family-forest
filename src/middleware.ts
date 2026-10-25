import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Uses the edge-safe config; route rules live in authConfig.callbacks.authorized.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Skip Next.js internals, NextAuth endpoints and static files.
  matcher: ["/((?!_next/|api/auth/|.*\\.[^/]+$).*)"],
};
