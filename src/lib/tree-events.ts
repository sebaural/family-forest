// Shared by the server broadcaster and the client subscriber.
export type TreeEventType = "members_changed" | "access_changed";
export const treeChannelName = (treeId: string) => `tree:${treeId}`;
