'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AppProviders } from '@/components/layout/app-providers';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const AppClientLayout = dynamic(() => import('@/components/layout/app-client-layout'), {
  ssr: false,
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}


export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
      <AppProviders>
        <AuthGuard>
            <AppClientLayout>{children}</AppClientLayout>
        </AuthGuard>
      </AppProviders>
  );
}
