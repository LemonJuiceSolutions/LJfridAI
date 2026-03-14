import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type ThemeModeType = 'light' | 'dark';

type ThemeModeContextType = {
  themeMode: ThemeModeType;
  storeThemeMode: (_mode: ThemeModeType) => void;
};

const ThemeModeContext = createContext<ThemeModeContextType | undefined>(undefined);

const getThemeModeFromLocalStorage = (): ThemeModeType => {
  if (typeof window === 'undefined') return 'light'; // fallback for SSR

  // Check for 'theme' in query string
  const params = new URLSearchParams(window.location.search);
  const queryTheme = params.get('theme');
  if (queryTheme === 'light' || queryTheme === 'dark') {
    localStorage.setItem('theme', queryTheme);
    return queryTheme;
  }

  const storedTheme = localStorage.getItem('theme');
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const [themeMode, setThemeMode] = useState<ThemeModeType>(() => getThemeModeFromLocalStorage());

  const storeThemeMode = (_mode: ThemeModeType) => {
    setThemeMode(_mode);
  };

  // Update DOM attribute and localStorage whenever theme mode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', themeMode);
      document.documentElement.setAttribute('data-bs-theme', themeMode);
    }
  }, [themeMode]);

  return <ThemeModeContext.Provider value={{ themeMode, storeThemeMode }}>{children}</ThemeModeContext.Provider>;
};

// Custom hook for using theme mode context
const useThemeMode = () => {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeModeProvider');
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export { ThemeModeProvider, useThemeMode };
