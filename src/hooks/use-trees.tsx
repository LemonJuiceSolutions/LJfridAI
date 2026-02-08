'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getTreesAction } from '@/app/actions';
import type { StoredTree } from '@/lib/types';

interface UseTreesResult {
  trees: StoredTree[];
  isLoading: boolean;
  error: string | null;
  refreshTrees: () => Promise<void>;
  invalidateCache: () => void;
}

// Global cache state shared across all hook instances
const globalCache = {
  trees: null as StoredTree[] | null,
  timestamp: 0,
  isLoading: false,
  promise: null as Promise<void> | null,
  subscribers: new Set<() => void>(),
  CACHE_DURATION: 30 * 60 * 1000, // 30 minuti in millisecondi
};

/**
 * Hook per gestire gli alberi con caching intelligente
 * Evita chiamate ripetute al database e migliora le performance
 */
export function useTrees(): UseTreesResult {
  const [trees, setTrees] = useState<StoredTree[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref per tracciare se questo componente è già iscritto
  const isSubscribed = useRef(false);

  const loadTrees = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    
    // Se stiamo già caricando globalmente, aspetta che finisca
    if (globalCache.isLoading && !forceRefresh) {
      if (globalCache.promise) {
        await globalCache.promise;
      }
      return;
    }

    // Se abbiamo già caricato e non è passato il tempo di cache, non ricaricare
    if (!forceRefresh && globalCache.trees && (now - globalCache.timestamp) < globalCache.CACHE_DURATION) {
      return;
    }

    // Avvia il caricamento globale
    globalCache.isLoading = true;
    setIsLoading(true);
    setError(null);

    // Crea una promise per questo caricamento
    globalCache.promise = (async () => {
      try {
        const result = await getTreesAction();
        
        if (!result) {
          console.error('[useTrees] Result is undefined');
          setError('Errore durante il caricamento degli alberi');
          globalCache.trees = [];
        } else if (result.error) {
          setError(result.error);
          globalCache.trees = [];
        } else if (result.data) {
          globalCache.trees = result.data;
          globalCache.timestamp = now;
          // Notifica tutti gli iscritti
          globalCache.subscribers.forEach(cb => cb());
        } else {
          // Fallback: result exists but no data and no error
          console.warn('[useTrees] Result exists but no data:', result);
          setError('Nessun albero disponibile');
          globalCache.trees = [];
        }
      } catch (err) {
        console.error('Error loading trees:', err);
        setError('Errore durante il caricamento degli alberi');
        globalCache.trees = [];
      } finally {
        globalCache.isLoading = false;
        globalCache.promise = null;
        setIsLoading(false);
      }
    })();

    await globalCache.promise;
  }, []);

  const refreshTrees = useCallback(async () => {
    await loadTrees(true); // Force refresh
  }, [loadTrees]);

  const invalidateCache = useCallback(() => {
    globalCache.trees = null;
    globalCache.timestamp = 0;
  }, []);

  // Iscrivi questo componente agli aggiornamenti del cache globale
  useEffect(() => {
    if (!isSubscribed.current) {
      const updateFromCache = () => {
        if (globalCache.trees) {
          setTrees(globalCache.trees);
        }
      };
      
      globalCache.subscribers.add(updateFromCache);
      isSubscribed.current = true;
      
      // Carica i dati iniziali dal cache globale
      updateFromCache();
      
      return () => {
        globalCache.subscribers.delete(updateFromCache);
        isSubscribed.current = false;
      };
    }
  }, []);

  // Carica gli alberi al mount se non sono già in cache
  useEffect(() => {
    const now = Date.now();
    if (!globalCache.trees || (now - globalCache.timestamp) >= globalCache.CACHE_DURATION) {
      loadTrees();
    }
  }, [loadTrees]);

  return {
    trees,
    isLoading,
    error,
    refreshTrees,
    invalidateCache
  };
}
