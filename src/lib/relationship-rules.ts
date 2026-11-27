import type { RelType } from "@prisma/client";
import { RELATIVE_KINDS, type RelativeKind } from "@/lib/relationship-kind";

/**
 * Which relationships make sense between two people, given the tree so far.
 * Pure, so the Add relationship dialog and the server apply the same rules.
 */

export type Edge = { type: RelType; fromId: string; toId: string };
export type Person = { id: string; birthDate?: Date | string | null };

/** Stands in for a member that is still being added. */
export const NEW_MEMBER_ID = "__new_member__";

/** A tree's parent/child maps and which pairs are already directly linked. */
export interface Kinship {
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
  linked: Set<string>;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

export function buildKinship(edges: readonly Edge[]): Kinship {
  const kinship: Kinship = { parents: new Map(), children: new Map(), linked: new Set() };
  for (const edge of edges) addEdge(kinship, edge);
  return kinship;
}

/** Adds an edge in place, e.g. a link queued in the same request. */
export function addEdge(kinship: Kinship, edge: Edge) {
  kinship.linked.add(pairKey(edge.fromId, edge.toId));
  if (edge.type === "PARENT_CHILD") {
    addTo(kinship.parents, edge.toId, edge.fromId);
    addTo(kinship.children, edge.fromId, edge.toId);
  }
}

function walk(map: Map<string, Set<string>>, start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    for (const next of Array.from(map.get(stack.pop()!) ?? [])) {
      if (!seen.has(next) && next !== start) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

/** Everything about the subject the per-candidate checks need, computed once. */
export interface SubjectView {
  kinship: Kinship;
  subject: Person;
  ancestors: Set<string>;
  descendants: Set<string>;
  siblings: Set<string>;
}

export function subjectView(kinship: Kinship, subject: Person): SubjectView {
  const siblings = new Set<string>();
  for (const parent of Array.from(kinship.parents.get(subject.id) ?? [])) {
    for (const child of Array.from(kinship.children.get(parent) ?? [])) {
      if (child !== subject.id) siblings.add(child);
    }
  }
  return {
    kinship,
    subject,
    ancestors: walk(kinship.parents, subject.id),
    descendants: walk(kinship.children, subject.id),
    siblings,
  };
}

function birthTime(person: Person): number | null {
  if (!person.birthDate) return null;
  const time = new Date(person.birthDate).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Why `candidate` can't be the subject's `kind`, or null when it can.
 * The rules, in order:
 *  1. at most one relationship per pair;
 *  2. no links to one's own ancestors or descendants;
 *  3. no links between siblings;
 *  4. at most two parents;
 *  5. parents are born before their children (when both dates are known).
 * Several spouses or partners are fine (remarriage).
 */
export function kindError(view: SubjectView, candidate: Person, kind: RelativeKind): string | null {
  const { kinship, subject } = view;
  if (candidate.id === subject.id) return "A person cannot be linked to themselves";
  if (kinship.linked.has(pairKey(subject.id, candidate.id))) {
    return "These two people are already directly related";
  }
  if (view.ancestors.has(candidate.id) || view.descendants.has(candidate.id)) {
    return "A person can't be linked again to their own ancestor or descendant";
  }
  if (view.siblings.has(candidate.id)) return "Siblings can't be linked to each other";

  const subjectBorn = birthTime(subject);
  const candidateBorn = birthTime(candidate);
  const bothBorn = subjectBorn !== null && candidateBorn !== null;
  if (kind === "PARENT") {
    if ((kinship.parents.get(subject.id)?.size ?? 0) >= 2) return "A person can have at most two parents";
    if (bothBorn && candidateBorn >= subjectBorn) return "A parent must be born before their child";
  }
  if (kind === "CHILD") {
    if ((kinship.parents.get(candidate.id)?.size ?? 0) >= 2) return "A person can have at most two parents";
    if (bothBorn && candidateBorn <= subjectBorn) return "A child must be born after their parent";
  }
  return null;
}

export function allowedKinds(view: SubjectView, candidate: Person): Set<RelativeKind> {
  return new Set(RELATIVE_KINDS.filter((kind) => kindError(view, candidate, kind) === null));
}

/** The kinds each candidate can take; candidates with none are left out. */
export function linkOptions<T extends Person>(
  view: SubjectView,
  candidates: readonly T[],
): Map<string, Set<RelativeKind>> {
  const options = new Map<string, Set<RelativeKind>>();
  for (const candidate of candidates) {
    const kinds = allowedKinds(view, candidate);
    if (kinds.size) options.set(candidate.id, kinds);
  }
  return options;
}

/** The (subject, relative, kind) a stored edge stands for: the inverse of relativeEdge. */
export function edgeAsKind(edge: Edge): { personId: string; relativeId: string; kind: RelativeKind } {
  return {
    personId: edge.fromId,
    relativeId: edge.toId,
    kind: edge.type === "PARENT_CHILD" ? "CHILD" : edge.type,
  };
}
