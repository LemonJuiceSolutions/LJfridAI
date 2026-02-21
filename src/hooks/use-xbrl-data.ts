'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { parseAllXbrlAction } from '@/actions/xbrl';
import type { MultiYearFinancialData, FinancialRatios } from '@/lib/xbrl-parser';

interface UseXbrlDataResult {
  data: MultiYearFinancialData | null;
  ratios: FinancialRatios[];
  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  invalidateCache: () => void;
}

// Global cache shared across all hook instances
const globalCache = {
  data: null as MultiYearFinancialData | null,
  ratios: [] as FinancialRatios[],
  timestamp: 0,
  isLoading: false,
  promise: null as Promise<void> | null,
  subscribers: new Set<() => void>(),
  CACHE_DURATION: 10 * 60 * 1000, // 10 minuti
};

export function useXbrlData(): UseXbrlDataResult {
  const [data, setData] = useState<MultiYearFinancialData | null>(globalCache.data);
  const [ratios, setRatios] = useState<FinancialRatios[]>(globalCache.ratios);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubscribed = useRef(false);

  const loadData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    if (globalCache.isLoading && !forceRefresh) {
      if (globalCache.promise) await globalCache.promise;
      return;
    }

    if (!forceRefresh && globalCache.data && (now - globalCache.timestamp) < globalCache.CACHE_DURATION) {
      return;
    }

    globalCache.isLoading = true;
    setIsLoading(true);
    setError(null);

    globalCache.promise = (async () => {
      try {
        const result = await parseAllXbrlAction();

        if (result.error) {
          setError(result.error);
          globalCache.data = null;
          globalCache.ratios = [];
        } else if (result.data && result.ratios) {
          globalCache.data = result.data;
          globalCache.ratios = result.ratios;
          globalCache.timestamp = now;
          globalCache.subscribers.forEach(cb => cb());
        }
      } catch (err) {
        setError(String(err));
        globalCache.data = null;
        globalCache.ratios = [];
      } finally {
        globalCache.isLoading = false;
        globalCache.promise = null;
      }
    })();

    await globalCache.promise;
  }, []);

  // Sync state from global cache
  const syncFromCache = useCallback(() => {
    setData(globalCache.data);
    setRatios(globalCache.ratios);
    setIsLoading(globalCache.isLoading);
  }, []);

  useEffect(() => {
    if (!isSubscribed.current) {
      globalCache.subscribers.add(syncFromCache);
      isSubscribed.current = true;
    }

    // Load on mount if needed
    loadData();

    return () => {
      globalCache.subscribers.delete(syncFromCache);
      isSubscribed.current = false;
    };
  }, [loadData, syncFromCache]);

  const refreshData = useCallback(async () => {
    await loadData(true);
    syncFromCache();
  }, [loadData, syncFromCache]);

  const invalidateCache = useCallback(() => {
    globalCache.data = null;
    globalCache.ratios = [];
    globalCache.timestamp = 0;
  }, []);

  return { data, ratios, isLoading, error, refreshData, invalidateCache };
}
