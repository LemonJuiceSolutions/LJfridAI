import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

type SettingsContextType = {
  isSidebarFolded: boolean;
  isMobileSidebarOpen: boolean;
  isSidebarExpanded: boolean;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  expandSidebarMenu: () => void;
  shrinkSidebarMenu: () => void;
};

const defaultSettings: SettingsContextType = {
  isSidebarFolded: false,
  isMobileSidebarOpen: false,
  isSidebarExpanded: false,
  toggleSidebar: () => {},
  toggleMobileSidebar: () => {},
  expandSidebarMenu: () => {},
  shrinkSidebarMenu: () => {},
};

const SettingsContext = createContext<SettingsContextType>(defaultSettings);

const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [isSidebarFolded, setIsSidebarFolded] = useState(defaultSettings.isSidebarFolded);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(defaultSettings.isMobileSidebarOpen);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(defaultSettings.isSidebarExpanded);

  const toggleSidebar = () => {
    setIsSidebarFolded((prev) => !prev);
    setIsMobileSidebarOpen(false);
  };

  const toggleMobileSidebar = () => {
    if (window.matchMedia('(max-width: 991px)').matches && isSidebarFolded) {
      setIsSidebarFolded(false);
    }
    if (window.matchMedia('(max-width: 991px)').matches) {
      setIsMobileSidebarOpen((prev) => !prev);
    }
  };

  // Expand the sidebar on hover when it is in a folded state
  const expandSidebarMenu = () => {
    if (isSidebarFolded) {
      setIsSidebarExpanded(true);
    }
  };

  // Shrink the sidebar on mouse leave when it is in a expanded state
  const shrinkSidebarMenu = () => {
    if (isSidebarFolded) {
      setIsSidebarExpanded(false);
    }
  };

  // Apply CSS classes based on state changes
  useEffect(() => {
    const bodyClassList = document.body.classList;

    // Handle sidebar folded state
    if (isSidebarFolded) {
      bodyClassList.add('sidebar-folded');
    } else {
      bodyClassList.remove('sidebar-folded');
    }

    // Handle mobile sidebar open state
    if (isMobileSidebarOpen) {
      bodyClassList.add('sidebar-open');
    } else {
      bodyClassList.remove('sidebar-open');
    }

    // Handle sidebar expanded state (for hover effects)
    if (isSidebarExpanded) {
      bodyClassList.add('open-sidebar-folded');
    } else {
      bodyClassList.remove('open-sidebar-folded');
    }
  }, [isSidebarFolded, isMobileSidebarOpen, isSidebarExpanded]);

  // Initialize state from existing classes on mount (for SSR compatibility)
  useEffect(() => {
    const bodyClassList = document.body.classList;

    if (bodyClassList.contains('sidebar-folded')) {
      setIsSidebarFolded(true);
    }

    if (bodyClassList.contains('sidebar-open')) {
      setIsMobileSidebarOpen(true);
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        isSidebarFolded,
        isMobileSidebarOpen,
        isSidebarExpanded,
        toggleSidebar,
        toggleMobileSidebar,
        expandSidebarMenu,
        shrinkSidebarMenu,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// eslint-disable-next-line react-refresh/only-export-components
export { SettingsProvider, useSettings };
