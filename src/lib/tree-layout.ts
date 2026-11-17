import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export const NODE_WIDTH = 96;
export const NODE_HEIGHT = 112;

export interface LayoutOptions {
  rankdir: "TB" | "BT" | "LR" | "RL";
  nodesep: number;
  ranksep: number;
}

const DEFAULT_OPTIONS: LayoutOptions = { rankdir: "TB", nodesep: 60, ranksep: 80 };

/**
 * Positions nodes in generations with Dagre. Only `edges` (PARENT_CHILD) shape
 * the hierarchy; spouse and partner links are drawn but don't move generations.
 *
 * `coupleEdges` only matters for people with no parent or child in the tree:
 * Dagre would put them in the top row, far from their spouse or partner, so
 * they are placed right beside that person instead, and anyone to the right in
 * that row moves over to make room.
 */
export function applyDagreLayout<N extends Node>(
  nodes: N[],
  edges: Edge[],
  options: LayoutOptions = DEFAULT_OPTIONS,
  coupleEdges: Edge[] = [],
): N[] {
  const ids = new Set(nodes.map((node) => node.id));
  const hierarchyEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const anchored = new Set(hierarchyEdges.flatMap((edge) => [edge.source, edge.target]));

  // Free-floating people attached to someone already placed; repeat for chains.
  const attachments: { id: string; anchor: string }[] = [];
  const attached = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const edge of coupleEdges) {
      for (const [id, anchor] of [
        [edge.target, edge.source],
        [edge.source, edge.target],
      ] as const) {
        const anchorPlaced = anchored.has(anchor) || attached.has(anchor);
        if (ids.has(id) && !anchored.has(id) && !attached.has(id) && anchorPlaced) {
          attachments.push({ id, anchor });
          attached.add(id);
          changed = true;
        }
      }
    }
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph(options);
  nodes.forEach((node) => {
    if (!attached.has(node.id)) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  hierarchyEdges.forEach((edge) => g.setEdge(edge.source, edge.target));
  dagre.layout(g);

  // Dagre gives centres; React Flow positions by the top-left corner.
  const positions = new Map<string, { x: number; y: number }>();
  g.nodes().forEach((id) => {
    const { x, y } = g.node(id);
    positions.set(id, { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 });
  });

  const step = NODE_WIDTH + options.nodesep;
  for (const { id, anchor } of attachments) {
    const at = positions.get(anchor);
    if (!at) continue;
    positions.forEach((position) => {
      if (position.y === at.y && position.x > at.x) position.x += step;
    });
    positions.set(id, { x: at.x + step, y: at.y });
  }

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? { x: 0, y: 0 } }));
}
