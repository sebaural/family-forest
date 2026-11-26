"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { errorText, mutedText, secondaryButton } from "@/components/ui/styles";
import { getErrorMessage } from "@/lib/trpc-error";
import { trpc } from "@/trpc/client";

function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function ActorAvatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- OAuth avatar hosts vary
      <img
        src={image}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200"
    >
      {initials(name)}
    </span>
  );
}

/** Re-renders every minute so "3 minutes ago" stays current. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * The 50 newest changes to a tree. Collaborators' changes arrive live: the
 * Realtime handler in useTreeEvents invalidates activity.list.
 */
export function ActivityPanel({ treeId, onClose }: { treeId: string; onClose: () => void }) {
  const activity = trpc.activity.list.useQuery({ treeId });
  useNow();

  return (
    <div className="flex flex-col gap-4">
      {activity.isPending && (
        <p className={`flex items-center gap-2 ${mutedText}`}>
          <Spinner /> Loading activity…
        </p>
      )}
      {activity.error && (
        <div className="space-y-2">
          <p role="alert" className={errorText}>
            {getErrorMessage(activity.error)}
          </p>
          <button type="button" onClick={() => activity.refetch()} className={secondaryButton}>
            Try again
          </button>
        </div>
      )}
      {activity.data?.length === 0 && <p className={mutedText}>No changes yet.</p>}
      {activity.data && activity.data.length > 0 && (
        <ol className="space-y-3" role="log" aria-live="polite" aria-label="Recent activity">
          {activity.data.map((entry) => (
            <li key={entry.id} className="flex gap-3" data-action={entry.action}>
              <ActorAvatar name={entry.actorName} image={entry.actorImage} />
              <div className="min-w-0">
                <p className="break-words text-sm">{entry.description}</p>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  title={entry.createdAt.toLocaleString()}
                  className="text-xs text-gray-500 dark:text-gray-400"
                >
                  {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button type="button" onClick={onClose} className={`${secondaryButton} self-start`}>
        Close
      </button>
    </div>
  );
}
