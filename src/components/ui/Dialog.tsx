"use client";

import { useEffect, useId, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "drawer" slides in from the right and is full-screen on mobile. */
  variant?: "modal" | "drawer";
  children: React.ReactNode;
}

const variants = {
  modal: "w-[calc(100%-2rem)] max-w-md rounded-lg",
  drawer: "m-0 ml-auto h-dvh max-h-none w-full max-w-none sm:max-w-md",
};

/** Native <dialog>: provides the focus trap, Esc handling and backdrop. */
export function Dialog({ open, onClose, title, variant = "modal", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className={`bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50 dark:border dark:border-gray-700 ${variants[variant]}`}
    >
      {/* Children mount only while open, so forms and mutations start fresh. */}
      {open && (
        <>
          <h2 id={titleId} className="mb-4 text-lg font-semibold">
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}
