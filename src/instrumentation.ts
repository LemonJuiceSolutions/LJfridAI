
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
