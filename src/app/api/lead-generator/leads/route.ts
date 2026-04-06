import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });

        if (!user?.company) {
            return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const searchId = searchParams.get('searchId');
        const conversationId = searchParams.get('conversationId');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
        const search = searchParams.get('search');

        const where: any = { companyId: user.company.id };
        if (searchId) {
            where.searchId = searchId;
        } else if (conversationId) {
            // Filter by all searches belonging to this conversation
            where.search = { conversationId };
        }
        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { jobTitle: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [leads, total] = await Promise.all([
            db.lead.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            db.lead.count({ where }),
        ]);

        return NextResponse.json({
            success: true,
            leads,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        console.error('Error listing leads:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });

        if (!user?.company) {
            return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
        }

        const body = await request.json();
        const { id, notes, rating, tags } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
        }

        // Verify ownership
        const existing = await db.lead.findFirst({
            where: { id, companyId: user.company.id },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        const updateData: any = {};
        if (notes !== undefined) updateData.notes = notes;
        if (rating !== undefined) updateData.rating = rating;
        if (tags !== undefined) updateData.tags = tags;

        const updated = await db.lead.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ success: true, lead: updated });
    } catch (error: any) {
        console.error('Error updating lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });

        if (!user?.company) {
            return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
        }

        const body = await request.json();
        const { leadIds, searchId, deleteAll } = body;

        let deletedCount = 0;
        if (deleteAll) {
            // Delete ALL leads for this company (optionally filtered by searchId)
            const where: any = { companyId: user.company.id };
            if (searchId) where.searchId = searchId;
            const result = await db.lead.deleteMany({ where });
            deletedCount = result.count;
        } else if (leadIds && Array.isArray(leadIds)) {
            const result = await db.lead.deleteMany({
                where: { id: { in: leadIds }, companyId: user.company.id },
            });
            deletedCount = result.count;
        } else if (searchId) {
            const result = await db.lead.deleteMany({
                where: { searchId, companyId: user.company.id },
            });
            deletedCount = result.count;
        }

        return NextResponse.json({ success: true, deletedCount });
    } catch (error: any) {
        console.error('Error deleting leads:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
