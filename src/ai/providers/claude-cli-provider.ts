/**
 * Claude Code CLI Provider for FridAI.
 * Spawns the `claude` CLI process, parses NDJSON output, and converts
 * to Vercel AI SDK UIMessage stream format.
 *
 * Reference: VeronaLibri/claude-ui/src/app/api/chat/route.ts
 */
import { spawn, ChildProcess } from 'child_process';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';

export interface ClaudeCliOptions {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    mcpConfigPath?: string;
    sessionId?: string;
    /** Working directory for the CLI (default: process.cwd()) */
    cwd?: string;
    /** Restrict CLI to only these tools (MCP tool names). Blocks Write/Edit/Bash if set. */
    allowedTools?: string[];
}

export interface ClaudeCliResult {
    response: Response;
    /** Promise that resolves with session info when the CLI exits */
    sessionPromise: Promise<{ sessionId?: string; cost?: number; inputTokens?: number; outputTokens?: number; fullText?: string }>;
}

/**
 * Spawn Claude CLI and return a UIMessageStreamResponse compatible with useChat.
 */
export function streamFromClaudeCli(opts: ClaudeCliOptions): ClaudeCliResult {
    const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';

    // Ensure /opt/homebrew/bin is in PATH so `node` and `claude` are found
    const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
    const currentPath = process.env.PATH || '';
    const fullPath = [...extraPaths, currentPath].join(':');

    // Build CLI arguments
    const args: string[] = [];
    if (opts.model) { args.push('--model', opts.model); }
    if (opts.sessionId) { args.push('--resume', opts.sessionId); }
    if (opts.mcpConfigPath) { args.push('--mcp-config', opts.mcpConfigPath); }
    args.push('-p', '--output-format', 'stream-json', '--verbose');
    // Bypass permission checks so tools (MCP, etc.) run autonomously
    args.push('--permission-mode', 'bypassPermissions');

    // Restrict to MCP tools only — block built-in Write/Edit/Bash to prevent disk writes
    if (opts.allowedTools && opts.allowedTools.length > 0) {
        for (const tool of opts.allowedTools) {
            args.push('--allowedTools', tool);
        }
    }

    // Combine system prompt + user prompt
    // Claude CLI doesn't have a separate --system-prompt flag in print mode,
    // so we prepend it as XML in the prompt text.
    const fullPrompt = opts.systemPrompt
        ? `<system>\n${opts.systemPrompt}\n</system>\n\n${opts.userPrompt}`
        : opts.userPrompt;
    args.push(fullPrompt);

    const child = spawn(claudePath, args, {
        cwd: opts.cwd || process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0', PATH: fullPath },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Session info resolved when CLI exits
    let sessionResolve: (value: any) => void;
    const sessionPromise = new Promise<any>((resolve) => { sessionResolve = resolve; });
    const sessionInfo: any = {};

    const stream = createUIMessageStream({
        execute: ({ writer }) => {
            return new Promise<void>((resolve, reject) => {
                let buffer = '';

                child.stdout.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString('utf-8');
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            handleClaudeEvent(parsed, writer, sessionInfo);
                        } catch {
                            // Skip malformed JSON
                        }
                    }
                });

                child.stderr.on('data', (chunk: Buffer) => {
                    const text = chunk.toString('utf-8').trim();
                    if (text) {
                        console.warn('[claude-cli stderr]', text);
                    }
                });

                child.on('close', (code) => {
                    // Flush remaining buffer
                    if (buffer.trim()) {
                        try {
                            const parsed = JSON.parse(buffer);
                            handleClaudeEvent(parsed, writer, sessionInfo);
                        } catch { /* ignore */ }
                    }

                    if (code !== 0 && code !== null) {
                        console.error(`[claude-cli] Exited with code ${code}`);
                    }

                    // Write finish events using 'as any' because the UIMessageStream
                    // type definitions are strict but accept these at runtime
                    (writer as any).write({
                        type: 'finish',
                        finishReason: 'stop',
                    });

                    sessionResolve(sessionInfo);
                    resolve();
                });

                child.on('error', (err) => {
                    console.error('[claude-cli] Spawn error:', err.message);
                    sessionResolve(sessionInfo);
                    reject(err);
                });
            });
        },
    });

    const response = createUIMessageStreamResponse({ stream });

    return { response, sessionPromise };
}

/**
 * Run Claude CLI synchronously (for non-streaming endpoints like ai-node/execute).
 * Returns the full text output.
 */
