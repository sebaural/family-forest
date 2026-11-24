import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import { headers } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";
import { legacyAdoptionOpen } from "@/server/session";

/** Device details for the "Active sessions" list. Best effort: empty outside a request. */
function requestDevice(): { userAgent: string | null; ip: string | null } {
  try {
    const h = headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
    return { userAgent: h.get("user-agent")?.slice(0, 500) ?? null, ip: ip?.slice(0, 100) ?? null };
  } catch {
    return { userAgent: null, ip: null };
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  callbacks: {
    ...authConfig.callbacks,
    // Runs in Node only (the middleware uses authConfig's jwt callback, which
    // keeps token.sid as is). Each sign-in gets its own UserSession row.
    async jwt(params) {
      const token = authConfig.callbacks.jwt(params);
      if (params.user?.id && params.trigger !== "update") {
        const row = await db.userSession.create({
          data: { userId: params.user.id, ...requestDevice() },
          select: { id: true },
        });
        token.sid = row.id;
      } else if (params.trigger === "update" && token.id && !token.sid && legacyAdoptionOpen()) {
        // A token from before sessions were tracked: give it a row instead of
        // signing the user out (/api/session-expired triggers this). An update
        // can only add a sid to a token that has none; it never changes one.
        const user = await db.user.findUnique({ where: { id: token.id }, select: { id: true } });
        if (user) {
          const row = await db.userSession.create({
            data: { userId: user.id, ...requestDevice() },
            select: { id: true },
          });
          token.sid = row.id;
        }
      }
      return token;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, name: true, email: true, image: true, role: true, password: true },
        });
        // OAuth-only users have no password and cannot use credentials sign-in.
        if (!user?.password) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.password);
        if (!valid) return null;

        // Never hand the password hash to NextAuth.
        return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
      },
    }),
    ...authConfig.providers,
  ],
  events: {
    // Credentials sign-up creates its own Subscription and sends its own welcome
    // email (it doesn't go through the adapter); OAuth users get both here.
    createUser: async ({ user }) => {
      if (!user.id) return;
      await db.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, plan: "FREE", status: "ACTIVE" },
        update: {},
      });
      if (user.email) await sendWelcomeEmail({ to: user.email, name: user.name ?? null });
    },
    signOut: async (message) => {
      const sid = "token" in message ? message.token?.sid : undefined;
      if (!sid) return;
      await db.userSession
        .updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } })
        .catch((error) => console.error("Failed to revoke session on sign-out", error));
    },
  },
});
