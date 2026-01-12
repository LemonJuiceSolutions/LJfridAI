'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';

interface OpenRouterSettings {
    apiKey: string;
    model: string;
    isLoading: boolean;
    error?: string;
    refetch: () => Promise<void>;
}

const OpenRouterContext = createContext<OpenRouterSettings | null>(null);

export function OpenRouterProvider({ children }: { children: ReactNode }) {
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | undefined>();

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const result = await getOpenRouterSettingsAction();
            if (result.error) {
                setError(result.error);
            } else {
                setApiKey(result.apiKey || '');
                setModel(result.model || 'google/gemini-2.0-flash-001');
                setError(undefined);
            }
        } catch (e) {
            setError('Failed to load settings');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    return (
        <OpenRouterContext.Provider value={{ apiKey, model, isLoading, error, refetch: fetchSettings }}>
            {children}
        </OpenRouterContext.Provider>
    );
}

export function useOpenRouter(): OpenRouterSettings {
    const context = useContext(OpenRouterContext);
    if (!context) {
        // Fallback for components outside provider - fetch directly
        return {
            apiKey: '',
            model: 'google/gemini-2.0-flash-001',
            isLoading: true,
            refetch: async () => { }
        };
    }
    return context;
}

/**
 * Standalone hook for components that need to fetch settings without provider
 * (useful for server components or components outside the provider)
 */
export function useOpenRouterSettings() {
    const [settings, setSettings] = useState<{ apiKey: string; model: string }>({
        apiKey: '',
        model: 'google/gemini-2.0-flash-001'
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        getOpenRouterSettingsAction().then(result => {
            if (!result.error) {
                setSettings({
                    apiKey: result.apiKey || '',
                    model: result.model || 'google/gemini-2.0-flash-001'
                });
            }
            setIsLoading(false);
        });
    }, []);

    return { ...settings, isLoading };
}
