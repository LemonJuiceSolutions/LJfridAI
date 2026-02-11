import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { ChatBotAgent } from '@/components/layout/chatbot-agent';
import { AuthProvider } from '@/components/providers/auth-provider';
import { LayoutProvider } from '@/components/providers/layout-provider';
import { MainContentTransition } from '@/components/layout/main-content-transition';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'FridAI',
  description: 'Transform natural language into decision logic with AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body suppressHydrationWarning className={`${inter.className} antialiased bg-background text-foreground selection:bg-primary/30`}>
        <LayoutProvider>
          <AuthProvider>
            <div className="flex min-h-screen">
              <SidebarNav />
              <MainContentTransition>
                {children}
              </MainContentTransition>
              <ChatBotAgent />
            </div>
            <Toaster />
          </AuthProvider>
        </LayoutProvider>
      </body>
    </html>
  );
}
