"use client";

import "@xyflow/react/style.css";
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExportButtons, toolbarButton } from "@/components/tree-canvas/ExportButtons";
import { MemberNode } from "@/components/tree-canvas/MemberNode";
import { NodeContextMenu, type NodeMenuActions } from "@/components/tree-canvas/NodeContextMenu";
import { RelationshipEdge } from "@/components/tree-canvas/RelationshipEdge";
import { errorText, mutedText, secondaryButton } from "@/components/ui/styles";
import { useTreeGraph, type MemberNodeType } from "@/hooks/useTreeGraph";
import { getErrorMessage } from "@/lib/trpc-error";
import type { Member } from "@/trpc/types";

// Module level, so React Flow sees stable objects across renders.
const nodeTypes: NodeTypes = { member: MemberNode };
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge };

interface TreeCanvasProps extends NodeMenuActions {
  treeId: string;
  canEdit: boolean;
  /** Opens the member detail drawer. */
  onOpenMember: (member: Member) => void;
  /** Shown in the empty state for OWNER/EDITOR. */
  addMemberButton: React.ReactNode;
}

/**
 * The tree as a pannable, zoomable graph. Must sit inside a ReactFlowProvider.
 * Every change to members or relationships (yours, or a collaborator's via
 * Realtime) re-runs the layout, and nodes animate to their new places.
 */
export function TreeCanvas({
  treeId,
  canEdit,
  onOpenMember,
  addMemberButton,
  ...menuActions
}: TreeCanvasProps) {
  const graph = useTreeGraph(treeId);
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<MemberNodeType>([]);
  const [menu, setMenu] = useState<{ member: Member; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fitted = useRef(false);

  // New layout from the data: move nodes there (CSS animates the transform).
  useEffect(() => {
    setNodes(graph.nodes);
    if (graph.nodes.length === 0) {
      fitted.current = false;
    } else if (!fitted.current) {
      fitted.current = true;
      requestAnimationFrame(() => void fitView({ padding: 0.2 }));
    }
  }, [graph.nodes, setNodes, fitView]);

  const resetLayout = useCallback(() => {
    setNodes(graph.nodes);
    window.setTimeout(() => void fitView({ padding: 0.2, duration: 300 }), 0);
  }, [graph.nodes, setNodes, fitView]);

  const closeMenu = useCallback(() => setMenu(null), []);

  if (graph.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <p role="alert" className={errorText}>
          {getErrorMessage(graph.error)}
        </p>
        <button type="button" onClick={graph.refetch} className={secondaryButton}>
          Try again
        </button>
      </div>
    );
  }
  if (graph.isLoading) {
    return <p className={`flex flex-1 items-center justify-center p-6 ${mutedText}`}>Loading tree…</p>;
  }
  if (graph.members.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base">Add your first family member to build the tree</p>
        {canEdit && addMemberButton}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1" data-testid="tree-canvas">
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={canEdit}
        nodesConnectable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        onNodeClick={(_, node) => onOpenMember(node.data.member)}
        onNodeContextMenu={
          canEdit
            ? (event, node) => {
                event.preventDefault();
                setMenu({ member: node.data.member, x: event.clientX, y: event.clientY });
              }
            : undefined
        }
        onMoveStart={closeMenu}
        onPaneClick={closeMenu}
      >
        <Panel position="top-left" className="!m-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5">
          {canEdit && (
            <button type="button" className={toolbarButton} onClick={resetLayout}>
              Reset layout
            </button>
          )}
          <ExportButtons containerRef={containerRef} showPdf={canEdit} />
        </Panel>
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!hidden sm:!block" />
      </ReactFlow>

      {menu && canEdit && (
        <NodeContextMenu {...menu} {...menuActions} onClose={closeMenu} />
      )}
    </div>
  );
}

