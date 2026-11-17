"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { useState } from "react";
import superjson from "superjson";
import { trpc } from "@/trpc/client";

let redirecting = false;

/**
 * UNAUTHORIZED from tRPC means the session is gone or its user was deleted.
 * A full navigation lets /api/session-expired clear the cookie before sign-in.
 */
function handleUnauthorized(error: unknown) {
  if (redirecting || !(error instanceof TRPCClientError)) return;
  const data = error.data as { code?: string } | undefined;
  if (data?.code !== "UNAUTHORIZED") return;
  redirecting = true;
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/api/session-expired?callbackUrl=${encodeURIComponent(here)}`);
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleUnauthorized }),
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
