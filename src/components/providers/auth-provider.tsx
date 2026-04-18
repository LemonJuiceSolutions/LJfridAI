'use client';

import { SessionProvider } from 'next-auth/react';
import { EditModeProvider } from '@/hooks/use-edit-mode';
import { NavigationProvider } from '@/hooks/use-navigation';
import { TooltipProvider } from '@/components/ui/tooltip';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    return (
        // Disable background polling of /api/auth/session. Defaults caused a
        // steady stream of CLIENT_FETCH_ERROR noise during dev hot-reloads and
        // the server OOM restarts observed on this branch. JWT session strategy
        // is stateless — the token is re-verified on each API request, so we
        // don't need client-side refetches to keep it fresh.
        //   refetchInterval={0}       → no periodic poll
        //   refetchOnWindowFocus={false} → no refetch when tab regains focus
        <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
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
