import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { treeChannelName, type RealtimeClientConfig, type TreeEventType } from "@/lib/tree-events";

let client: SupabaseClient | null | undefined;
function getClient(): SupabaseClient | null {
  if (client === undefined) {
    client =
      env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
        ? createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }
  return client;
}

/**
 * What the browser needs to subscribe: the URL and the publishable key, both
 * public by design. Never the secret key. Null when Realtime isn't configured.
 */
export function getRealtimeClientConfig(): RealtimeClientConfig | null {
  return env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY
    ? { url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY }
    : null;
}

/**
 * Tells everyone viewing a tree that something changed, so they refetch. The
 * payload carries no tree data: clients reload through tRPC, which checks access.
 * Best effort: a failed broadcast only means collaborators refresh later.
 */
export async function broadcastTreeEvent(treeId: string, type: TreeEventType): Promise<void> {
  const supabase = getClient();
  if (!supabase) return;

  const channel = supabase.channel(treeChannelName(treeId));
  try {
    await channel.httpSend(type, { type, treeId }, { timeout: 2000 });
  } catch (error) {
    console.error("Failed to broadcast tree event", type, treeId, error);
  } finally {
    void supabase.removeChannel(channel);
  }
}
