import { AppRoutes } from '@/routes/AppRoutes';
import { GlobalErrorBoundary } from '@/components/error-boundaries';
import { ThemeModeProvider } from '@/contexts/ThemeModeContext';
import { SettingsProvider } from '@/contexts/SettingsContext';

const App = () => {
  return (
    <GlobalErrorBoundary>
      <ThemeModeProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </ThemeModeProvider>
    </GlobalErrorBoundary>
  );
};

export default App;
