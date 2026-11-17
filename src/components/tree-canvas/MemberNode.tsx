"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { MemberAvatar } from "@/components/tree/MemberList";
import type { MemberNodeType } from "@/hooks/useTreeGraph";
import { formatLifeYears, memberFullName } from "@/lib/member-format";

// Handles only anchor edges (the canvas uses loose connections and users can't
// draw links), so they stay invisible.
const HANDLE_CLASS = "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

/** A 96 × 112 card: photo or initials, name, and life years. */
export const MemberNode = memo(function MemberNode({ data, selected }: NodeProps<MemberNodeType>) {
  const { member } = data;
  const name = memberFullName(member);
  const years = formatLifeYears(member.birthDate, member.deathDate);

  return (
    <div
      title={name}
      data-member-id={member.id}
      className={`flex h-[112px] w-[96px] flex-col items-center gap-1 rounded-lg border bg-white px-1.5 py-2 text-center text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100 ${
        selected
          ? "border-emerald-600 ring-2 ring-emerald-600/30"
          : "border-gray-300 dark:border-gray-700"
      }`}
    >
      <Handle type="source" position={Position.Top} id="top" className={HANDLE_CLASS} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={HANDLE_CLASS} isConnectable={false} />
      <Handle type="source" position={Position.Left} id="left" className={HANDLE_CLASS} isConnectable={false} />
      <Handle type="source" position={Position.Right} id="right" className={HANDLE_CLASS} isConnectable={false} />

      <MemberAvatar member={member} size="md" />
      <p className="line-clamp-2 w-full break-words text-[11px] font-bold leading-tight">{name}</p>
      {years && <p className="text-[10px] leading-none text-gray-500 dark:text-gray-400">{years}</p>}
    </div>
  );
});
