import type { NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { env } from "@/env";

// Edge-safe config shared by middleware and the full NextAuth instance in
// `@/lib/auth`. It must not import Prisma, bcrypt or other Node-only code.

export type OAuthProviderId = "google" | "github";

const oauthProviders: Provider[] = [];
export const configuredOAuthProviders: { id: OAuthProviderId; name: string }[] = [];

// OAuth providers are only registered when both credentials are present.
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }),
  );
  configuredOAuthProviders.push({ id: "google", name: "Google" });
}

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  oauthProviders.push(
    GitHub({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }),
  );
  configuredOAuthProviders.push({ id: "github", name: "GitHub" });
}

export const authConfig = {
  secret: env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/sign-in",
    error: "/auth/error",
  },
  providers: oauthProviders,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isSignedIn = !!auth?.user;

      if (nextUrl.pathname.startsWith("/dashboard")) {
        // Returning false redirects to pages.signIn with a callbackUrl.
        return isSignedIn;
      }

      if (nextUrl.pathname.startsWith("/auth") && isSignedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = user.role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
