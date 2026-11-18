import type { RelType } from "@prisma/client";

/** A relative's role toward a person: "B is A's PARENT". */
export type RelativeKind = "PARENT" | "CHILD" | "SPOUSE" | "PARTNER";

export const RELATIVE_KINDS: readonly RelativeKind[] = ["PARENT", "CHILD", "SPOUSE", "PARTNER"];

export const RELATIVE_LABEL: Record<RelativeKind, string> = {
  PARENT: "Parent",
  CHILD: "Child",
  SPOUSE: "Spouse",
  PARTNER: "Partner",
};

export const RELATIVE_NOUN: Record<RelativeKind, string> = {
  PARENT: "parent",
  CHILD: "child",
  SPOUSE: "spouse",
  PARTNER: "partner",
};

/** If B is A's parent, A is B's child. Spouse and partner are symmetric. */
export function inverseKind(kind: RelativeKind): RelativeKind {
  return kind === "PARENT" ? "CHILD" : kind === "CHILD" ? "PARENT" : kind;
}

/**
 * The stored edge for "relativeId is personId's `kind`". A PARENT_CHILD edge
 * always runs parent → child; spouse and partner edges run person → relative.
 */
export function relativeEdge(
  kind: RelativeKind,
  personId: string,
  relativeId: string,
): { type: RelType; fromId: string; toId: string } {
  switch (kind) {
    case "PARENT":
      return { type: "PARENT_CHILD", fromId: relativeId, toId: personId };
    case "CHILD":
      return { type: "PARENT_CHILD", fromId: personId, toId: relativeId };
    default:
      return { type: kind, fromId: personId, toId: relativeId };
  }
}
