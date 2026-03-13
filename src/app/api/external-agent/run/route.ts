import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { spawn } from 'child_process';
import { join, basename } from 'path';
import { readdirSync, readFileSync } from 'fs';

export const maxDuration = 120;

const SUPPORTED_AGENTS: Record<string, string> = {
    'what-if': 'what-if',
};

// Use the Flask backend's venv which has the required packages (dotenv, openai, pydantic, pandas)
const PYTHON_BIN = join(process.cwd(), 'python-backend', 'venv', 'bin', 'python3');

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return Response.json({ success: false, error: 'Non autorizzato' }, { status: 401 });
    }

    const body = await request.json();
    const { agent, input } = body;

    if (!agent || !input?.trim()) {
        return Response.json({ success: false, error: 'Campi mancanti: agent e input sono obbligatori' }, { status: 400 });
    }

    if (!SUPPORTED_AGENTS[agent]) {
        return Response.json({ success: false, error: `Agente non supportato: ${agent}` }, { status: 400 });
    }

    const agentDir = join(process.cwd(), 'agents', agent);
    const scriptPath = join(agentDir, 'run_agent.py');

    return new Promise<Response>((resolve) => {
        const proc = spawn(PYTHON_BIN, [scriptPath, input.trim()], {
            cwd: agentDir,
            env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
        proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

        proc.on('close', (code: number | null) => {
            if (code !== 0) {
                const errMsg = stderr.trim() || `Processo terminato con codice ${code}`;
                resolve(Response.json({ success: false, error: errMsg }, { status: 500 }));
                return;
            }
            try {
                // Agent may print non-JSON lines to stdout (e.g. "Report salvato: ...").
                // Extract the last line that looks like a JSON object.
                const lines = stdout.trim().split('\n');
                const jsonLine = [...lines].reverse().find(l => l.trim().startsWith('{'));
                if (!jsonLine) throw new Error(`No JSON in output: ${stdout.slice(0, 300)}`);
                const result = JSON.parse(jsonLine);
                if (result.error) {
                    resolve(Response.json({ success: false, error: result.error }, { status: 500 }));
                } else {
                    // Extract report filename from "Report salvato: ..." line printed by the agent
                    const reportLine = lines.find(l => l.startsWith('Report salvato:'));
                    const reportFile = reportLine ? basename(reportLine.replace('Report salvato:', '').trim()) : undefined;
                    resolve(Response.json({ success: true, result: { ...result, reportFile } }));
                }
            } catch {
                resolve(Response.json(
                    { success: false, error: `Output non valido dall'agente: ${stdout.slice(0, 300)}` },
                    { status: 500 }
                ));
            }
        });

        proc.on('error', (err: Error) => {
            resolve(Response.json({ success: false, error: err.message }, { status: 500 }));
        });
    });
}

// GET /api/external-agent/run?agent=what-if           →  { files: string[] }
// GET /api/external-agent/run?agent=what-if&report=f  →  { content: string }
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return Response.json({ success: false, error: 'Non autorizzato' }, { status: 401 });
    }
    const agent = request.nextUrl.searchParams.get('agent');
    if (!agent || !SUPPORTED_AGENTS[agent]) {
        return Response.json({ success: false, error: 'Agente non supportato' }, { status: 400 });
    }
    const report = request.nextUrl.searchParams.get('report');
    if (report) {
        // Serve a single report file's content (only .md files, no path traversal)
        if (!report.endsWith('.md') || report.includes('/') || report.includes('..')) {
            return Response.json({ success: false, error: 'Report non valido' }, { status: 400 });
        }
        try {
            const filePath = join(process.cwd(), 'agents', agent, 'reports', report);
            const raw = readFileSync(filePath, 'utf-8');
            // Strip common leading whitespace (Python triple-quoted strings add indentation)
            const lines = raw.split('\n');
            const nonEmpty = lines.filter(l => l.trim().length > 0);
            const minIndent = nonEmpty.length
                ? Math.min(...nonEmpty.map(l => l.match(/^( *)/)?.[1].length ?? 0))
                : 0;
            const content = minIndent > 0
                ? lines.map(l => l.slice(minIndent)).join('\n')
                : raw;
            // Also load the companion .json file if it exists
            let matrix: any[] | undefined;
            let request: string | undefined;
            try {
                const jsonPath = filePath.replace(/\.md$/, '.json');
                const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
                matrix = jsonData.matrix;
                request = jsonData.request;
            } catch { /* no companion json */ }
            return Response.json({ success: true, content, matrix, request });
        } catch {
            return Response.json({ success: false, error: 'Report non trovato' }, { status: 404 });
        }
    }
    try {
        const reportsDir = join(process.cwd(), 'agents', agent, 'reports');
        const files = readdirSync(reportsDir).filter(f => f.endsWith('.md'));
        return Response.json({ success: true, files });
    } catch {
        return Response.json({ success: true, files: [] });
    }
}
