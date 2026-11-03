"use client";

import { useEffect, useMemo } from "react";
import { trpc } from "@/trpc/client";

/**
 * Loads every member of a tree. members.list is cursor-paginated, so remaining
 * pages are fetched automatically and flattened; search can then run client-side.
 */
export function useTreeMembers(treeId: string) {
  const query = trpc.members.list.useInfiniteQuery(
    { treeId, limit: 100 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const members = useMemo(() => data?.pages.flatMap((page) => page.members) ?? [], [data]);

  return {
    members,
    isLoading: query.isPending,
    isLoadingMore: !isError && (hasNextPage || isFetchingNextPage),
    error: query.error,
    refetch: query.refetch,
  };
}
