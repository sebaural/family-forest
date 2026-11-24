"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/user/UserAvatar";
import { secondaryButton } from "@/components/ui/styles";
import { trpc } from "@/trpc/client";
import { signOutAction } from "@/app/(app)/actions";

/**
 * Header account area. Reads users.me, so a new name or picture shows up as
 * soon as settings invalidate it. The server-rendered name covers first paint.
 */
export function UserMenu({ initialName, email }: { initialName: string | null; email: string }) {
  const me = trpc.users.me.useQuery();
  const name = me.data?.name ?? initialName;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link
        href="/settings/profile"
        className="flex min-w-0 items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <UserAvatar name={name} email={me.data?.email ?? email} src={me.data?.avatar ?? null} />
        {/* The name is the link text (hidden visually on phones); the suffix says where it goes. */}
        <span className="sr-only truncate text-sm sm:not-sr-only">{name ?? email}</span>
        <span className="sr-only">, account settings</span>
      </Link>
      <form action={signOutAction}>
        <button type="submit" className={secondaryButton}>
          Sign out
        </button>
      </form>
    </div>
  );
}
