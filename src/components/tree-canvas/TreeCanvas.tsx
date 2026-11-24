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
  const [menu, setMenu] = useState<{ member: Member; x: number; y: number; returnFocus?: HTMLElement } | null>(null);
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

  /**
   * Keyboard access for focused nodes (Tab moves between them): Enter opens the
   * member, Delete asks to delete them, and the Menu key or Shift+F10 opens the
   * context menu. React Flow's own delete key is off, so nothing is removed
   * without the confirmation dialog.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node");
      const id = element?.dataset.id;
      const member = id ? nodes.find((node) => node.id === id)?.data.member : undefined;
      if (!element || !member) return;

      if (event.key === "Enter") {
        event.preventDefault();
        onOpenMember(member);
      } else if (canEdit && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        menuActions.onDelete(member);
      } else if (canEdit && (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) {
        event.preventDefault();
        const rect = element.getBoundingClientRect();
        setMenu({ member, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, returnFocus: element });
      }
    },
    [nodes, canEdit, onOpenMember, menuActions],
  );

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
    <div
      ref={containerRef}
      role="application"
      aria-label="Family tree canvas"
      aria-describedby="tree-canvas-help"
      className="relative min-h-0 flex-1"
      data-testid="tree-canvas"
      onKeyDown={onKeyDown}
    >
      <p id="tree-canvas-help" className="sr-only">
        Press Tab to move between family members. Press Enter to open a member
        {canEdit ? ", Delete to delete them, or Shift+F10 for more actions" : ""}. Pinch or use the
        zoom buttons to zoom.
      </p>
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={canEdit}
        nodesConnectable={false}
        nodesFocusable
        edgesFocusable={false}
        deleteKeyCode={null}
        zoomOnPinch
        panOnDrag
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
        {/* Below 640 px the toolbar is a bar along the bottom, clear of the graph's top row. */}
        <Panel
          position="top-left"
          className="!m-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5 max-sm:!inset-x-0 max-sm:!bottom-0 max-sm:!top-auto max-sm:!m-0 max-sm:max-w-none max-sm:justify-center max-sm:border-t max-sm:border-gray-200 max-sm:bg-background/95 max-sm:p-2 max-sm:dark:border-gray-800"
        >
          {canEdit && (
            <button type="button" className={toolbarButton} onClick={resetLayout}>
              Reset layout
            </button>
          )}
          <ExportButtons containerRef={containerRef} showPdf={canEdit} />
        </Panel>
        <Background />
        <Controls showInteractive={false} className="max-sm:!bottom-14" />
        <MiniMap pannable zoomable className="!hidden sm:!block" />
      </ReactFlow>

      {menu && canEdit && (
        <NodeContextMenu
          member={menu.member}
          x={menu.x}
          y={menu.y}
          {...menuActions}
          onClose={() => {
            menu.returnFocus?.focus();
            closeMenu();
          }}
        />
      )}
    </div>
  );
}

