import Link from "next/link";

interface PlanLimitBannerProps {
  current: number;
  limit: number;
  resource: "members" | "trees" | "collaborators";
}

const WARNING_RATIO = 0.8;

/** A UX guard only: the server enforces the limit. Unlimited plans never show it. */
export function PlanLimitBanner({ current, limit, resource }: PlanLimitBannerProps) {
  if (!Number.isFinite(limit) || current / limit < WARNING_RATIO) return null;

  const singular = { members: "member", trees: "tree", collaborators: "collaborator" }[resource];
  const upgrade = (
    <Link href="/pricing" className="font-medium underline">
      Upgrade to Pro
    </Link>
  );

  if (current >= limit) {
    return (
      <p
        role="status"
        className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        {resource === "collaborators" ? (
          <>
            This tree has reached its {limit}-{singular} limit. {upgrade} to invite more people.
          </>
        ) : (
          <>
            You&apos;ve reached the {limit}-{singular} limit on the Free plan. {upgrade} to add more.
          </>
        )}
      </p>
    );
  }

  return (
    <p
      role="status"
      className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {resource === "collaborators" ? (
        <>
          {current} of {limit} collaborators used. {upgrade} to invite more people.
        </>
      ) : (
        <>
          {current} of {limit} {resource} used on the Free plan. {upgrade} for unlimited {resource}.
        </>
      )}
    </p>
  );
}
