const button =
  "inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60";

export const primaryButton = `${button} bg-emerald-700 text-white hover:bg-emerald-800 disabled:hover:bg-emerald-700`;
export const secondaryButton = `${button} border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800`;
export const dangerButton = `${button} bg-red-700 text-white hover:bg-red-800 disabled:hover:bg-red-700`;

export const inputClass =
  "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:[color-scheme:dark]";

export const errorText = "text-sm text-red-600 dark:text-red-400";
export const mutedText = "text-sm text-gray-600 dark:text-gray-400";
