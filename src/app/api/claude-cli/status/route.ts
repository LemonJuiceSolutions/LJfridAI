/**
 * Check if Claude Code CLI is installed and available.
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
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
