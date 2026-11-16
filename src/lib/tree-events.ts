// Shared by the server broadcaster and the client subscriber.
export type TreeEventType = "members_changed" | "access_changed";
export const treeChannelName = (treeId: string) => `tree:${treeId}`;

/** Browser-safe Realtime settings, passed from the server page as props. */
export type RealtimeClientConfig = { url: string; publishableKey: string };
