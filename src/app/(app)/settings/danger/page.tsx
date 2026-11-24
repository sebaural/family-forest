import type { Metadata } from "next";
import { DangerZone } from "@/components/settings/DangerZone";

export const metadata: Metadata = { title: "Danger zone" };

export default function DangerZonePage() {
  return <DangerZone />;
}
