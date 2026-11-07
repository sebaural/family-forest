import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type TreeListItem = RouterOutputs["trees"]["list"][number];
export type Member = RouterOutputs["members"]["list"]["members"][number];
export type Relationship = RouterOutputs["relationships"]["list"][number];
export type TreeDetails = RouterOutputs["trees"]["get"];
export type AccessEntry = RouterOutputs["invitations"]["list"]["entries"][number];
