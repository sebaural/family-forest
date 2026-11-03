import Link from "next/link";
import { mutedText, secondaryButton } from "@/components/ui/styles";

// Placeholder: plans and checkout arrive with Stripe in Phase 7.
export default function PricingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Pricing</h1>
      <p className={mutedText}>
        Paid plans with unlimited trees and members are coming soon. There&apos;s nothing to buy
        yet, and your family tree stays safe on the Free plan.
      </p>
      <Link href="/dashboard" className={secondaryButton}>
        Back to your trees
      </Link>
    </main>
  );
}
