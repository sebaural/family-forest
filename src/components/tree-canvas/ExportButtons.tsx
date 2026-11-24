"use client";

import { getNodesBounds, getViewportForBounds, useReactFlow } from "@xyflow/react";
import { toJpeg, toSvg } from "html-to-image";
import Link from "next/link";
import { useState, type RefObject } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { errorText, primaryButton, secondaryButton } from "@/components/ui/styles";
import { trpc } from "@/trpc/client";

export const toolbarButton =
  "rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800";

const PADDING = 40;
const MAX_SIDE = 4096;

function download(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * SVG/JPEG export of the whole tree (every role), plus a PDF button that is a
 * Pro placeholder until Phase 7. Renders the flow's viewport with html-to-image,
 * framed to fit all nodes, like React Flow's "download image" example.
 */
export function ExportButtons({
  containerRef,
  showPdf,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  showPdf: boolean;
}) {
  const { getNodes } = useReactFlow();
  const plan = trpc.users.plan.useQuery(undefined, { enabled: showPdf });
  const [busy, setBusy] = useState<"svg" | "jpeg" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const exportImage = async (format: "svg" | "jpeg") => {
    const viewport = containerRef.current?.querySelector<HTMLElement>(".react-flow__viewport");
    const nodes = getNodes();
    if (!viewport || nodes.length === 0) return;
    setBusy(format);
    setError(null);
    try {
      const bounds = getNodesBounds(nodes);
      const width = Math.min(MAX_SIDE, Math.ceil(bounds.width + PADDING * 2));
      const height = Math.min(MAX_SIDE, Math.ceil(bounds.height + PADDING * 2));
      const { x, y, zoom } = getViewportForBounds(bounds, width, height, 0.1, 2, `${PADDING}px`);
      const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const options = {
        backgroundColor: background,
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        },
      };
      const dataUrl =
        format === "svg"
          ? await toSvg(viewport, options)
          : await toJpeg(viewport, { ...options, quality: 0.95 });
      download(dataUrl, `family-tree.${format}`);
    } catch (cause) {
      console.error("Tree export failed", cause);
      setError("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const isFree = (plan.data?.plan ?? "FREE") === "FREE";

  return (
    <>
      <button type="button" className={toolbarButton} disabled={busy !== null} onClick={() => exportImage("svg")}>
        {busy === "svg" ? "Exporting…" : "Export SVG"}
      </button>
      <button type="button" className={toolbarButton} disabled={busy !== null} onClick={() => exportImage("jpeg")}>
        {busy === "jpeg" ? "Exporting…" : "Export JPEG"}
      </button>
      {showPdf && (
        <button type="button" className={toolbarButton} onClick={() => setPdfOpen(true)} title="Pro feature">
          Export PDF ⚡ Pro
        </button>
      )}
      {error && (
        <span role="alert" className={`basis-full ${errorText}`}>
          {error}
        </span>
      )}

      <Dialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        title={isFree ? "PDF export is a Pro feature" : "PDF export is coming soon"}
      >
        <div className="space-y-4">
          <p className="text-sm">
            {isFree
              ? "Upgrade to Pro to download your family tree as a print-ready PDF. SVG and JPEG export stay free."
              : "PDF export arrives with the next release. Use SVG or JPEG export for now."}
          </p>
          <div className="flex flex-wrap gap-2">
            {isFree && (
              <Link href="/pricing" className={primaryButton}>
                See plans
              </Link>
            )}
            <button type="button" onClick={() => setPdfOpen(false)} className={secondaryButton}>
              Close
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

