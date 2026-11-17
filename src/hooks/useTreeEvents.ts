"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect } from "react";
import { treeChannelName, type RealtimeClientConfig } from "@/lib/tree-events";
import { trpc } from "@/trpc/client";

const MAX_BACKOFF_MS = 30_000;

// One client per page load, reused across workspaces with the same settings.
let browserClient: { key: string; client: SupabaseClient } | undefined;
function getBrowserClient(url: string, publishableKey: string): SupabaseClient {
  const key = `${url}|${publishableKey}`;
  if (browserClient?.key !== key) {
    browserClient = {
      key,
      client: createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
  }
  return browserClient.client;
}

/**
 * Keeps an open workspace in sync with collaborators' changes. Events carry no
 * data; they only tell the client which queries to refetch through tRPC.
 * Does nothing when Supabase Realtime isn't configured (config is null).
 */
export function useTreeEvents(treeId: string, config: RealtimeClientConfig | null) {
  const utils = trpc.useUtils();
  const url = config?.url;
  const publishableKey = config?.publishableKey;

  useEffect(() => {
    if (!url || !publishableKey) return;
    const supabase = getBrowserClient(url, publishableKey);

    const refreshMembers = () => {
      void utils.members.list.invalidate({ treeId });
      void utils.relationships.list.invalidate({ treeId });
      void utils.trees.get.invalidate({ treeId });
      void utils.trees.list.invalidate();
      void utils.activity.list.invalidate({ treeId });
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
  }, [treeId, utils, url, publishableKey]);
}
