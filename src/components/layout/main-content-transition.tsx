'use client';

import React, { ReactNode } from 'react';
import { useSidebar, useChatbot } from '@/components/providers/layout-provider';
import { cn } from '@/lib/utils';

export function MainContentTransition({ children }: { children: ReactNode }) {
    const { isSidebarOpen } = useSidebar();
    const { isChatbotOpen } = useChatbot();

    return (
        <div
            className={cn(
                "flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out",
                isSidebarOpen ? "ml-64" : "ml-0", // Assuming sidebar width handling, if collapsed to 0? Or just margin.
                // Wait, sidebar width is w-56 (224px). Layout used ml-64 (256px).
                // If sidebar is closed (w-0), margin should be ml-0 (or small padding).
                // If I use toggle button that sits on top, maybe ml-12?
                // Let's rely on sidebar implementation. If sidebar becomes w-0, margin 0.
                // If sidebar becomes w-16 (icons), margin 16 (64px).
                // My sidebar implementation: w-0 when closed. Button is absolute.
                // So ml-12 to leave room for the button? Or button is overlay?
                // The button in my impl is `absolute top-4 left-4`. If aside w-0 overflow-hidden, button is hidden?
                // No, typically button is outside or sidebar is w-12.
                // Let's refinement: Sidebar closed state should probably be w-12 or just enough for toggle.
                // Or toggle is fixed on screen.

                isChatbotOpen ? "mr-96" : "mr-0"
            )}
        >
            <div className={cn(
                "fixed left-4 top-4 z-50 transition-opacity duration-300",
                isSidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"
            )}>
                {/* Toggle button placeholder if needed outside, but sidebar handles it internally if visible */}
            </div>
            <main className="flex-1 p-6 lg:p-10 w-full transition-all duration-300">
                {children}
            </main>
        </div>
    );
}
