import '@/lib/env';

// Node.js 25+ exposes a broken localStorage global (Proxy without Web Storage API methods).
// This causes "localStorage.getItem is not a function" errors during SSR.
// Replace it with a no-op implementation so libraries that check for localStorage don't crash.
if (typeof globalThis.localStorage !== 'undefined' && typeof globalThis.localStorage.getItem !== 'function') {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, String(value)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
        key: (index: number) => [...store.keys()][index] ?? null,
        get length() { return store.size; },
    };
}

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Only run scheduler in Node.js runtime (not Edge)
        try {
            // Dynamic import of the Node.js-only file
            const { registerNode } = await import('./instrumentation.node');
            await registerNode();
        } catch (error) {
            console.error('[INSTRUMENTATION] Failed to load Node instrumentation:', error);
        }
    }
}
