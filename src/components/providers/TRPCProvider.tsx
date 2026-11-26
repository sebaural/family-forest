"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";
import { trpc } from "@/trpc/client";

let redirecting = false;

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    (error.data as { code?: string } | undefined)?.code === "UNAUTHORIZED"
  );
}

/**
 * UNAUTHORIZED from tRPC means the session isn't active: a pre-Phase 6 token
 * that needs upgrading, or a session that was revoked or whose user is gone.
 * A full navigation lets /api/session-expired upgrade it and come back here,
 * or clear the cookie before sign-in.
 */
function handleUnauthorized(error: unknown) {
  if (redirecting || !isUnauthorized(error)) return;
  redirecting = true;
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/api/session-expired?callbackUrl=${encodeURIComponent(here)}`);
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleUnauthorized }),
        defaultOptions: {
          queries: {
            // Server-rendered data (the tree page seeds the cache) isn't refetched
            // as soon as it mounts. Focus refetches still happen once data is stale.
            staleTime: 30_000,
            // Retrying can't fix UNAUTHORIZED; redirect on the first one.
            retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 3,
          },
        },
        mutationCache: new MutationCache({ onError: handleUnauthorized }),
      }),
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
