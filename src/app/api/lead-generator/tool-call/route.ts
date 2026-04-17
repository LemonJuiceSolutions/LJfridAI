import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeToolCall } from '@/ai/flows/lead-generator-flow';
import { activeSessions } from '@/ai/flows/lead-generator-sessions';

/**
 * Internal endpoint for Claude CLI agent to call lead-gen tools via curl.
 * Auth: NextAuth session cookie + session token bound to same companyId.
 *
 * Usage from Claude CLI (must carry auth cookie):
 *   curl -s http://localhost:9002/api/lead-generator/tool-call \
 *     -X POST -H 'Content-Type: application/json' \
 *     --cookie 'next-auth.session-token=...' \
 *     -d '{"tool":"searchPeopleApollo","args":{"jobTitles":["CTO"]},"token":"SESSION_TOKEN"}'
 */
export async function POST(request: NextRequest) {
    try {
        // SECURITY: require authenticated session (middleware bypasses this route for
        // the curl-from-CLI use case, so auth is enforced here).
        const authSession = await getServerSession(authOptions);
        const authCompanyId = (authSession?.user as any)?.companyId as string | undefined;
        if (!authCompanyId) {
            return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
        }

        const body = await request.json();
        const { tool, args, token } = body;

        if (!tool || !token) {
            return NextResponse.json({ error: 'Missing required fields: tool, token' }, { status: 400 });
        }

        // Verify session token
        const session = activeSessions.get(token);
        if (!session) {
            console.warn(`[ToolCall] Token not found: ${token.slice(0, 8)}... Active sessions: ${activeSessions.size}`);
            return NextResponse.json({
                error: 'Invalid or expired session token',
                hint: 'The server may have hot-reloaded during the session. Restart the agent.',
                activeSessions: activeSessions.size,
            }, { status: 401 });
        }

        // SECURITY: token's companyId MUST match the authenticated user's companyId.
        // Prevents a stolen/guessed token from being used cross-tenant.
        if (session.companyId !== authCompanyId) {
            console.warn(`[ToolCall] companyId mismatch: token=${session.companyId} auth=${authCompanyId}`);
            return NextResponse.json({ error: 'Token non autorizzato per questo tenant' }, { status: 403 });
        }

        // Check session expiry (8 hours — enough for long research sessions)
        if (Date.now() - session.createdAt > 8 * 60 * 60 * 1000) {
            activeSessions.delete(token);
            return NextResponse.json({ error: 'Session expired after 8 hours' }, { status: 401 });
        }

        console.log(`[ToolCall] ${tool} called by session ${token.slice(0, 8)}...`);

        const result = await executeToolCall(
            tool,
            args || {},
            session.companyId,
            session.apiKeys,
            session.conversationId
        );

        // executeToolCall returns a JSON string, parse it to return proper JSON
        try {
            return NextResponse.json(JSON.parse(result));
        } catch {
            return NextResponse.json({ result });
        }
    } catch (error: any) {
        console.error('[ToolCall] Error:', error.message);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
