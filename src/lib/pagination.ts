export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100);
  const cursor = searchParams.get('cursor') || undefined;
  return { limit, cursor };
}

export function paginateResult<T extends { id: string }>(
  items: T[],
  limit: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const paginatedItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? paginatedItems[paginatedItems.length - 1]?.id || null : null;
  return { items: paginatedItems, nextCursor, hasMore };
}
