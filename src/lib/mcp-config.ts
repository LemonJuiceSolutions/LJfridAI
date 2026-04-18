/**
 * MCP Config Generator for Claude CLI.
 * Creates temporary config files that tell Claude CLI which MCP servers to use.
 */
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export type McpAgentType = 'sql' | 'python' | 'super';

export interface McpContext {
    agentType: McpAgentType;
    connectorId?: string;
    companyId?: string;
    /** Node path in the decision tree (e.g. "root.options['xls']") */
    nodeId?: string;
    /** Tree ID in the database */
    treeId?: string;
    /** Base URL of the FridAI Next.js server (default: http://localhost:9002) */
    baseUrl?: string;
}

export interface McpConfigResult {
    configPath: string;
    contextPath: string;
    cleanup: () => Promise<void>;
}

/**
 * Creates a temporary MCP config + context for Claude CLI.
 * The config points to the appropriate MCP server script.
 * The context provides connectorId, companyId, etc.
 */
export async function createMcpConfig(ctx: McpContext): Promise<McpConfigResult> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'fridai-mcp-'));

    const baseUrl = ctx.baseUrl || process.env.NEXTAUTH_URL || 'http://localhost:9002';
    const mcpSecret = process.env.MCP_INTERNAL_SECRET;
    if (!mcpSecret) {
        throw new Error(
            'MCP_INTERNAL_SECRET env var not set. Generate with: ' +
            `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
        );
    }

    // Write context file
    const contextPath = join(tmpDir, 'context.json');
    await writeFile(contextPath, JSON.stringify({
        connectorId: ctx.connectorId || '',
        companyId: ctx.companyId || '',
        agentType: ctx.agentType,
        nodeId: ctx.nodeId || '',
        treeId: ctx.treeId || '',
        baseUrl,
        mcpSecret,
    }));

    // Determine MCP server script based on agent type
    const projectRoot = process.cwd();
    const serverScript = join(projectRoot, 'src', 'mcp', `${ctx.agentType}-agent-mcp.ts`);

    // Write MCP config
    const configPath = join(tmpDir, 'mcp-config.json');
    const config = {
        mcpServers: {
            [`fridai-${ctx.agentType}`]: {
                command: 'npx',
                args: ['tsx', serverScript],
                env: {
                    FRIDAI_MCP_CONTEXT: contextPath,
                    DATABASE_URL: process.env.DATABASE_URL || '',
                },
            },
        },
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    const cleanup = async () => {
        try {
            await unlink(contextPath).catch(() => {});
            await unlink(configPath).catch(() => {});
            // Remove temp dir (it should be empty now)
            const { rmdir } = await import('fs/promises');
            await rmdir(tmpDir).catch(() => {});
        } catch {
            // Ignore cleanup errors
        }
    };

    return { configPath, contextPath, cleanup };
}
