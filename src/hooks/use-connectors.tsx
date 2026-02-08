'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getConnectorsAction } from '@/app/actions/connectors';

export interface Connector {
  id: string;
  name: string;
  type: string;
  config: string;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UseConnectorsResult {
  connectors: Connector[];
  sqlConnectors: { id: string; name: string }[];
  dataConnectors: { id: string; name: string }[];
  smtpConnectors: { id: string; name: string }[];
  isLoading: boolean;
  error: string | null;
  refreshConnectors: () => Promise<void>;
  invalidateCache: () => void;
}

// Global cache state shared across all hook instances
const globalCache = {
  connectors: null as Connector[] | null,
  timestamp: 0,
  isLoading: false,
  promise: null as Promise<void> | null,
  subscribers: new Set<() => void>(),
  CACHE_DURATION: 30 * 60 * 1000, // 30 minuti in millisecondi
};

/**
 * Hook per gestire i connector con caching intelligente
 * Evita chiamate ripetute al database e migliora le performance
 */
export function useConnectors(): UseConnectorsResult {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref per tracciare se questo componente è già iscritto
  const isSubscribed = useRef(false);

  const loadConnectors = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    
    // Se stiamo già caricando globalmente, aspetta che finisca
    if (globalCache.isLoading && !forceRefresh) {
      if (globalCache.promise) {
        await globalCache.promise;
      }
      return;
    }

    // Se abbiamo già caricato e non è passato il tempo di cache, non ricaricare
    if (!forceRefresh && globalCache.connectors && (now - globalCache.timestamp) < globalCache.CACHE_DURATION) {
      return;
    }

    // Avvia il caricamento globale
    globalCache.isLoading = true;
    setIsLoading(true);
    setError(null);

    // Crea una promise per questo caricamento
    globalCache.promise = (async () => {
      try {
        const result = await getConnectorsAction();
        
        if (!result) {
          console.error('[useConnectors] Result is undefined');
          setError('Errore durante il caricamento dei connettori');
          globalCache.connectors = [];
        } else if (result.error) {
          setError(result.error);
          globalCache.connectors = [];
        } else if (result.data) {
          globalCache.connectors = result.data;
          globalCache.timestamp = now;
          // Notifica tutti gli iscritti
          globalCache.subscribers.forEach(cb => cb());
        } else {
          // Fallback: result exists but no data and no error
          console.warn('[useConnectors] Result exists but no data:', result);
          setError('Nessun connettore disponibile');
          globalCache.connectors = [];
        }
      } catch (err) {
        console.error('Error loading connectors:', err);
        setError('Errore durante il caricamento dei connettori');
        globalCache.connectors = [];
      } finally {
        globalCache.isLoading = false;
        globalCache.promise = null;
        setIsLoading(false);
      }
    })();

    await globalCache.promise;
  }, []);

  const refreshConnectors = useCallback(async () => {
    await loadConnectors(true); // Force refresh
  }, [loadConnectors]);

  const invalidateCache = useCallback(() => {
    globalCache.connectors = null;
    globalCache.timestamp = 0;
  }, []);

  // Iscrivi questo componente agli aggiornamenti del cache globale
  useEffect(() => {
    if (!isSubscribed.current) {
      const updateFromCache = () => {
        if (globalCache.connectors) {
          setConnectors(globalCache.connectors);
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

  // Carica i connector al mount se non sono già in cache
  useEffect(() => {
    const now = Date.now();
    if (!globalCache.connectors || (now - globalCache.timestamp) >= globalCache.CACHE_DURATION) {
      loadConnectors();
    }
  }, [loadConnectors]);

  // Filtra i connector per tipo
  const sqlConnectors = connectors
    .filter(c => c.type === 'SQL')
    .map(c => ({ id: c.id, name: c.name }));

  const dataConnectors = connectors
    .filter(c => c.type !== 'SMTP')
    .map(c => ({ id: c.id, name: c.name }));

  const smtpConnectors = connectors
    .filter(c => c.type === 'SMTP')
    .map(c => ({ id: c.id, name: c.name }));

  return {
    connectors,
    sqlConnectors,
    dataConnectors,
    smtpConnectors,
    isLoading,
    error,
    refreshConnectors,
    invalidateCache
  };
}

/**
 * Hook semplificato per ottenere solo i connector SMTP
 */
export function useSmtpConnectors() {
  const { smtpConnectors, isLoading, error, refreshConnectors } = useConnectors();
  
  return {
    smtpConnectors,
    isLoading,
    error,
    refreshConnectors
  };
}
