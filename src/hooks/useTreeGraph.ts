"use client";

import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { useMemo } from "react";
import { useTreeMembers } from "@/hooks/useTreeMembers";
import { applyDagreLayout, NODE_HEIGHT, NODE_WIDTH } from "@/lib/tree-layout";
import { trpc } from "@/trpc/client";
import type { Member, Relationship } from "@/trpc/types";

export type MemberNodeType = Node<{ member: Member }, "member">;
export type CoupleKind = "SPOUSE" | "PARTNER";
export type RelationshipEdgeType = Edge<{ kind: CoupleKind }, "relationship">;
export type TreeEdge = RelationshipEdgeType | Edge;

const PARENT_EDGE_STYLE = { stroke: "var(--accent)", strokeWidth: 1.5 };

/** Members and relationships as laid-out React Flow nodes and edges. */
export function buildTreeGraph(members: Member[], relationships: Relationship[]) {
  const ids = new Set(members.map((member) => member.id));
  // Members still loading (paged) can be missing; skip their edges until they arrive.
  const links = relationships.filter((rel) => ids.has(rel.fromId) && ids.has(rel.toId));

  const parentEdges: Edge[] = links
    .filter((rel) => rel.type === "PARENT_CHILD")
    .map((rel) => ({
      id: rel.id,
      source: rel.fromId,
      target: rel.toId,
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "straight",
      style: PARENT_EDGE_STYLE,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--accent)" },
    }));

  const coupleLinks = links.filter(
    (rel): rel is Relationship & { type: CoupleKind } => rel.type !== "PARENT_CHILD",
  );

  const nodes = applyDagreLayout<MemberNodeType>(
    members.map((member) => ({
      id: member.id,
      type: "member",
      position: { x: 0, y: 0 },
      // Known size up front, so fitView works before the nodes are measured.
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: { member },
    })),
    parentEdges,
    undefined,
    coupleLinks.map((rel) => ({ id: rel.id, source: rel.fromId, target: rel.toId })),
  );

  // Couples join side to side, on whichever sides face each other after layout.
  const x = new Map(nodes.map((node) => [node.id, node.position.x]));
  const coupleEdges: RelationshipEdgeType[] = coupleLinks.map((rel) => {
    const leftToRight = (x.get(rel.fromId) ?? 0) <= (x.get(rel.toId) ?? 0);
    return {
      id: rel.id,
      source: rel.fromId,
      target: rel.toId,
      sourceHandle: leftToRight ? "right" : "left",
      targetHandle: leftToRight ? "left" : "right",
      type: "relationship",
      data: { kind: rel.type },
    };
  });

  return { nodes, edges: [...parentEdges, ...coupleEdges] as TreeEdge[] };
}

/**
 * Graph data for the canvas. Layout reruns only when members or relationships
 * change, including after a collaborator's change arrives over Realtime.
 */
export function useTreeGraph(treeId: string) {
  const { members, isLoading, error, refetch } = useTreeMembers(treeId);
  const relationships = trpc.relationships.list.useQuery({ treeId });

  const graph = useMemo(
    () => buildTreeGraph(members, relationships.data ?? []),
    [members, relationships.data],
  );

  return {
    ...graph,
    members,
    isLoading: isLoading || relationships.isPending,
    error: error ?? relationships.error,
    refetch: () => {
      void refetch();
      void relationships.refetch();
    },
  };
}