export async function runClaudeCliSync(opts: ClaudeCliOptions): Promise<{
    text: string;
    sessionId?: string;
    cost?: number;
    inputTokens?: number;
    outputTokens?: number;
}> {
    const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';

    // Ensure /opt/homebrew/bin is in PATH so `node` and `claude` are found
    const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
    const currentPath = process.env.PATH || '';
    const fullPath = [...extraPaths, currentPath].join(':');

    const args: string[] = [];
    if (opts.model) { args.push('--model', opts.model); }
    if (opts.sessionId) { args.push('--resume', opts.sessionId); }
    if (opts.mcpConfigPath) { args.push('--mcp-config', opts.mcpConfigPath); }
    args.push('-p', '--output-format', 'stream-json', '--verbose');
    args.push('--permission-mode', 'bypassPermissions');

    // Restrict to MCP tools only — block built-in Write/Edit/Bash to prevent disk writes
    if (opts.allowedTools && opts.allowedTools.length > 0) {
        for (const tool of opts.allowedTools) {
            args.push('--allowedTools', tool);
        }
    }

    const fullPrompt = opts.systemPrompt
        ? `<system>\n${opts.systemPrompt}\n</system>\n\n${opts.userPrompt}`
        : opts.userPrompt;
    args.push(fullPrompt);

    return new Promise((resolve, reject) => {
        const child = spawn(claudePath, args, {
            cwd: opts.cwd || process.cwd(),
            env: { ...process.env, FORCE_COLOR: '0', PATH: fullPath },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let buffer = '';
        let fullText = '';
        const sessionInfo: any = {};

        child.stdout.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf-8');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    const type = parsed.type as string;

                    if (type === 'assistant') {
                        const content = parsed.message?.content;
                        if (Array.isArray(content)) {
                            for (const block of content) {
                                if (block.type === 'text') fullText += block.text;
                            }
                        }
                    } else if (type === 'stream_event') {
                        const event = parsed.event;
                        if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
                            fullText += event.delta.text;
                        }
                    } else if (type === 'result') {
                        sessionInfo.sessionId = parsed.session_id;
                        sessionInfo.cost = parsed.total_cost_usd;
                        const usage = parsed.usage;
                        sessionInfo.inputTokens = usage?.input_tokens || parsed.input_tokens || 0;
                        sessionInfo.outputTokens = usage?.output_tokens || parsed.output_tokens || 0;
                    } else if (type === 'system' && parsed.subtype === 'init') {
                        sessionInfo.sessionId = parsed.session_id;
                    }
                } catch { /* skip */ }
            }
        });

        child.stderr.on('data', (chunk: Buffer) => {
            console.warn('[claude-cli sync stderr]', chunk.toString('utf-8').trim());
        });

        child.on('close', () => {
            // Flush remaining
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer);
                    if (parsed.type === 'result') {
                        sessionInfo.sessionId = parsed.session_id;
                        sessionInfo.cost = parsed.total_cost_usd;
                    }
                } catch { /* ignore */ }
            }
            resolve({ text: fullText, ...sessionInfo });
        });

        child.on('error', reject);
    });
}

// ─── NDJSON Event Handler ────────────────────────────────────────────────────
// Converts Claude CLI NDJSON events into Vercel AI SDK v6 UIMessageStream chunks.
// v6 uses: text-start/text-delta/text-end for text,
//          tool-input-start/tool-input-available/tool-output-available for tools.

type WriterType = { write: (part: any) => void };

// Counter for generating unique IDs for text parts
let _textPartCounter = 0;
function nextTextPartId(): string {
    return `cli-text-${++_textPartCounter}`;
}

// Track active text part IDs per writer instance
const _activeTextIds = new WeakMap<WriterType, string | null>();

function ensureTextStarted(writer: WriterType): string {
    let activeId = _activeTextIds.get(writer);
    if (!activeId) {
        activeId = nextTextPartId();
        _activeTextIds.set(writer, activeId);
        writer.write({ type: 'text-start', id: activeId });
    }
    return activeId;
}

function endActiveText(writer: WriterType) {
    const activeId = _activeTextIds.get(writer);
    if (activeId) {
        writer.write({ type: 'text-end', id: activeId });
        _activeTextIds.set(writer, null);
    }
}

