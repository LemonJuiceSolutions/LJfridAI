'use client';

import { EditModeProvider } from '@/hooks/use-edit-mode';
import { NavigationProvider } from '@/hooks/use-navigation';
import React from 'react';

export function AppProviders({ children }: { children: React.ReactNode }) {
    return (
        <EditModeProvider>
            <NavigationProvider>
                {children}
            </NavigationProvider>
        </EditModeProvider>
    );
}
