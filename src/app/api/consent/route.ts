import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const ConsentSchema = z.object({
    essential: z.boolean().default(true),
    analytics: z.boolean().default(false),
    marketing: z.boolean().default(false),
    anonymousId: z.string().min(8).max(128).optional(),
    policyVersion: z.string().min(1).max(32).default('1.0'),
});

export async function POST(req: NextRequest) {
    const ip = getClientIp(req);
    const rl = await rateLimit(`consent:${ip}`, 20, 60_000);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } },
        );
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = ConsentSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid payload', details: parsed.error.format() }, { status: 400 });
    }
    const data = parsed.data;

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? null;

    // Essential cookies cannot be refused — enforce server-side.
    if (data.essential !== true) {
        return NextResponse.json({ error: 'Essential cookies cannot be refused' }, { status: 400 });
    }

    if (!userId && !data.anonymousId) {
        return NextResponse.json({ error: 'anonymousId required for unauthenticated visitors' }, { status: 400 });
    }

    try {
        const created = await db.consentLog.create({
            data: {
                userId,
                anonymousId: data.anonymousId ?? null,
                essential: data.essential,
                analytics: data.analytics,
                marketing: data.marketing,
                policyVersion: data.policyVersion,
                ipAddress: ip,
                userAgent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
            },
            select: { id: true, createdAt: true },
        });
        return NextResponse.json({ ok: true, id: created.id, recordedAt: created.createdAt });
    } catch (err: any) {
        console.error('[consent] failed to record:', err?.message);
        return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 });
    }
}

export async function GET() {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const history = await db.consentLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
            id: true, essential: true, analytics: true, marketing: true,
            policyVersion: true, createdAt: true,
        },
    });
    return NextResponse.json({ history });
}
