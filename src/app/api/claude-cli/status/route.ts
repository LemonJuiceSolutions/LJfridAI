/**
 * Check if Claude Code CLI is installed and available.
 * Auth: requires authenticated session (avoid leaking server config to anonymous users).
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const execAsync = promisify(exec);

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return Response.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    try {
        const { stdout } = await execAsync('claude --version', { timeout: 10000 });
        return Response.json({ available: true, version: stdout.trim() });
    } catch (error: any) {
        return Response.json({
            available: false,
            error: error.message?.includes('not found') || error.message?.includes('ENOENT')
                ? 'Claude CLI non trovato. Installa con: npm install -g @anthropic-ai/claude-code'
                : `Errore: ${error.message}`,
        });
    }
}
