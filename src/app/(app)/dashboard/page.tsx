import { redirect } from "next/navigation";
import { TreeDashboard } from "@/components/trees/TreeDashboard";
import { auth } from "@/lib/auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");

  return (
    <TreeDashboard
      userId={session.user.id}
      treeNotFound={searchParams.error === "tree-not-found"}
    />
  );
}
