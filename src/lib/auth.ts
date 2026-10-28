import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
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
    // Credentials sign-up creates its own Subscription; OAuth users get one here.
    createUser: async ({ user }) => {
      if (!user.id) return;
      await db.subscription.upsert({
        where: { userId: user.id },
        create: { userId: user.id, plan: "FREE", status: "ACTIVE" },
        update: {},
      });
    },
  },
});
