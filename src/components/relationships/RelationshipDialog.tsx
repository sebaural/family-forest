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
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";
import type { Member, Relationship } from "@/trpc/types";

type Direction = "parent" | "child";

function RelationshipForm({
  treeId,
  member,
  candidates,
  onClose,
}: {
  treeId: string;
  member: Member;
  candidates: Member[];
  onClose: () => void;
}) {
  const [type, setType] = useState<Relationship["type"]>("PARENT_CHILD");
  const [direction, setDirection] = useState<Direction>("parent");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();
  const addRelationship = trpc.relationships.add.useMutation({
    onSuccess: () => {
      void utils.relationships.list.invalidate({ treeId });
      onClose();
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((other) => memberFullName(other).toLowerCase().includes(q));
  }, [candidates, search]);

  const name = memberFullName(member);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetId) return;
    // A PARENT_CHILD edge always runs parent → child.
    const memberIsTo = type === "PARENT_CHILD" && direction === "child";
    addRelationship.mutate({
      treeId,
      type,
      fromId: memberIsTo ? targetId : member.id,
      toId: memberIsTo ? member.id : targetId,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Relationship</span>
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as Relationship["type"]);
            addRelationship.reset();
          }}
          className={inputClass}
        >
          <option value="PARENT_CHILD">Parent / child</option>
          <option value="SPOUSE">Spouse</option>
          <option value="PARTNER">Partner</option>
        </select>
      </label>

      {type === "PARENT_CHILD" && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Direction</legend>
          {(["parent", "child"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="direction"
                checked={direction === value}
                onChange={() => {
                  setDirection(value);
                  addRelationship.reset();
                }}
              />
              {name} is a {value} of…
            </label>
          ))}
        </fieldset>
      )}

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
          disabled={!targetId || addRelationship.isPending}
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
  treeId,
  member,
  candidates,
  open,
  onClose,
}: {
  treeId: string;
  member: Member;
  candidates: Member[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add relationship">
      <RelationshipForm treeId={treeId} member={member} candidates={candidates} onClose={onClose} />
    </Dialog>
  );
}
