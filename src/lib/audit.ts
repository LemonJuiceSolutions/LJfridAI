import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { log } from '@/lib/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

const FALLBACK_LOG_PATH = path.join(process.cwd(), 'logs', 'audit-fallback.jsonl');

async function writeFallback(params: Record<string, unknown>, error: unknown) {
  try {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...params,
      _error: error instanceof Error ? error.message : String(error),
    }) + '\n';
    await fs.mkdir(path.dirname(FALLBACK_LOG_PATH), { recursive: true });
    await fs.appendFile(FALLBACK_LOG_PATH, entry, 'utf-8');
  } catch (fsError) {
    // Last resort: stderr so the entry is not silently lost
    log('error', '[AuditLog] Fallback file write also failed', {
      originalError: error instanceof Error ? error.message : String(error),
      fsError: fsError instanceof Error ? fsError.message : String(fsError),
    });
  }
}

export async function auditLog(params: {
  userId: string;
  companyId: string;
  action: string;
  resource?: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
}) {
  try {
    await db.auditLog.create({ data: params });
  } catch (error) {
    log('error', '[AuditLog] Failed to write audit log to DB, writing to fallback file', {
      action: params.action,
      userId: params.userId,
    });
    await writeFallback(params as unknown as Record<string, unknown>, error);
  }
}
