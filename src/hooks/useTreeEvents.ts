"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import { env } from "@/env";
import { treeChannelName } from "@/lib/tree-events";
import { trpc } from "@/trpc/client";

const MAX_BACKOFF_MS = 30_000;

let browserClient: SupabaseClient | null | undefined;
function getBrowserClient(): SupabaseClient | null {
  if (browserClient === undefined) {
    browserClient =
      env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }
  return browserClient;
}

/**
 * Keeps an open workspace in sync with collaborators' changes. Events carry no
 * data; they only tell the client which queries to refetch through tRPC.
 * Does nothing when Supabase Realtime isn't configured.
 */
export function useTreeEvents(treeId: string) {
  const utils = trpc.useUtils();

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;

    const refreshMembers = () => {
      void utils.members.list.invalidate({ treeId });
      void utils.relationships.list.invalidate({ treeId });
      void utils.trees.get.invalidate({ treeId });
      void utils.trees.list.invalidate();
    };
    const refreshAccess = () => {
      void utils.trees.get.invalidate({ treeId });
      void utils.trees.list.invalidate();
      void utils.invitations.list.invalidate({ treeId });
    };

    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let subscribedOnce = false;
    let disposed = false;

    const subscribe = () => {
      channel = supabase
        .channel(treeChannelName(treeId))
        .on("broadcast", { event: "members_changed" }, refreshMembers)
        .on("broadcast", { event: "access_changed" }, refreshAccess)
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            // Events sent while disconnected are lost, so catch up after a reconnect.
            if (subscribedOnce) {
              refreshMembers();
              refreshAccess();
            }
            subscribedOnce = true;
            attempt = 0;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            const failed = channel;
            channel = null;
            if (failed) void supabase.removeChannel(failed);
            const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
            attempt += 1;
            retryTimer = setTimeout(subscribe, delay);
          }
        });
    };
    subscribe();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [treeId, utils]);
}
