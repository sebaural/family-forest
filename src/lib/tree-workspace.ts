/** Shared by the tree page (server) and the workspace (client). */

/** Page size for members.list; the tree page prefetches the first page with it. */
export const MEMBERS_PAGE_SIZE = 100;

export type WorkspaceView = "list" | "graph";

/** Cookie holding the List | Graph choice per tree, so the server renders the right view. */
export const viewCookieName = (treeId: string) => `ff_view_${treeId}`;
