import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { ChatBotAgent } from '@/components/layout/chatbot-agent';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Like AI Said',
  description: 'Transform natural language into decision logic with AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={`${inter.className} antialiased bg-background text-foreground selection:bg-primary/30`}>
        <AuthProvider>
          <div className="flex min-h-screen">
            <SidebarNav />
            <div className="flex-1 flex flex-col min-w-0 ml-64 mr-96 transition-all duration-300">
              <main className="flex-1 p-6 lg:p-10 max-w-5xl mx-auto w-full">
                {children}
              </main>
            </div>
            <ChatBotAgent />
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
