"use server";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

export type SignUpResult = { success: true } | { error: string };

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const DUPLICATE_EMAIL_ERROR = "An account with this email already exists.";

export async function signUp(
  _prevState: SignUpResult | null,
  formData: FormData,
): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { error: DUPLICATE_EMAIL_ERROR };

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await db.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        subscription: { create: { plan: "FREE" } },
      },
      select: { id: true },
    });
  } catch (error) {
    // Unique constraint race: another request registered the same email.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: DUPLICATE_EMAIL_ERROR };
    }
    throw error;
  }

  return { success: true };
}
