'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ── Sidebar Context ──

type SidebarContextType = {
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    sidebarWidth: number;
};

const SIDEBAR_WIDTH = 256;

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

// ── Chatbot Context ──

type ChatbotContextType = {
    isChatbotOpen: boolean;
    toggleChatbot: () => void;
    setChatbotOpen: (open: boolean) => void;
    chatbotWidth: number;
};

const CHATBOT_WIDTH = 384;

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

// ── Provider ──

export function LayoutProvider({ children }: { children: ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isChatbotOpen, setIsChatbotOpen] = useState(true);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const savedSidebar = window.localStorage.getItem('sidebar-open');
            const savedChatbot = window.localStorage.getItem('chatbot-open');
            if (savedSidebar !== null) setIsSidebarOpen(savedSidebar === 'true');
            if (savedChatbot !== null) setIsChatbotOpen(savedChatbot === 'true');
        } catch {}
    }, []);

    const toggleSidebar = () => {
        const newState = !isSidebarOpen;
        setIsSidebarOpen(newState);
        try { window.localStorage.setItem('sidebar-open', String(newState)); } catch {}
    };

    const toggleChatbot = () => {
        const newState = !isChatbotOpen;
        setIsChatbotOpen(newState);
        try { window.localStorage.setItem('chatbot-open', String(newState)); } catch {}
    };

    const setSidebarOpenState = (open: boolean) => {
        setIsSidebarOpen(open);
        try { window.localStorage.setItem('sidebar-open', String(open)); } catch {}
    };

    const setChatbotOpenState = (open: boolean) => {
        setIsChatbotOpen(open);
        try { window.localStorage.setItem('chatbot-open', String(open)); } catch {}
    };

    return (
        <SidebarContext.Provider
            value={{
                isSidebarOpen,
                toggleSidebar,
                setSidebarOpen: setSidebarOpenState,
                sidebarWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
            }}
        >
            <ChatbotContext.Provider
                value={{
                    isChatbotOpen,
                    toggleChatbot,
                    setChatbotOpen: setChatbotOpenState,
                    chatbotWidth: isChatbotOpen ? CHATBOT_WIDTH : 0,
                }}
            >
                {children}
            </ChatbotContext.Provider>
        </SidebarContext.Provider>
    );
}

// ── Hooks ──

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (context === undefined) {
        throw new Error('useSidebar must be used within a LayoutProvider');
    }
    return context;
}

export function useChatbot() {
    const context = useContext(ChatbotContext);
    if (context === undefined) {
        throw new Error('useChatbot must be used within a LayoutProvider');
    }
    return context;
}

/** @deprecated Use `useSidebar()` or `useChatbot()` for better performance. */
export function useLayout() {
    const sidebar = useSidebar();
    const chatbot = useChatbot();
    return { ...sidebar, ...chatbot };
}
