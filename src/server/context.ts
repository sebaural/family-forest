import { auth } from "@/lib/auth";
import type { TRPCContext } from "@/server/trpc";

export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await auth();
  return { session };
}
