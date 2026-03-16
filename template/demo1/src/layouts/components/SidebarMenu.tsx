import { useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { MENU, MenuItem } from '@/config/menu.config';
import { Link, To, useLocation } from 'react-router';
import clsx from 'clsx';
import MetisMenu from 'metismenujs';
import { useSettings } from '@/contexts/SettingsContext';
import { Badge } from 'react-bootstrap';

const SidebarMenu = () => {
  const location = useLocation(); // Gets the current location object
  const metisMenuRef = useRef<MetisMenu | null>(null);
  const linkElementsRef = useRef<HTMLAnchorElement[]>([]);
  const lastPathnameRef = useRef<string>('');

  const sidebarMenuItems = MENU;

  // Validate menu items to prevent rendering errors
  const validateMenuItem = useCallback((item: MenuItem): boolean => {
    return item && typeof item === 'object' && typeof item.label === 'string' && item.label.trim().length > 0;
  }, []);

  const hasSubItems = (item: MenuItem) => item.subItems !== undefined && item.subItems.length > 0;

  // Memoize the base URL to avoid recalculating on every render
  const baseUrl = useMemo(() => {
    return import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
  }, []);

  // Memoize the current pathname
  const currentPathname = useMemo(() => {
    return baseUrl + location.pathname;
  }, [baseUrl, location.pathname]);

  // Cache link elements to avoid repeated DOM queries
  const getLinkElements = useCallback(() => {
    if (linkElementsRef.current.length === 0) {
      try {
        const elements = document.getElementsByClassName('nav-link-ref');
        linkElementsRef.current = Array.from(elements) as HTMLAnchorElement[];
      } catch (error) {
        console.warn('Error getting link elements:', error);
        linkElementsRef.current = [];
      }
    }
    return linkElementsRef.current;
  }, []);

  // Clear link elements cache when needed
  const clearLinkElementsCache = useCallback(() => {
    linkElementsRef.current = [];
  }, []);

  // Clear cache when component unmounts or DOM changes
  useEffect(() => {
    return () => {
      clearLinkElementsCache();
    };
  }, [clearLinkElementsCache]);

  // Clear cache when menu items change
  useEffect(() => {
    clearLinkElementsCache();
  }, [sidebarMenuItems, clearLinkElementsCache]);

  const resetMenu = useCallback((linkElements: HTMLAnchorElement[]) => {
    if (!linkElements || linkElements.length === 0) {
      return; // Early return if no elements to process
    }

    // Use a more efficient approach by collecting all elements to modify
    const elementsToReset = new Set<Element>();

    for (let i = 0; i < linkElements.length; i++) {
      const currentLinkEl = linkElements[i];

      if (currentLinkEl) {
        try {
          let parentEl = currentLinkEl.parentElement;
          let depth = 0;
          const maxDepth = 5; // Prevent infinite loops

          while (parentEl && depth < maxDepth) {
            if (parentEl.classList.contains('mm-active')) {
              elementsToReset.add(parentEl);
            }
            if (parentEl.classList.contains('mm-show')) {
              elementsToReset.add(parentEl);
            }
            parentEl = parentEl.parentElement;
            depth++;
          }
        } catch (error) {
          console.warn('Error resetting menu state:', error);
        }
      }
    }

    // Batch DOM modifications
    elementsToReset.forEach((element) => {
      element.classList.remove('mm-active', 'mm-show');
    });
  }, []);

  const activateMenu = useCallback(() => {
    try {
      // Skip if pathname hasn't changed
      if (lastPathnameRef.current === currentPathname) {
        return;
      }

      const linkElements = getLinkElements();

      if (!linkElements || linkElements.length === 0) {
        return; // Early return if no link elements found
      }

      // Only reset if we're changing to a different path
      if (lastPathnameRef.current !== '') {
        resetMenu(linkElements);
      }

      let currentLinkEl = null;

      // Use more efficient search with early exit
      for (let i = 0; i < linkElements.length; i++) {
        const link = linkElements[i];
        if (
          link.pathname === currentPathname ||
          (currentPathname.startsWith(link.pathname) && link.pathname !== baseUrl + '/')
        ) {
          currentLinkEl = link;
          break;
        }
      }

      if (currentLinkEl) {
        try {
          // Use a more efficient approach by collecting all elements to activate
          const elementsToActivate = new Map<Element, string[]>();

          let parentEl = currentLinkEl.parentElement;
          let depth = 0;
          const maxDepth = 5; // Prevent infinite loops

          while (parentEl && depth < maxDepth && parentEl.id !== 'sidebar-menu') {
            if (parentEl.tagName === 'LI') {
              elementsToActivate.set(parentEl, ['mm-active']);
            } else if (parentEl.tagName === 'UL') {
              elementsToActivate.set(parentEl, ['mm-show']);
            }
            parentEl = parentEl.parentElement;
            depth++;
          }

          // Batch DOM modifications
          elementsToActivate.forEach((classes, element) => {
            classes.forEach((className) => {
              element.classList.add(className);
            });
          });
        } catch (error) {
          console.warn('Error activating menu state:', error);
        }
      }

      // Update last pathname
      lastPathnameRef.current = currentPathname;
    } catch (error) {
      console.error('Error in activateMenu:', error);
    }
  }, [currentPathname, baseUrl, getLinkElements, resetMenu]);

  const activateMenuRef = useRef<(() => void) | null>(null);

  // Update the ref whenever activateMenu changes
  useEffect(() => {
    activateMenuRef.current = activateMenu;
  }, [activateMenu]);

  useEffect(() => {
    try {
      // Clean up any existing MetisMenu instance
      if (metisMenuRef.current) {
        try {
          metisMenuRef.current.dispose();
        } catch (error) {
          console.warn('Error disposing existing MetisMenu:', error);
        }
      }

      // Create new MetisMenu instance
      const mm = new MetisMenu('#sidebar-menu', { toggle: true });
      metisMenuRef.current = mm;

      // Initial menu activation
      if (activateMenuRef.current) {
        activateMenuRef.current();
      }

      return () => {
        try {
          if (metisMenuRef.current) {
            metisMenuRef.current.dispose();
            metisMenuRef.current = null;
          }
          // Clear link elements cache on cleanup
          clearLinkElementsCache();
        } catch (error) {
          console.warn('Error disposing MetisMenu:', error);
        }
      };
    } catch (error) {
      console.error('Error initializing sidebar menu:', error);
    }
  }, [clearLinkElementsCache]); // Add clearLinkElementsCache to dependencies

  useEffect(() => {
    try {
      if (activateMenuRef.current) {
        activateMenuRef.current();
      }
    } catch (error) {
      console.error('Error activating menu on location change:', error);
    }
  }, [location.pathname]); // Only depend on location.pathname

  const { toggleMobileSidebar } = useSettings();

  return (
    <ul className="sidebar-nav metismenu" id="sidebar-menu" role="navigation" aria-label="Main navigation">
      {sidebarMenuItems.map((menuItemLevelOne) => {
        try {
          if (!validateMenuItem(menuItemLevelOne)) {
            console.warn('Invalid menu item:', menuItemLevelOne);
            return null;
          }

          return menuItemLevelOne.isTitle ? (
            <li key={menuItemLevelOne.label} className="nav-item nav-category">
              {menuItemLevelOne.label}
            </li>
          ) : (
            <li key={menuItemLevelOne.label} className="nav-item">
              {hasSubItems(menuItemLevelOne) ? (
                <>
                  <a className="nav-link" href="#/" aria-expanded="false" aria-haspopup="true">
                    {menuItemLevelOne.icon && <menuItemLevelOne.icon className="link-icon" aria-hidden="true" />}
                    <span className="link-title"> {menuItemLevelOne.label}</span>
                    <ChevronDown className="link-arrow" aria-hidden="true" />
                  </a>
                  <ul className="sidebar-nav sub-menu nav-second-level" aria-expanded="false" role="menu">
                    {menuItemLevelOne.subItems?.map((menuItemLevelTwo) => {
                      try {
                        if (!validateMenuItem(menuItemLevelTwo)) {
                          console.warn('Invalid sub-menu item:', menuItemLevelTwo);
                          return null;
                        }

                        return (
                          <li
                            key={menuItemLevelTwo.label}
                            className={clsx('nav-item', hasSubItems(menuItemLevelTwo) && 'side-nav-item')}
                            role="none"
                          >
                            {hasSubItems(menuItemLevelTwo) ? (
                              <>
                                <a
                                  className="nav-link side-nav-link-a-ref"
                                  href="#/"
                                  aria-expanded="false"
                                  aria-haspopup="true"
                                >
                                  <span className="link-title"> {menuItemLevelTwo.label}</span>
                                  <ChevronDown className="link-arrow" aria-hidden="true" />
                                </a>
                                <ul className="sidebar-nav sub-menu nav-third-level" aria-expanded="false" role="menu">
                                  {menuItemLevelTwo.subItems?.map((menuItemLevelThree) => {
                                    try {
                                      if (!validateMenuItem(menuItemLevelThree) || !menuItemLevelThree.link) {
                                        console.warn('Invalid third-level menu item:', menuItemLevelThree);
                                        return null;
                                      }

                                      return (
                                        <li key={menuItemLevelThree.label} className="nav-item" role="none">
                                          <Link
                                            className="nav-link nav-link-ref"
                                            to={menuItemLevelThree.link as To}
                                            onClick={toggleMobileSidebar}
                                            role="menuitem"
                                          >
                                            {menuItemLevelThree.label}
                                          </Link>
                                        </li>
                                      );
                                    } catch (error) {
                                      console.error('Error rendering third-level menu item:', error);
                                      return null;
                                    }
                                  })}
                                </ul>
                              </>
                            ) : (
                              <Link
                                className="nav-link nav-link-ref"
                                to={(menuItemLevelTwo.link || '/') as To}
                                onClick={toggleMobileSidebar}
                                role="menuitem"
                              >
                                {menuItemLevelTwo.label}
                              </Link>
                            )}
                          </li>
                        );
                      } catch (error) {
                        console.error('Error rendering sub-menu item:', error);
                        return null;
                      }
                    })}
                  </ul>
                </>
              ) : menuItemLevelOne.isExternalLink ? (
                <a className="nav-link" href={menuItemLevelOne.link || '#'} target="_blank" rel="noopener noreferrer">
                  {menuItemLevelOne.icon && <menuItemLevelOne.icon className="link-icon" aria-hidden="true" />}
                  <span className="link-title"> {menuItemLevelOne.label}</span>
                  {menuItemLevelOne.badge && (
                    <Badge
                      bg={menuItemLevelOne.badge.variant}
                      text={menuItemLevelOne.badge.isDarkText ? 'dark' : 'light'}
                      pill={menuItemLevelOne.badge.isPill}
                    >
                      {menuItemLevelOne.badge.text}
                    </Badge>
                  )}
                </a>
              ) : (
                <Link
                  className="nav-link nav-link-ref"
                  to={(menuItemLevelOne.link || '/') as To}
                  onClick={toggleMobileSidebar}
                >
                  {menuItemLevelOne.icon && <menuItemLevelOne.icon className="link-icon" aria-hidden="true" />}
                  <span className="link-title"> {menuItemLevelOne.label}</span>
                  {menuItemLevelOne.badge && (
                    <Badge
                      bg={menuItemLevelOne.badge.variant}
                      text={menuItemLevelOne.badge.isDarkText ? 'dark' : 'light'}
                      pill={menuItemLevelOne.badge.isPill}
                    >
                      {menuItemLevelOne.badge.text}
                    </Badge>
                  )}
                </Link>
              )}
            </li>
          );
        } catch (error) {
          console.error('Error rendering menu item:', error);
          return null;
        }
      })}
    </ul>
  );
};

export default SidebarMenu;
