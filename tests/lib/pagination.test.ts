import { describe, it, expect } from 'vitest';
import { parsePaginationParams, paginateResult } from '@/lib/pagination';

describe('parsePaginationParams', () => {
  it('returns default limit of 20 when no limit is provided', () => {
    const params = new URLSearchParams();
    const result = parsePaginationParams(params);
    expect(result.limit).toBe(20);
    expect(result.cursor).toBeUndefined();
  });

  it('parses a custom limit', () => {
    const params = new URLSearchParams({ limit: '50' });
    const result = parsePaginationParams(params);
    expect(result.limit).toBe(50);
  });

  it('clamps limit to max of 100', () => {
    const params = new URLSearchParams({ limit: '999' });
    const result = parsePaginationParams(params);
    expect(result.limit).toBe(100);
  });

  it('clamps limit to min of 1', () => {
    const params = new URLSearchParams({ limit: '-5' });
    const result = parsePaginationParams(params);
    expect(result.limit).toBe(1);
  });

  it('parses cursor when provided', () => {
    const params = new URLSearchParams({ cursor: 'abc123' });
    const result = parsePaginationParams(params);
    expect(result.cursor).toBe('abc123');
  });

  it('returns undefined cursor when not provided', () => {
    const params = new URLSearchParams();
    const result = parsePaginationParams(params);
    expect(result.cursor).toBeUndefined();
  });
});

describe('paginateResult', () => {
  it('returns all items when count is within limit', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const result = paginateResult(items, 5);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('returns items exactly at limit with no hasMore', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const result = paginateResult(items, 3);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('sets hasMore and nextCursor when items exceed limit', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
    const result = paginateResult(items, 3);
    expect(result.items).toHaveLength(3);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('3');
  });

  it('handles empty array', () => {
    const result = paginateResult([], 10);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('handles exactly 1 item over limit', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const result = paginateResult(items, 2);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('b');
  });

  it('handles single item within limit', () => {
    const items = [{ id: 'only' }];
    const result = paginateResult(items, 5);
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('handles limit of 1 with multiple items', () => {
    const items = [{ id: 'first' }, { id: 'second' }];
    const result = paginateResult(items, 1);
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('first');
  });

  it('preserves extra properties on items', () => {
    const items = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ];
    const result = paginateResult(items, 2);
    expect(result.items[0]).toEqual({ id: '1', name: 'Alice' });
    expect(result.items[1]).toEqual({ id: '2', name: 'Bob' });
  });
});
