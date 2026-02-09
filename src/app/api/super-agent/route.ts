import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { superAgentFlow } from '@/ai/flows/super-agent-flow';

export async function POST(request: NextRequest) {
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
        const { userMessage, conversationId } = body;

        if (!userMessage) {
            return NextResponse.json({ error: 'Missing required field: userMessage' }, { status: 400 });
        }

        // Load existing conversation or start fresh
        let conversationHistory: any[] = [];
        let existingConversation = null;

        if (conversationId) {
            existingConversation = await db.superAgentConversation.findUnique({
                where: { id: conversationId },
            });
            if (existingConversation && existingConversation.companyId === user.company.id) {
                conversationHistory = existingConversation.messages as any[];
            }
        }

        // Build Genkit message format
        const genkitMessages = [
            ...conversationHistory,
            {
                role: 'user',
                content: [{ text: userMessage }],
            },
        ];

        // Call the super agent flow
        const response = await superAgentFlow({
            messages: genkitMessages,
            companyId: user.company.id,
        });

        // Update conversation history with the new exchange
        const updatedHistory = [
            ...genkitMessages,
            {
                role: 'model',
                content: [{ text: response }],
            },
        ];

        // Save conversation
        let savedConversation;
        if (existingConversation) {
            savedConversation = await db.superAgentConversation.update({
                where: { id: existingConversation.id },
                data: {
                    messages: updatedHistory,
                    updatedAt: new Date(),
                },
            });
        } else {
            savedConversation = await db.superAgentConversation.create({
                data: {
                    messages: updatedHistory,
                    companyId: user.company.id,
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: response,
            conversationId: savedConversation.id,
        });
    } catch (error: any) {
        console.error('Error in super agent API:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

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

        // Get the most recent conversation for this company
        const conversation = await db.superAgentConversation.findFirst({
            where: { companyId: user.company.id },
            orderBy: { updatedAt: 'desc' },
        });

        if (!conversation) {
            return NextResponse.json({ success: true, conversation: null });
        }

        // Transform Genkit message format to display format
        const messages = (conversation.messages as any[])
            .filter(m => m.role === 'user' || m.role === 'model')
            .map(m => ({
                role: m.role === 'model' ? 'assistant' : 'user',
                content: m.content?.[0]?.text || '',
                timestamp: Date.now(),
            }));

        return NextResponse.json({
            success: true,
            conversation: {
                id: conversation.id,
                messages,
            },
        });
    } catch (error: any) {
        console.error('Error getting super agent conversation:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
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

        // Delete all super agent conversations for this company
        await db.superAgentConversation.deleteMany({
            where: { companyId: user.company.id },
        });

        return NextResponse.json({
            success: true,
            message: 'Conversation deleted successfully',
        });
    } catch (error: any) {
        console.error('Error deleting super agent conversation:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
