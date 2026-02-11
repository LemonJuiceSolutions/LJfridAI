'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type LayoutContextType = {
    isSidebarOpen: boolean;
    isChatbotOpen: boolean;
    toggleSidebar: () => void;
    toggleChatbot: () => void;
    setSidebarOpen: (open: boolean) => void;
    setChatbotOpen: (open: boolean) => void;
    sidebarWidth: number; // e.g. 256 for w-64
    chatbotWidth: number; // e.g. 384 for w-96
};

// Default widths in pixels (matching Tailwind classes ml-64 (256px) and mr-96 (384px))
// Adjusting: Sidebar w-56 is 224px. Layout used ml-64 (256px). We can stick to 256px for margin or tighten it.
// Let's use 256px (w-64) for sidebar margin when open, and 0 when closed.
const SIDEBAR_WIDTH = 256;
const CHATBOT_WIDTH = 384; // w-96

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
    // Initialize from localStorage if available, otherwise default to open
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isChatbotOpen, setIsChatbotOpen] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedSidebar = localStorage.getItem('sidebar-open');
        const savedChatbot = localStorage.getItem('chatbot-open');

        if (savedSidebar !== null) {
            setIsSidebarOpen(savedSidebar === 'true');
        }
        if (savedChatbot !== null) {
            setIsChatbotOpen(savedChatbot === 'true');
        }
    }, []);

    const toggleSidebar = () => {
        const newState = !isSidebarOpen;
        setIsSidebarOpen(newState);
        localStorage.setItem('sidebar-open', String(newState));
    };

    const toggleChatbot = () => {
        const newState = !isChatbotOpen;
        setIsChatbotOpen(newState);
        localStorage.setItem('chatbot-open', String(newState));
    };

    const setSidebarOpenState = (open: boolean) => {
        setIsSidebarOpen(open);
        localStorage.setItem('sidebar-open', String(open));
    };

    const setChatbotOpenState = (open: boolean) => {
        setIsChatbotOpen(open);
        localStorage.setItem('chatbot-open', String(open));
    };

    // Prevent hydration mismatch by rendering simpler state or handled by consumer
    // consumers should handle !mounted if appropriate, but for layout we want stability.
    // We'll let effects sync it.

    return (
        <LayoutContext.Provider
            value={{
                isSidebarOpen,
                isChatbotOpen,
                toggleSidebar,
                toggleChatbot,
                setSidebarOpen: setSidebarOpenState,
                setChatbotOpen: setChatbotOpenState,
                sidebarWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
                chatbotWidth: isChatbotOpen ? CHATBOT_WIDTH : 0,
            }}
        >
            {children}
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (context === undefined) {
        throw new Error('useLayout must be used within a LayoutProvider');
    }
    return context;
}
