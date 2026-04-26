import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { timingSafeEqual } from 'crypto';

export const maxDuration = 300; // 5 minutes

const execFileAsync = promisify(execFile);

function safeEqual(a: string, b: string): boolean {
    try {
        const ab = Buffer.from(a);
        const bb = Buffer.from(b);
        if (ab.length !== bb.length) return false;
        return timingSafeEqual(ab, bb);
    } catch { return false; }
}

function formatTimestamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
        `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
}

async function handleCron(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return NextResponse.json(
            { error: 'CRON_SECRET environment variable is not configured' },
            { status: 500 }
        );
    }

    const authHeader = req.headers.get('authorization') ?? req.headers.get('CRON_SECRET') ?? '';
    if (!safeEqual(authHeader, cronSecret) && !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        return NextResponse.json(
            { error: 'DATABASE_URL environment variable is not configured' },
            { status: 500 }
        );
    }

    const backupsDir = path.resolve(process.cwd(), 'backups');
    const filename = `auto_${formatTimestamp(new Date())}.dump`;
    const filePath = path.join(backupsDir, filename);

    try {
        await mkdir(backupsDir, { recursive: true });

        console.log('[backup-db] Starting backup:', filename);

        await execFileAsync('pg_dump', [
            '--format=custom',
            '--no-owner',
            '--no-acl',
            `--file=${filePath}`,
            databaseUrl,
        ], {
            timeout: 270_000, // 4.5 minutes — leave headroom for the 5-min maxDuration
        });

        const fileInfo = await stat(filePath);

        const result = {
            success: true,
            file: filePath,
            filename,
            sizeBytes: fileInfo.size,
            sizeMB: +(fileInfo.size / (1024 * 1024)).toFixed(2),
            timestamp: new Date().toISOString(),
        };

        console.log('[backup-db] Backup completed:', result);
        return NextResponse.json(result);
    } catch (error: any) {
        console.error('[backup-db] Backup failed:', error);
        return NextResponse.json(
            {
                error: 'Backup failed',
                details: error?.message || String(error),
            },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    return handleCron(req);
}

export async function POST(req: NextRequest) {
    return handleCron(req);
}
