import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

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
    console.error('[AuditLog] Failed to write audit log:', error);
  }
}
