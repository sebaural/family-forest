import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ONBOARDING_COMPLETE } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Get started · FamilyForest",
  description: "Name your first family tree, add yourself and invite a relative.",
};

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/sign-in");

  const userId = session.user.id;
  const [user, firstTree, sharedCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, onboardingStep: true } }),
    db.familyTree.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    db.treeCollaborator.count({ where: { userId } }),
  ]);
  if (!user || user.onboardingStep >= ONBOARDING_COMPLETE) redirect("/dashboard");
  // Someone who already had trees before starting doesn't need the wizard.
  if (user.onboardingStep === 0 && (firstTree || sharedCount > 0)) redirect("/dashboard");

  return (
    <OnboardingWizard
      name={user.name}
      initialStep={firstTree ? Math.max(user.onboardingStep, 1) : 0}
      initialTreeId={firstTree?.id ?? null}
    />
  );
}
