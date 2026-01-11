'use client';

import { SessionProvider } from 'next-auth/react';
import { EditModeProvider } from '@/hooks/use-edit-mode';
import { NavigationProvider } from '@/hooks/use-navigation';
import { TooltipProvider } from '@/components/ui/tooltip';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <NavigationProvider>
                <EditModeProvider>
                    <TooltipProvider>
                        {children}
                    </TooltipProvider>
                </EditModeProvider>
            </NavigationProvider>
        </SessionProvider>
    );
}
