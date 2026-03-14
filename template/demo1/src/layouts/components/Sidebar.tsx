import SidebarMenu from './SidebarMenu';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { useSettings } from '@/contexts/SettingsContext';
import SidebarLogo from './SidebarLogo';
import { X } from 'lucide-react';

const Sidebar = () => {
  const { expandSidebarMenu, shrinkSidebarMenu, toggleMobileSidebar } = useSettings();

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <SidebarLogo />
        <a className="sidebar-toggler--mobile d-flex d-lg-none" onClick={toggleMobileSidebar}>
          <X />
        </a>
      </div>
      <div className="sidebar-body" onMouseEnter={expandSidebarMenu} onMouseLeave={shrinkSidebarMenu}>
        <SimpleBar className="h-100" autoHide={false}>
          <SidebarMenu />
        </SimpleBar>
      </div>
    </nav>
  );
};

export default Sidebar;
