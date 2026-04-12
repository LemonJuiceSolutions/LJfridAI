import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { leadGeneratorFlow } from '@/ai/flows/lead-generator-flow';
import type { ProgressEvent } from '@/ai/flows/lead-generator-flow';

async function getAuthenticatedCompanyUser() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return null;
    const user = await db.user.findUnique({
        where: { email: session.user.email },
        include: { company: true },
    });
    if (!user?.company) return null;
    return user;
}

export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedCompanyUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { userMessage, conversationId, model, aiProvider, stream, skillsContext } = body;

        if (!userMessage) {
            return NextResponse.json({ error: 'Missing required field: userMessage' }, { status: 400 });
        }

        // Load existing conversation or start fresh
        let conversationHistory: any[] = [];
        let existingConversation: any = null;
        let previousCost = 0;

        if (conversationId) {
            try {
                existingConversation = await db.leadGeneratorConversation.findUnique({
                    where: { id: conversationId },
                });
                if (existingConversation && existingConversation.companyId === user.company!.id) {
                    const allMessages = existingConversation.messages as any[];
                    conversationHistory = allMessages.filter(
                        (m: any) => m.role === 'user' || m.role === 'model'
                    );
                    if (conversationHistory.length > 20) {
                        conversationHistory = conversationHistory.slice(-20);
                    }
                    previousCost = existingConversation.totalCost || 0;
                } else {
                    existingConversation = null;
                }
            } catch (e) {
                console.warn('Failed to load existing conversation:', e);
            }
        }

        // Build messages array
        const chatMessages = [
            ...conversationHistory,
            {
                role: 'user',
                content: [{ text: userMessage }],
            },
        ];

        // Get lead gen API keys from company
        const leadGenApiKeys = (user.company as any).leadGenApiKeys as any || {};

        // Ensure conversation exists BEFORE calling the flow so saveLeads can link to it
        let activeConversationId: string;
        if (existingConversation) {
            activeConversationId = existingConversation.id;
        } else {
            const autoTitle = userMessage.slice(0, 80) + (userMessage.length > 80 ? '...' : '');
            const newConversation = await db.leadGeneratorConversation.create({
                data: {
                    title: autoTitle,
                    messages: [{ role: 'user', content: [{ text: userMessage }] }],
                    totalCost: 0,
                    totalTokens: 0,
                    model: model || null,
                    companyId: user.company!.id,
                },
            });
            activeConversationId = newConversation.id;
        }

        // ===== SSE STREAMING MODE =====
        if (stream) {
            const encoder = new TextEncoder();
            const readableStream = new ReadableStream({
                async start(controller) {
                    const sendEvent = (event: string, data: any) => {
                        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
                    };

                    // Send conversationId immediately
                    sendEvent('conversationId', { conversationId: activeConversationId });

                    try {
                        const onProgress = (progressEvent: ProgressEvent) => {
                            sendEvent('progress', progressEvent);
                        };

                        console.log(`[LeadGen-Route] ▶ Calling leadGeneratorFlow — aiProvider=${aiProvider}, model=${model}, userMsg="${userMessage.substring(0, 60)}", apiKeys=${Object.keys(leadGenApiKeys).filter(k => leadGenApiKeys[k]).join(',')}`);

                        const result = await leadGeneratorFlow({
                            messages: chatMessages,
                            companyId: user.company!.id,
                            model: model || undefined,
                            apiKey: (user as any).openRouterApiKey || undefined,
                            leadGenApiKeys,
                            conversationId: activeConversationId,
                            aiProvider: aiProvider || 'openrouter',
                            onProgress,
                            skillsContext: skillsContext || undefined,
                        });

                        // Save conversation
                        const newTotalCost = previousCost + result.cost;
                        const updatedHistory = [
                            ...conversationHistory,
                            { role: 'user', content: [{ text: userMessage }] },
                            { role: 'model', content: [{ text: result.text }] },
                        ];
                        const newTotalTokens = (existingConversation?.totalTokens || 0) + result.totalTokens;
                        await db.leadGeneratorConversation.update({
                            where: { id: activeConversationId },
                            data: { messages: updatedHistory, totalCost: newTotalCost, totalTokens: newTotalTokens, model: model || undefined, updatedAt: new Date() },
                        });

                        // Send final result
                        sendEvent('result', {
                            success: true,
                            message: result.text,
                            conversationId: activeConversationId,
                            cost: result.cost,
                            totalCost: newTotalCost,
                            totalTokens: newTotalTokens,
                            model: model || null,
                        });
                    } catch (error: any) {
                        console.error('Error in lead generator SSE:', error);
                        sendEvent('error', { error: error.message || 'Errore interno' });
                    } finally {
                        controller.close();
                    }
                },
            });

            return new Response(readableStream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        }

        // ===== CLASSIC (NON-STREAMING) MODE =====
        const result = await leadGeneratorFlow({
            messages: chatMessages,
            companyId: user.company!.id,
            model: model || undefined,
            apiKey: (user as any).openRouterApiKey || undefined,
            leadGenApiKeys,
            conversationId: activeConversationId,
            aiProvider: aiProvider || 'openrouter',
            skillsContext: skillsContext || undefined,
        });

        // Calculate total cost (accumulated from previous + this call)
        const newTotalCost = previousCost + result.cost;

        // Update conversation with full history and cost
        const updatedHistory = [
            ...conversationHistory,
            { role: 'user', content: [{ text: userMessage }] },
            { role: 'model', content: [{ text: result.text }] },
        ];

        const newTotalTokens = (existingConversation?.totalTokens || 0) + result.totalTokens;
        const savedConversation = await db.leadGeneratorConversation.update({
            where: { id: activeConversationId },
            data: {
                messages: updatedHistory,
                totalCost: newTotalCost,
                totalTokens: newTotalTokens,
                model: model || undefined,
                updatedAt: new Date(),
            },
        });

        return NextResponse.json({
            success: true,
            message: result.text,
            conversationId: savedConversation.id,
            cost: result.cost,
            totalCost: savedConversation.totalCost,
            totalTokens: newTotalTokens,
            model: model || null,
        });
    } catch (error: any) {
        console.error('Error in lead generator API:', error);
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
        const user = await getAuthenticatedCompanyUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');
        const id = searchParams.get('id');

        // List all conversations (metadata only)
        if (action === 'list') {
            const conversations = await db.leadGeneratorConversation.findMany({
                where: { companyId: user.company!.id },
                orderBy: { updatedAt: 'desc' },
                select: { id: true, title: true, totalCost: true, totalTokens: true, model: true, createdAt: true, updatedAt: true },
                take: 50,
            });
            return NextResponse.json({ success: true, conversations });
        }

        // Load a specific conversation by ID
        if (id) {
            const conversation = await db.leadGeneratorConversation.findUnique({
                where: { id },
            });
            if (!conversation || conversation.companyId !== user.company!.id) {
                return NextResponse.json({ success: true, conversation: null });
            }
            return NextResponse.json({
                success: true,
                conversation: {
                    id: conversation.id,
                    title: conversation.title,
                    totalCost: conversation.totalCost,
                    totalTokens: conversation.totalTokens,
                    model: conversation.model,
                    messages: conversation.messages,
                },
            });
        }

        // Default: load most recent conversation
        const conversation = await db.leadGeneratorConversation.findFirst({
            where: { companyId: user.company!.id },
            orderBy: { updatedAt: 'desc' },
        });

        if (!conversation) {
            return NextResponse.json({ success: true, conversation: null });
        }

        return NextResponse.json({
            success: true,
            conversation: {
                id: conversation.id,
                title: conversation.title,
                totalCost: conversation.totalCost,
                totalTokens: conversation.totalTokens,
                model: conversation.model,
                messages: conversation.messages,
            },
        });
    } catch (error: any) {
        console.error('Error loading lead generator conversation:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = await getAuthenticatedCompanyUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            await db.leadGeneratorConversation.deleteMany({
                where: { id, companyId: user.company!.id },
            });
        } else {
            await db.leadGeneratorConversation.deleteMany({
                where: { companyId: user.company!.id },
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error clearing lead generator conversation:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await getAuthenticatedCompanyUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, title } = await request.json();
        if (!id || typeof title !== 'string') {
            return NextResponse.json({ error: 'Missing id or title' }, { status: 400 });
        }

        const updated = await db.leadGeneratorConversation.updateMany({
            where: { id, companyId: user.company!.id },
            data: { title: title.trim() },
        });

        if (updated.count === 0) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error updating lead generator conversation:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
