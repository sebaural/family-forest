"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inputClass, mutedText } from "@/components/ui/styles";
import { formatLifeYears, memberFullName, memberInitials } from "@/lib/member-format";
import type { Member } from "@/trpc/types";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const AVATAR_SIZES = {
  sm: "h-9 w-9 text-xs",
  lg: "h-20 w-20 text-xl",
} as const;

export function MemberAvatar({
  member,
  size = "sm",
}: {
  member: Pick<Member, "firstName" | "lastName" | "photoUrl">;
  size?: keyof typeof AVATAR_SIZES;
}) {
  const sizeClass = AVATAR_SIZES[size];
  if (member.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- photo hosts aren't known up front
      <img
        src={member.photoUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200`}
    >
      {memberInitials(member)}
    </span>
  );
}

interface MemberListProps {
  members: Member[];
  selectedId: string | null;
  onSelect: (memberId: string) => void;
}

export function MemberList({ members, selectedId, onSelect }: MemberListProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A modal is open: the search input behind it can't take focus.
      if (document.querySelector("dialog[open]")) return;
      const isSlash = event.key === "/" && !isTypingTarget(event.target);
      const isCommandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (isSlash || isCommandK) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => memberFullName(member).toLowerCase().includes(q));
  }, [members, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search members"
          aria-label="Search members"
          className={`${inputClass} pr-9`}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
          >
            ×
          </button>
        )}
      </div>

      {filtered.length === 0 && query.trim() && <p className={mutedText}>No members match</p>}

      <ul className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {filtered.map((member) => {
          const years = formatLifeYears(member.birthDate, member.deathDate);
          const selected = member.id === selectedId;
          return (
            <li key={member.id}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelect(member.id)}
                className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  selected ? "bg-emerald-50 dark:bg-emerald-950/50" : ""
                }`}
              >
                <MemberAvatar member={member} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {memberFullName(member)}
                  </span>
                  {years && <span className={`block text-xs ${mutedText}`}>{years}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
