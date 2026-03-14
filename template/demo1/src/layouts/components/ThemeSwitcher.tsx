import { ChangeEvent } from 'react';
import { useThemeMode } from '@/contexts/ThemeModeContext';
import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';

const ThemeSwitcher = () => {
  const { themeMode, storeThemeMode } = useThemeMode();

  const handleThemeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newTheme = event.target.checked ? 'dark' : 'light';
    storeThemeMode(newTheme);
  };

  return (
    <div className="theme-switcher-wrapper">
      <input type="checkbox" checked={themeMode === 'dark'} onChange={handleThemeChange} value="" id="theme-switcher" />
      <label htmlFor="theme-switcher">
        <div className={clsx('box', themeMode === 'light' ? 'light' : 'dark')}>
          <div className="ball"></div>
          <div className="icons">
            <Sun />
            <Moon />
          </div>
        </div>
      </label>
    </div>
  );
};

export default ThemeSwitcher;
