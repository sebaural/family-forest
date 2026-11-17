"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MemberLinkKind } from "@/components/members/MemberPanel";
import { memberFullName } from "@/lib/member-format";
import type { Member } from "@/trpc/types";

export interface NodeMenuActions {
  onEdit: (member: Member) => void;
  onAddRelative: (member: Member, as: MemberLinkKind) => void;
  onDelete: (member: Member) => void;
}

interface NodeContextMenuProps extends NodeMenuActions {
  member: Member;
  x: number;
  y: number;
  onClose: () => void;
}

const itemClass =
  "block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-gray-800 dark:focus:bg-gray-800";

/** Right-click menu for a member node (OWNER/EDITOR only). Esc or an outside click closes it. */
export function NodeContextMenu({
  member,
  x,
  y,
  onClose,
  onEdit,
  onAddRelative,
  onDelete,
}: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the viewport near the screen edges.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
    menu.querySelector<HTMLButtonElement>("button")?.focus();
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${memberFullName(member)}`}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-44 rounded-md border border-gray-200 bg-white py-1 text-gray-900 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" className={itemClass} onClick={run(() => onEdit(member))}>
        Edit member
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(() => onAddRelative(member, "PARENT"))}>
        Add parent
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(() => onAddRelative(member, "CHILD"))}>
        Add child
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={run(() => onAddRelative(member, "SPOUSE"))}>
        Add spouse / partner
      </button>
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <button
        type="button"
        role="menuitem"
        className={`${itemClass} text-red-600 dark:text-red-400`}
        onClick={run(() => onDelete(member))}
      >
        Delete member
      </button>
    </div>
  );
}
