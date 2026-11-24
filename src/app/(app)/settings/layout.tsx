import type { Metadata } from "next";
import { SettingsNav } from "@/components/settings/SettingsNav";

export const metadata: Metadata = {
  title: { template: "%s · Settings · FamilyForest", default: "Settings · FamilyForest" },
  description: "Manage your FamilyForest profile, security, notifications and account.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:flex-row">
      <aside className="sm:w-48 sm:shrink-0">
        <h1 className="mb-3 text-xl font-semibold">Settings</h1>
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </main>
  );
}
