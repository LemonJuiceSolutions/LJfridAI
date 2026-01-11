'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { navItems as defaultNavItems, settingsNavItems as defaultSettingsNavItems } from '@/lib/data';
import * as icons from 'lucide-react';
import { getNavigationItems, addNavItem as addNavItemAction, updateNavItem as updateNavItemAction, removeNavItem as removeNavItemAction } from '@/actions/navigation';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

export type NavItem = {
    href: string;
    icon: keyof typeof icons;
    label: string;
};

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

export function NavigationProvider({ children }: { children: ReactNode }) {
    const [navItems, setNavItems] = useState<NavItem[]>([]);
    const [settingsNavItems, setSettingsNavItems] = useState<NavItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { data: session, status } = useSession();
    const { toast } = useToast();

    const fetchItems = useCallback(async () => {
        if (status === 'loading') return;
        if (!session?.user) {
            setNavItems(defaultNavItems as NavItem[]);
            setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const { main, settings } = await getNavigationItems();

            // Map DB items to NavItem type (handling icon string to keyof icons)
            const mapItems = (items: any[]): NavItem[] => items.map(i => ({
                href: i.href,
                label: i.label,
                icon: i.icon as keyof typeof icons
            }));

            if (main.length === 0 && settings.length === 0) {
                // Fallback to defaults if DB is empty for this company
                setNavItems(defaultNavItems as NavItem[]);
                setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
            } else {
                setNavItems(mapItems(main));
                setSettingsNavItems(mapItems(settings));
            }

        } catch (error) {
            console.error("Failed to load navigation", error);
            // Fallback to defaults on error
            setNavItems(defaultNavItems as NavItem[]);
            setSettingsNavItems(defaultSettingsNavItems as NavItem[]);
            toast({ variant: "destructive", title: "Navigazione Disconnessa", description: "Impossibile caricare il menu dal database. Uso la configurazione predefinita." });
        } finally {
            setIsLoading(false);
        }
    }, [session, status, toast]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const addNavItem = async (group: 'main' | 'settings', itemData: Omit<NavItem, 'href'>) => {
        // Optimistic update could go here, but for simplicity we'll just reload

        let newHref = '';
        const currentItems = group === 'main' ? navItems : settingsNavItems;
        const allItems = [...navItems, ...settingsNavItems];
        const allUsedHrefs = new Set(allItems.map(i => i.href));

        // Auto-generate href if valid logic needed, but here we invoke server action
        // Server action should probably handle finding available href if we passed empty, 
        // but the previous logic did it client side. Let's replicate client side generation
        // before calling server action to ensure immediate responsiveness in UI if we added optimistic updates.

        // Wait, the dialog passes href if manual. If not, we generate it.
        // The dialog logic handles "if href is passed".
        // The previous hook logic generated it if not passed.
        // Let's do generation here.

        if ('href' in itemData && itemData.href) {
            newHref = itemData.href!;
        } else {
            for (let i = 1; i <= 100; i++) {
                const pageNum = i.toString().padStart(3, '0');
                const potentialHref = `/${pageNum}`;
                if (!allUsedHrefs.has(potentialHref)) {
                    newHref = potentialHref;
                    break;
                }
            }
            if (!newHref) newHref = `/new-item-${Date.now()}`;
        }

        const newItem = { ...itemData, href: newHref };

        try {
            await addNavItemAction(group, {
                label: newItem.label,
                href: newItem.href,
                icon: newItem.icon as string
            });
            fetchItems(); // Reload from DB
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "Failed to save item" });
        }
    };

    const updateNavItem = async (group: 'main' | 'settings', item: NavItem, originalHref: string) => {
        try {
            await updateNavItemAction(group, originalHref, {
                label: item.label,
                href: item.href,
                icon: item.icon as string
            });
            fetchItems();
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "Failed to update item" });
        }
    };

    const removeNavItem = async (group: 'main' | 'settings', href: string) => {
        try {
            await removeNavItemAction(group, href);
            fetchItems();
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "Failed to remove item" });
        }
    };

    const moveNavItem = (group: 'main' | 'settings', fromIndex: number, toIndex: number) => {
        // Reordering not implementing in DB yet for simplicity in this step
        // We can add reorder action later. Just update local state for visual feedback?
        // Actually, if we update local state but don't save, it will revert on refresh.
        // Let's implement local update only for now or skip.
        console.warn("Reordering not yet implemented in DB adapter");
    };

    const restoreDefaults = async () => {
        // Not implemented on server yet
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
