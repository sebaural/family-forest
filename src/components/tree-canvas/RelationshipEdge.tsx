"use client";

import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { RelationshipEdgeType } from "@/hooks/useTreeGraph";

const EDGE_STYLE = {
  SPOUSE: { stroke: "var(--green)", strokeDasharray: "6 4", label: "Spouse" },
  PARTNER: { stroke: "var(--amber)", strokeDasharray: "2 4", label: "Partner" },
} as const;

/**
 * Spouse (dashed) and partner (dotted) links. The label is SVG, shown on hover
 * by CSS (.ff-edge-label in globals.css), so it also survives image export.
 */
export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<RelationshipEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const { label, ...style } = EDGE_STYLE[data?.kind ?? "SPOUSE"];

  return (
    <>
      <BaseEdge id={id} path={path} style={{ ...style, strokeWidth: 2 }} interactionWidth={16} />
      <g className="ff-edge-label" transform={`translate(${labelX} ${labelY})`}>
        <rect x={-26} y={-10} width={52} height={20} rx={4} fill="var(--background)" stroke={style.stroke} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={11} fill="var(--foreground)">
          {label}
        </text>
      </g>
    </>
  );
}
