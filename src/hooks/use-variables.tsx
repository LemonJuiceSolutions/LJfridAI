'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getVariablesAction } from '@/app/actions';
import type { Variable } from '@/lib/types';

interface UseVariablesResult {
  variables: Variable[];
  isLoading: boolean;
  error: string | null;
  refreshVariables: () => Promise<void>;
  invalidateCache: () => void;
}

// Global cache state shared across all hook instances
const globalCache = {
  variables: null as Variable[] | null,
  timestamp: 0,
  isLoading: false,
  promise: null as Promise<void> | null,
  subscribers: new Set<() => void>(),
  CACHE_DURATION: 30 * 60 * 1000, // 30 minuti in millisecondi
};

/**
 * Hook per gestire le variabili con caching intelligente
 * Evita chiamate ripetute al database e migliora le performance
 */
export function useVariables(): UseVariablesResult {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref per tracciare se questo componente è già iscritto
  const isSubscribed = useRef(false);

  const loadVariables = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    
    // Se stiamo già caricando globalmente, aspetta che finisca
    if (globalCache.isLoading && !forceRefresh) {
      if (globalCache.promise) {
        await globalCache.promise;
      }
      return;
    }

    // Se abbiamo già caricato e non è passato il tempo di cache, non ricaricare
    if (!forceRefresh && globalCache.variables && (now - globalCache.timestamp) < globalCache.CACHE_DURATION) {
      return;
    }

    // Avvia il caricamento globale
    globalCache.isLoading = true;
    setIsLoading(true);
    setError(null);

    // Crea una promise per questo caricamento
    globalCache.promise = (async () => {
      try {
        const result = await getVariablesAction();
        
        if (!result) {
          console.error('[useVariables] Result is undefined');
          setError('Errore durante il caricamento delle variabili');
          globalCache.variables = [];
        } else if (result.error) {
          setError(result.error);
          globalCache.variables = [];
        } else if (result.data) {
          globalCache.variables = result.data;
          globalCache.timestamp = now;
          // Notifica tutti gli iscritti
          globalCache.subscribers.forEach(cb => cb());
        } else {
          // Fallback: result exists but no data and no error
          console.warn('[useVariables] Result exists but no data:', result);
          setError('Nessuna variabile disponibile');
          globalCache.variables = [];
        }
      } catch (err) {
        console.error('Error loading variables:', err);
        setError('Errore durante il caricamento delle variabili');
        globalCache.variables = [];
      } finally {
        globalCache.isLoading = false;
        globalCache.promise = null;
        setIsLoading(false);
      }
    })();

    await globalCache.promise;
  }, []);

  const refreshVariables = useCallback(async () => {
    await loadVariables(true); // Force refresh
  }, [loadVariables]);

  const invalidateCache = useCallback(() => {
    globalCache.variables = null;
    globalCache.timestamp = 0;
  }, []);

  // Iscrivi questo componente agli aggiornamenti del cache globale
  useEffect(() => {
    if (!isSubscribed.current) {
      const updateFromCache = () => {
        if (globalCache.variables) {
          setVariables(globalCache.variables);
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

  // Carica le variabili al mount se non sono già in cache
  useEffect(() => {
    const now = Date.now();
    if (!globalCache.variables || (now - globalCache.timestamp) >= globalCache.CACHE_DURATION) {
      loadVariables();
    }
  }, [loadVariables]);

  return {
    variables,
    isLoading,
    error,
    refreshVariables,
    invalidateCache
  };
}
