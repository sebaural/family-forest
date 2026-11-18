"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import {
  errorText,
  inputClass,
  mutedText,
  primaryButton,
  secondaryButton,
} from "@/components/ui/styles";
import { memberFullName } from "@/lib/member-format";
import {
  RELATIVE_KINDS,
  RELATIVE_LABEL,
  RELATIVE_NOUN,
  relativeEdge,
  type RelativeKind,
} from "@/lib/relationship-kind";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member } from "@/trpc/types";

/** The subject of the dialog: a saved member, or one still being added. */
type Subject = { kind: "saved"; member: Member } | { kind: "pending"; name: string };

interface RelationshipFormProps {
  treeId: string;
  subject: Subject;
  candidates: Member[];
  onClose: () => void;
  /** Pending mode: hand the choice back instead of saving it. */
  onPick?: (kind: RelativeKind, relative: Member) => void;
}

function RelationshipForm({ treeId, subject, candidates, onClose, onPick }: RelationshipFormProps) {
  // No default: the user picks the role explicitly.
  const [kind, setKind] = useState<RelativeKind | "">("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();
  const addRelationship = trpc.relationships.add.useMutation({
    onSuccess: () => {
      void utils.relationships.list.invalidate({ treeId });
      void utils.activity.list.invalidate({ treeId });
      onClose();
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((other) => memberFullName(other).toLowerCase().includes(q));
  }, [candidates, search]);

  const name = subject.kind === "saved" ? memberFullName(subject.member) : subject.name;
  const target = candidates.find((other) => other.id === targetId) ?? null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!kind || !target) return;
    if (subject.kind === "pending") {
      onPick?.(kind, target);
      onClose();
      return;
    }
    // "target is the member's <kind>", stored as a directed edge.
    addRelationship.mutate({ treeId, ...relativeEdge(kind, subject.member.id, target.id) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Relationship</span>
        <select
          required
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as RelativeKind);
            addRelationship.reset();
          }}
          className={inputClass}
        >
          <option value="" disabled>
            Choose a relationship…
          </option>
          {RELATIVE_KINDS.map((value) => (
            <option key={value} value={value}>
              {RELATIVE_LABEL[value]}
            </option>
          ))}
        </select>
        <span className={`block ${mutedText}`}>The selected family member&apos;s role toward {name}.</span>
      </label>

      <div className="space-y-1">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Family member</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search members"
            className={inputClass}
          />
        </label>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-gray-200 p-1 dark:border-gray-800">
          {filtered.map((other) => {
            const selected = other.id === targetId;
            return (
              <li key={other.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setTargetId(other.id);
                    addRelationship.reset();
                  }}
                  className={`block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    selected ? "bg-emerald-100 dark:bg-emerald-950" : ""
                  }`}
                >
                  {memberFullName(other)}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && <li className={`px-2 py-1 ${mutedText}`}>No members match</li>}
        </ul>
      </div>

      {kind && target && (
        <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          <strong>{memberFullName(target)}</strong> will be added as <strong>{name}</strong>&apos;s{" "}
          {RELATIVE_NOUN[kind]}.
        </p>
      )}

      {addRelationship.error && (
        <p role="alert" className={errorText}>
          {getErrorMessage(addRelationship.error)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={!kind || !target || addRelationship.isPending}
          className={primaryButton}
        >
          {addRelationship.isPending && <Spinner />}
          Add relationship
        </button>
      </div>
    </form>
  );
}

export function RelationshipDialog({
  open,
  ...props
}: RelationshipFormProps & { open: boolean }) {
  return (
    <Dialog open={open} onClose={props.onClose} title="Add relationship">
      <RelationshipForm {...props} />
    </Dialog>
  );
}
