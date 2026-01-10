'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { navItems as defaultNavItems, settingsNavItems as defaultSettingsNavItems } from '@/lib/data';
import * as icons from 'lucide-react';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';


export type NavItem = {
    href: string;
    icon: keyof typeof icons;
    label: string;
};

type NavigationState = {
    navItems: NavItem[],
    settingsNavItems: NavItem[],
}

type NavigationContextType = {
  navItems: NavItem[];
  settingsNavItems: NavItem[];
  addNavItem: (group: 'main' | 'settings', item: Omit<NavItem, 'href'>) => void;
  updateNavItem: (group: 'main' | 'settings', item: NavItem, originalHref: string) => void;
  removeNavItem: (group: 'main' | 'settings', href: string) => void;
  moveNavItem: (group: 'main' | 'settings', fromIndex: number, toIndex: number) => void;
  restoreDefaults: () => void;
  isLoading: boolean;
};

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

const isServer = typeof window === 'undefined';


export function NavigationProvider({ children }: { children: ReactNode }) {
    const [navItems, setNavItems] = useState<NavItem[]>(defaultNavItems as NavItem[]);
    const [settingsNavItems, setSettingsNavItems] = useState<NavItem[]>(defaultSettingsNavItems as NavItem[]);
    const [isLoading, setIsLoading] = useState(true);

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userSettingsRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const tenantId = user.uid;
        return doc(firestore, 'tenants', tenantId, 'userSettings', user.uid);
    }, [user, firestore]);


    useEffect(() => {
        if (isUserLoading) return;
        if (!userSettingsRef) {
            // No user or firestore, use defaults and stop loading
            setNavItems(defaultNavItems as NavItem[]);
            setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
            setIsLoading(false);
            return;
        }

        const loadNavState = async () => {
            setIsLoading(true);
            try {
                const docSnap = await getDoc(userSettingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if(data.navigation) {
                        setNavItems(data.navigation.navItems || defaultNavItems);
                        setSettingsNavItems(data.navigation.settingsNavItems || defaultSettingsNavItems);
                    } else {
                        setNavItems(defaultNavItems as NavItem[]);
                        setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
                    }
                } else {
                     setNavItems(defaultNavItems as NavItem[]);
                    setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
                }
            } catch (error) {
                console.error("Error loading navigation state from Firestore:", error);
                setNavItems(defaultNavItems as NavItem[]);
                setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
            } finally {
                setIsLoading(false);
            }
        };

        loadNavState();

    }, [userSettingsRef, isUserLoading]);

    const saveNavState = useCallback((newNavState: NavigationState) => {
        if (userSettingsRef) {
            setDocumentNonBlocking(userSettingsRef, { navigation: newNavState }, { merge: true });
        }
    }, [userSettingsRef]);

    const addNavItem = (group: 'main' | 'settings', itemData: Omit<NavItem, 'href'>) => {
        const updater = (currentItems: NavItem[], allSettingsItems: NavItem[]) => {
            const allUsedHrefs = new Set([...currentItems.map(i => i.href), ...allSettingsItems.map(i => i.href)]);
            let newHref = '';
            
            // Find the first available placeholder page
            for (let i = 1; i <= 100; i++) {
                const pageNum = i.toString().padStart(3, '0');
                const potentialHref = `/${pageNum}`;
                if (!allUsedHrefs.has(potentialHref)) {
                    newHref = potentialHref;
                    break;
                }
            }

            if (!newHref) {
                // Fallback if all 100 pages are used
                newHref = `/new-item-${Date.now()}`;
            }

            const newItem: NavItem = { ...itemData, href: newHref };

            const newItems = [...currentItems, newItem];
            saveNavState({
                navItems: group === 'main' ? newItems : navItems,
                settingsNavItems: group === 'settings' ? newItems : settingsNavItems,
            });
            return newItems;
        };

        if (group === 'main') {
            setNavItems(current => updater(current, settingsNavItems));
        } else {
            setSettingsNavItems(current => updater(current, navItems));
        }
    };

    const updateNavItem = (group: 'main' | 'settings', updatedItem: NavItem, originalHref: string) => {
        const updater = (items: NavItem[]) => {
            const newItems = items.map(item => item.href === originalHref ? updatedItem : item);
             saveNavState({
                navItems: group === 'main' ? newItems : navItems,
                settingsNavItems: group === 'settings' ? newItems : settingsNavItems,
            });
            return newItems;
        }

        if (group === 'main') {
            setNavItems(updater);
        } else {
            setSettingsNavItems(updater);
        }
    };

    const removeNavItem = (group: 'main' | 'settings', href: string) => {
        const updater = (items: NavItem[]) => {
            const newItems = items.filter(item => item.href !== href);
            saveNavState({
                navItems: group === 'main' ? newItems : navItems,
                settingsNavItems: group === 'settings' ? newItems : settingsNavItems,
            });
            return newItems;
        }

        if (group === 'main') {
            setNavItems(updater);
        } else {
            setSettingsNavItems(updater);
        }
    };

    const moveNavItem = (group: 'main' | 'settings', fromIndex: number, toIndex: number) => {
        const updater = (items: NavItem[]) => {
            const result = Array.from(items);
            const [removed] = result.splice(fromIndex, 1);
            result.splice(toIndex, 0, removed);
            saveNavState({
                navItems: group === 'main' ? result : navItems,
                settingsNavItems: group === 'settings' ? result : settingsNavItems,
            });
            return result;
        };
        if (group === 'main') {
            setNavItems(updater);
        } else {
            setSettingsNavItems(updater);
        }
    };

    const restoreDefaults = () => {
        const defaultState = {
            navItems: defaultNavItems as NavItem[],
            settingsNavItems: defaultSettingsNavItems as NavItem[],
        };
        setNavItems(defaultState.navItems);
        setSettingsNavItems(defaultState.settingsNavItems);
        saveNavState(defaultState);
    };

  return (
    <NavigationContext.Provider value={{ navItems, settingsNavItems, addNavItem, updateNavItem, removeNavItem, moveNavItem, restoreDefaults, isLoading }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
