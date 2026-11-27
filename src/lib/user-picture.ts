import type { Prisma } from "@prisma/client";

/**
 * A person's picture, wherever they appear: their uploaded avatar, else the
 * picture from their sign-in provider. The one rule for the whole app.
 */
export function userPicture(user: { avatarUrl: string | null; image: string | null }): string | null {
  return user.avatarUrl ?? user.image;
}

/** What to select for a user shown to others: pass the result to toPublicUser. */
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

type PublicUserRow = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER_SELECT }>;

/** A user for display: `image` is already the picture to show. */
export function toPublicUser(user: PublicUserRow) {
  return { id: user.id, name: user.name, email: user.email, image: userPicture(user) };
}
