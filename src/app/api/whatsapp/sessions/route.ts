import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/whatsapp/sessions
 *
 * Returns WhatsApp chat history for the current company.
 * Used by Python nodes in pipelines to import chat data.
 *
 * Query params:
 *   - phone: filter by phone number (optional)
 *   - status: filter by status 'collecting' | 'completed' (optional)
 *   - limit: max sessions to return (default 50)
 *   - flat: if 'true', returns a flat array of messages instead of grouped by session
 */
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const flat = searchParams.get('flat') === 'true';

    try {
        const where: any = { companyId: session.user.companyId };
        if (phone) where.phoneNumber = { contains: phone.replace(/[\s\-+]/g, '') };
        if (status) where.status = status;

        const sessions = await db.whatsAppSession.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                phoneNumber: true,
                status: true,
                messages: true,
                collectedData: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (flat) {
            // Return flat array of messages — easier for Python/Pandas
            const messages = sessions.flatMap(s => {
                const msgs = Array.isArray(s.messages) ? s.messages : [];
                return msgs.map((m: any) => ({
                    session_id: s.id,
                    phone: s.phoneNumber,
                    role: m.role || 'unknown',
                    content: m.content || '',
                    timestamp: m.timestamp || s.createdAt.toISOString(),
                    session_status: s.status,
                }));
            });
            return NextResponse.json({ success: true, count: messages.length, data: messages });
        }

        // Return grouped by session
        const data = sessions.map(s => ({
            id: s.id,
            phone: s.phoneNumber,
            status: s.status,
            messages: Array.isArray(s.messages) ? s.messages : [],
            messageCount: Array.isArray(s.messages) ? s.messages.length : 0,
            collectedData: s.collectedData,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
        }));

        return NextResponse.json({ success: true, count: data.length, data });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
