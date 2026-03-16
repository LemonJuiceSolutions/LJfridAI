import { useSettings } from '@/contexts/SettingsContext';
import { useThemeMode } from '@/contexts/ThemeModeContext';
import { getUrl } from '@/utils/getUrl';
import { Link } from 'react-router';

const SidebarLogo = () => {
  const { themeMode } = useThemeMode();
  const { isSidebarFolded } = useSettings();

  return !isSidebarFolded ? (
    <Link to="/" className="sidebar-brand">
      Noble<span>UI</span>
      {/* <img 
          src={ themeMode === 'light' ? getUrl('/images/logo-mini-light.png') : getUrl('/images/logo-mini-dark.png') } 
          className="h-25px" 
          alt="logo" 
        /> */}
    </Link>
  ) : (
    <Link to="/" className="sidebar-brand sidebar-brand-mini">
      <img
        src={themeMode === 'dark' ? getUrl('/images/logo-mini-dark.png') : getUrl('/images/logo-mini-light.png')}
        className="h-25px"
        alt="Noble UI logo"
      />
    </Link>
  );
};

export default SidebarLogo;
