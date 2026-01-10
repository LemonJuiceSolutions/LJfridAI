'use client';

import React from 'react';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';

export default function AppClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex flex-col w-full sm:pl-64">
        <Header />
        <main className="flex-1 p-4 sm:p-6 md:p-8 bg-background/95">
          {children}
        </main>
      </div>
    </div>
  );
}
