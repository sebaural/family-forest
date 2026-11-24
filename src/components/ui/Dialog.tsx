"use client";

import { useEffect, useId, useRef, useState } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * "drawer" slides in from the right; below 640 px it is a full-screen bottom
   * sheet that slides up and closes with a swipe down or its close button.
   */
  variant?: "modal" | "drawer";
  children: React.ReactNode;
}

const variants = {
  modal: "w-[calc(100%-2rem)] max-w-md rounded-lg p-6",
  drawer:
    "ff-drawer m-0 ml-auto h-dvh max-h-none w-full max-w-none p-6 max-sm:mt-auto max-sm:px-4 max-sm:pt-2 sm:max-w-md",
};

/** How far a downward swipe on the sheet's handle must travel to close it. */
const SWIPE_CLOSE_PX = 90;

/** Native <dialog>: provides the focus trap, Esc handling and backdrop. */
export function Dialog({ open, onClose, title, variant = "modal", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const swipeStart = useRef<number | null>(null);
  const swipeDistance = useRef(0);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) setDragY(0);
  }, [open]);

  const isDrawer = variant === "drawer";
  const swipeHandlers = isDrawer
    ? {
        onTouchStart: (event: React.TouchEvent) => {
          swipeStart.current = event.touches[0]?.clientY ?? null;
          swipeDistance.current = 0;
        },
        onTouchMove: (event: React.TouchEvent) => {
          const start = swipeStart.current;
          const y = event.touches[0]?.clientY;
          if (start === null || y === undefined) return;
          swipeDistance.current = Math.max(0, y - start);
          setDragY(swipeDistance.current);
        },
        onTouchEnd: () => {
          const distance = swipeDistance.current;
          swipeStart.current = null;
          swipeDistance.current = 0;
          setDragY(0);
          if (distance > SWIPE_CLOSE_PX) onClose();
        },
      }
    : {};

  return (
    <dialog
      ref={ref}
      // React propagates a nested dialog's close event up to this one; ignore it.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      className={`bg-background text-foreground shadow-xl backdrop:bg-black/50 dark:border dark:border-gray-700 ${variants[variant]}`}
    >
      {/* Children mount only while open, so forms and mutations start fresh. */}
      {open && (
        <>
          {isDrawer && (
            <div {...swipeHandlers} className="-mx-4 mb-2 flex touch-none flex-col items-center px-4 pb-1 sm:hidden">
              <span aria-hidden className="mt-1 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
          )}
          <div className="mb-4 flex items-start justify-between gap-3" {...swipeHandlers}>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {isDrawer && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-1 rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 sm:hidden"
              >
                <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                  <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
                </svg>
              </button>
            )}
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}