function handleClaudeEvent(
    parsed: Record<string, unknown>,
    writer: WriterType,
    sessionInfo: Record<string, unknown>,
) {
    const type = parsed.type as string;

    switch (type) {
        case 'system': {
            if (parsed.subtype === 'init') {
                sessionInfo.sessionId = parsed.session_id;
                sessionInfo.model = parsed.model;
            }
            break;
        }

        case 'assistant': {
            const message = parsed.message as Record<string, unknown> | undefined;
            if (!message) break;
            const content = message.content as Array<Record<string, unknown>>;
            if (!Array.isArray(content)) break;

            for (const block of content) {
                if (block.type === 'text') {
                    // Accumulate full text for conversation persistence
                    sessionInfo.fullText = ((sessionInfo.fullText as string) || '') + (block.text as string);
                    // Complete text block — emit start+delta+end
                    const id = ensureTextStarted(writer);
                    writer.write({ type: 'text-delta', id, delta: block.text as string });
                    endActiveText(writer);
                } else if (block.type === 'tool_use') {
                    // End any active text before tool call
                    endActiveText(writer);
                    const toolCallId = block.id as string;
                    const toolName = block.name as string;
                    const input = block.input as Record<string, unknown>;
                    // Emit tool-input-start → tool-input-delta → tool-input-available
                    // (complete tool call, non-streaming)
                    writer.write({ type: 'tool-input-start', toolCallId, toolName });
                    writer.write({ type: 'tool-input-delta', toolCallId, inputTextDelta: JSON.stringify(input) });
                    writer.write({ type: 'tool-input-available', toolCallId, toolName });
                } else if (block.type === 'tool_result') {
                    const resultContent = block.content;
                    let resultText = '';
                    if (typeof resultContent === 'string') {
                        resultText = resultContent;
                    } else if (Array.isArray(resultContent)) {
                        resultText = (resultContent as Array<Record<string, unknown>>)
                            .filter((c) => c.type === 'text')
                            .map((c) => c.text)
                            .join('\n');
                    }
                    writer.write({
                        type: 'tool-output-available',
                        toolCallId: (block.tool_use_id || block.id) as string,
                        output: resultText,
                    });
                }
            }
            break;
        }

        case 'stream_event': {
            const event = parsed.event as Record<string, unknown> | undefined;
            if (!event) break;

            if (event.type === 'content_block_delta') {
                const delta = event.delta as Record<string, unknown> | undefined;
                if (delta?.type === 'text_delta') {
                    // Accumulate full text for conversation persistence
                    sessionInfo.fullText = ((sessionInfo.fullText as string) || '') + (delta.text as string);
                    const id = ensureTextStarted(writer);
                    writer.write({ type: 'text-delta', id, delta: delta.text as string });
                } else if (delta?.type === 'input_json_delta') {
                    // Streaming tool input delta
                    const idx = event.index as number;
                    const activeToolId = (sessionInfo as any)[`_tool_${idx}`];
                    if (activeToolId) {
                        writer.write({
                            type: 'tool-input-delta',
                            toolCallId: activeToolId,
                            inputTextDelta: delta.partial_json as string,
                        });
                    }
                }
            } else if (event.type === 'content_block_start') {
                const contentBlock = event.content_block as Record<string, unknown> | undefined;
                if (contentBlock?.type === 'tool_use') {
                    // End any active text before tool call
                    endActiveText(writer);
                    const toolCallId = contentBlock.id as string;
                    const toolName = contentBlock.name as string;
                    const idx = event.index as number;
                    // Track tool ID and name by block index for delta matching
                    (sessionInfo as any)[`_tool_${idx}`] = toolCallId;
                    (sessionInfo as any)[`_toolName_${idx}`] = toolName;
                    writer.write({
                        type: 'tool-input-start',
                        toolCallId,
                        toolName,
                    });
                } else if (contentBlock?.type === 'text') {
                    // Text block starting — ensure text-start is emitted
                    ensureTextStarted(writer);
                }
            } else if (event.type === 'content_block_stop') {
                const idx = event.index as number;
                const activeToolId = (sessionInfo as any)[`_tool_${idx}`];
                if (activeToolId) {
                    // Tool block ended — emit tool-input-available
                    // The SDK accumulates input from the deltas sent earlier
                    const toolName = (sessionInfo as any)[`_toolName_${idx}`] || 'unknown';
                    writer.write({ type: 'tool-input-available', toolCallId: activeToolId, toolName });
                    delete (sessionInfo as any)[`_tool_${idx}`];
                    delete (sessionInfo as any)[`_toolName_${idx}`];
                } else {
                    // Text block ended
                    endActiveText(writer);
                }
            }
            break;
        }

        case 'result': {
            // End any remaining active text
            endActiveText(writer);
            const usage = parsed.usage as Record<string, number> | undefined;
            sessionInfo.sessionId = parsed.session_id;
            sessionInfo.cost = parsed.total_cost_usd;
            sessionInfo.inputTokens = usage?.input_tokens ?? parsed.input_tokens ?? 0;
            sessionInfo.outputTokens = usage?.output_tokens ?? parsed.output_tokens ?? 0;
            break;
        }
    }
}
