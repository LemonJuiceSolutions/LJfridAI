'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ChartTheme, DEFAULT_CHART_THEME, hexToHsl } from '@/lib/chart-theme';
import { getChartThemeAction } from '@/actions/chart-theme';

interface ChartThemeContextType {
  theme: ChartTheme;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const ChartThemeContext = createContext<ChartThemeContextType | null>(null);

export function ChartThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ChartTheme>(DEFAULT_CHART_THEME);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTheme = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getChartThemeAction();
      if (result.theme) {
        setTheme(result.theme);
      }
    } catch {
      // fallback to defaults
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTheme(); }, [fetchTheme]);

  // Sync first 5 colors as CSS variables so dashboard charts (which use hsl(var(--chart-n))) auto-update
  useEffect(() => {
    if (isLoading) return;
    const root = document.documentElement;
    theme.colors.slice(0, 5).forEach((hex, i) => {
      root.style.setProperty(`--chart-${i + 1}`, hexToHsl(hex));
    });
  }, [theme, isLoading]);

  return (
    <ChartThemeContext.Provider value={{ theme, isLoading, refetch: fetchTheme }}>
      {children}
    </ChartThemeContext.Provider>
  );
}

export function useChartTheme(): ChartThemeContextType {
  const context = useContext(ChartThemeContext);
  if (!context) {
    return {
      theme: DEFAULT_CHART_THEME,
      isLoading: false,
      refetch: async () => {},
    };
  }
  return context;
}
