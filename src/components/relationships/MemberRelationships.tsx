"use client";

import { useState } from "react";
import { RelationshipDialog } from "@/components/relationships/RelationshipDialog";
import { errorText, mutedText, secondaryButton } from "@/components/ui/styles";
import { memberFullName } from "@/lib/member-format";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member, Relationship } from "@/trpc/types";

function relationshipLabel(relationship: Relationship, memberId: string): string {
  switch (relationship.type) {
    case "PARENT_CHILD":
      return relationship.fromId === memberId ? "Parent of" : "Child of";
    case "SPOUSE":
      return "Married to";
    case "PARTNER":
      return "Partner of";
  }
}

interface MemberRelationshipsProps {
  treeId: string;
  member: Member;
  members: Member[];
  canEdit: boolean;
}

export function MemberRelationships({
  treeId,
  member,
  members,
  canEdit,
}: MemberRelationshipsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const utils = trpc.useUtils();
  const relationships = trpc.relationships.list.useQuery({ treeId });
  const removeRelationship = trpc.relationships.remove.useMutation({
    onSuccess: () => utils.relationships.list.invalidate({ treeId }),
  });

  const own = (relationships.data ?? []).filter(
    (relationship) => relationship.fromId === member.id || relationship.toId === member.id,
  );
  const memberById = new Map(members.map((other) => [other.id, other]));
  const others = members.filter((other) => other.id !== member.id);

  return (
    <section className="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Relationships</h3>
        {canEdit && (
          <span title={others.length === 0 ? "Add another member first." : undefined}>
            <button
              type="button"
              disabled={others.length === 0}
              onClick={() => setDialogOpen(true)}
              className={secondaryButton}
            >
              Add Relationship
            </button>
          </span>
        )}
      </div>

      {relationships.isPending && <p className={mutedText}>Loading relationships…</p>}
      {relationships.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(relationships.error)}
        </p>
      )}
      {relationships.data && own.length === 0 && (
        <p className={mutedText}>No relationships yet.</p>
      )}
      {removeRelationship.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(removeRelationship.error)}
        </p>
      )}

      <ul className="space-y-1">
        {own.map((relationship) => {
          const otherId = relationship.fromId === member.id ? relationship.toId : relationship.fromId;
          const other = memberById.get(otherId);
          return (
            <li
              key={relationship.id}
              className="flex items-center justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="min-w-0 truncate">
                <span className={mutedText}>{relationshipLabel(relationship, member.id)}</span>{" "}
                {other ? memberFullName(other) : "Loading…"}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove relationship with ${other ? memberFullName(other) : "this member"}`}
                  disabled={removeRelationship.isPending}
                  onClick={() => removeRelationship.mutate({ relationshipId: relationship.id })}
                  className="px-2 text-gray-500 hover:text-red-600 disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <RelationshipDialog
          treeId={treeId}
          member={member}
          candidates={others}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </section>
  );
}
