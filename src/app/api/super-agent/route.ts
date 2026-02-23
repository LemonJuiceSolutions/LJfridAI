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
        const { userMessage, conversationId, model } = body;

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
                // Only keep user/model messages (strip tool calls/responses to save tokens)
                const allMessages = existingConversation.messages as any[];
                conversationHistory = allMessages.filter(
                    (m: any) => m.role === 'user' || m.role === 'model'
                );
                // Keep only last 20 messages to avoid token overflow
                if (conversationHistory.length > 20) {
                    conversationHistory = conversationHistory.slice(-20);
                }
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
            model: model || undefined,
            apiKey: (user as any).openRouterApiKey || undefined,
        });

        // Save only user/model messages (no tool calls) to keep conversation compact
        const updatedHistory = [
            ...conversationHistory,
            { role: 'user', content: [{ text: userMessage }] },
            { role: 'model', content: [{ text: response.message }], consultedNodes: response.consultedNodes },
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
            message: response.message,
            conversationId: savedConversation.id,
            consultedNodes: response.consultedNodes,
        });
    } catch (error: any) {
        console.error('Error in super agent API:', error);
        // Return detailed error so the UI can show it
        const errorMessage = error.message || 'Errore interno del server';
        const isTokenError = errorMessage.includes('token') || errorMessage.includes('context length');
        return NextResponse.json(
            {
                error: isTokenError
                    ? 'La conversazione e\' troppo lunga. Prova a pulire la chat e riprovare.'
                    : errorMessage,
            },
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
                consultedNodes: m.consultedNodes,
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
