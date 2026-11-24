/** A settings section: a fieldset whose legend is the section heading. */
export function SettingsSection({
  legend,
  description,
  children,
  tone = "default",
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <fieldset
      className={`min-w-0 space-y-4 rounded-lg border p-4 sm:p-6 ${
        tone === "danger" ? "border-red-300 dark:border-red-900" : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <legend className="px-1 text-base font-semibold">{legend}</legend>
      {description && <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>}
      {children}
    </fieldset>
  );
}

export function SettingsLoading() {
  return <p className="text-sm text-gray-600 dark:text-gray-400">Loading…</p>;
}
