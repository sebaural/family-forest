"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { trpc } from "@/trpc/client";

const LINKS: { href: Route; label: string }[] = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/approvals", label: "Approvals" },
  { href: "/settings/danger", label: "Danger zone" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const waiting = trpc.approvals.count.useQuery().data ?? 0;
  return (
    <nav aria-label="Settings">
      <ul className="flex gap-1 overflow-x-auto sm:flex-col">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap rounded px-3 py-2 text-sm ${
                  active
                    ? "bg-emerald-50 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                } ${link.href === "/settings/danger" && !active ? "text-red-700 dark:text-red-400" : ""}`}
              >
                {link.label}
                {link.href === "/settings/approvals" && waiting > 0 && (
                  <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {waiting}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
