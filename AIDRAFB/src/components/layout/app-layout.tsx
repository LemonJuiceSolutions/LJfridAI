
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { EditModeProvider } from '@/hooks/use-edit-mode';
import { NavigationProvider } from '@/hooks/use-navigation';

const AppClientLayout = dynamic(() => import('@/components/layout/app-client-layout'), {
  ssr: false,
});

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EditModeProvider>
        <NavigationProvider>
            <AppClientLayout>{children}</AppClientLayout>
        </NavigationProvider>
    </EditModeProvider>
  );
}
