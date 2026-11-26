"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

/** sessionStorage key: the page the user was on when they opened Settings. */
export const SETTINGS_RETURN_KEY = "settingsReturnTo";

function returnTarget(): Route {
  try {
    const saved = window.sessionStorage.getItem(SETTINGS_RETURN_KEY);
    if (
      saved &&
      saved.startsWith("/") &&
      !saved.startsWith("//") &&
      saved !== "/settings" &&
      !saved.startsWith("/settings/")
    ) {
      return saved as Route;
    }
  } catch {
    // Storage blocked: fall back below.
  }
  return "/dashboard";
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** Leaves Settings for the page it was opened from (X button or Esc). */
export function SettingsClose() {
  const router = useRouter();
  const close = useCallback(() => router.push(returnTarget()), [router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open dialog (e.g. a Danger-zone confirm) closes first.
      if (document.querySelector("dialog[open]")) return;
      // Don't throw away half-typed edits.
      if (isEditable(event.target)) return;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <button
      type="button"
      onClick={close}
      aria-label="Close settings"
      title="Close (Esc)"
      className="-mr-2 rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
        <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
      </svg>
    </button>
  );
}
