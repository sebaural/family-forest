import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TreeDashboard } from "@/components/trees/TreeDashboard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ONBOARDING_COMPLETE } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Your trees · FamilyForest",
  description: "Your family trees and the trees shared with you.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");

  // New users with no trees at all go through onboarding first. Anyone who
  // already has a tree (owned or shared) is never interrupted.
  const userId = session.user.id;
  const user = await db.user.findUnique({ where: { id: userId }, select: { onboardingStep: true } });
  if (user && user.onboardingStep < ONBOARDING_COMPLETE) {
    // Trees awaiting the owner's approval count too: that person was invited and
    // mustn't be pushed into onboarding (which would send them straight back here).
    const trees = await db.familyTree.count({
      where: { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
    });
    if (trees === 0) redirect("/onboarding");
  }

  const awaiting = await db.treeCollaborator.findMany({
    where: { userId, approvedAt: null },
    select: { tree: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <TreeDashboard
      userId={userId}
      treeNotFound={searchParams.error === "tree-not-found"}
      awaitingApproval={awaiting.map((entry) => entry.tree.name)}
    />
  );
}
