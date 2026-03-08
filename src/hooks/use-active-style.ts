'use client';

import { useEffect, useState } from 'react';
import type { UnifiedStylePreset } from '@/lib/unified-style-types';
import { getActiveUnifiedStyleFullAction } from '@/actions/unified-style-presets';

/**
 * Hook that loads the company's active unified style preset.
 * Used by rendering components to apply the active style as fallback
 * when no explicit style overrides are provided per-widget.
 */
export function useActiveUnifiedStyle() {
  const [activeStyle, setActiveStyle] = useState<UnifiedStylePreset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getActiveUnifiedStyleFullAction()
      .then(res => {
        if (!cancelled && res.preset) {
          setActiveStyle(res.preset);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { activeStyle, loading };
}
