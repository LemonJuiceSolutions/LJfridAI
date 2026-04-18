import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPythonBackendUrl } from '@/lib/python-backend';

export async function GET() {
  const checks: Record<string, string> = {};

  // Check database connectivity
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }

  // Check Python backend. /health is the ONE token-exempt endpoint on the
  // Python side, so we can probe it with a plain fetch — no X-Internal-Token
  // required. This keeps liveness probing working even if the token gets
  // rotated.
  try {
    const res = await fetch(`${getPythonBackendUrl()}/health`, { signal: AbortSignal.timeout(3000) });
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
