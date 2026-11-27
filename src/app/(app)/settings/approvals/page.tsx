import type { Metadata } from "next";
import { ApprovalSettings } from "@/components/settings/ApprovalSettings";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalSettingsPage() {
  return <ApprovalSettings />;
}
