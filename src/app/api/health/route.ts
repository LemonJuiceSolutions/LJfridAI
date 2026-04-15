import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const checks: Record<string, string> = {};

  // Check database connectivity
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }

  // Check Python backend
  try {
    const pythonUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5005';
    const res = await fetch(`${pythonUrl}/health`, { signal: AbortSignal.timeout(3000) });
    checks.python_backend = res.ok ? 'healthy' : 'unhealthy';
  } catch {
    checks.python_backend = 'unreachable';
  }

  const allHealthy = Object.values(checks).every(v => v === 'healthy');

  return NextResponse.json(
    { status: allHealthy ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allHealthy ? 200 : 503 }
  );
}
