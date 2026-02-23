import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { sqlAgentChat } from '@/ai/flows/sql-agent-flow';
import { pythonAgentChat } from '@/ai/flows/python-agent-flow';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      nodeId,
      agentType,
      userMessage,
      script,
      tableSchema,
      inputTables,
      nodeQueries,
      connectorId,
      selectedDocuments,
    } = body;

    if (!nodeId || !agentType || !userMessage) {
      return NextResponse.json(
        { error: 'Missing required fields: nodeId, agentType, userMessage' },
        { status: 400 }
      );
    }

    // Get user's company
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    // Get or create conversation
    let conversation = await db.agentConversation.findUnique({
      where: {
        nodeId_agentType: {
          nodeId,
          agentType,
        },
      },
    });

    let conversationHistory: any[] = [];
    if (conversation) {
      conversationHistory = conversation.messages as any[];
    }

    // Call the appropriate agent
    let agentResponse;
    if (agentType === 'sql') {
      agentResponse = await sqlAgentChat({
        nodeId,
        agentType,
        userMessage,
        script,
        tableSchema,
        inputTables,
        nodeQueries,
        conversationHistory,
        connectorId: connectorId || undefined,
        companyId: user.company.id,
      });
    } else if (agentType === 'python') {
      agentResponse = await pythonAgentChat({
        nodeId,
        agentType,
        userMessage,
        script,
        tableSchema,
        inputTables,
        nodeQueries,
        conversationHistory,
        connectorId: connectorId || undefined,
        selectedDocuments: selectedDocuments || undefined,
        companyId: user.company.id,
      });
    } else {
      return NextResponse.json({ error: 'Invalid agent type' }, { status: 400 });
    }

    // Update conversation history
    const updatedHistory = [
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        scriptSnapshot: script,
      },
      {
        role: 'assistant',
        content: agentResponse.message,
        timestamp: Date.now(),
        scriptSnapshot: agentResponse.updatedScript || script,
        clarificationQuestions: agentResponse.needsClarification ? agentResponse.clarificationQuestions : undefined,
        consultedNodes: agentResponse.consultedNodes,
      },
    ];

    // Save or update conversation
    if (conversation) {
      conversation = await db.agentConversation.update({
        where: { id: conversation.id },
        data: {
          script,
          tableSchema,
          inputTables,
          messages: updatedHistory,
          updatedAt: new Date(),
        },
      });
    } else {
      conversation = await db.agentConversation.create({
        data: {
          nodeId,
          agentType,
          script,
          tableSchema,
          inputTables,
          messages: updatedHistory,
          companyId: user.company.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: agentResponse.message,
      updatedScript: agentResponse.updatedScript,
      needsClarification: agentResponse.needsClarification,
      clarificationQuestions: agentResponse.clarificationQuestions,
      conversationId: conversation.id,
      usage: agentResponse.usage,
      consultedNodes: agentResponse.consultedNodes,
    });
  } catch (error: any) {
    console.error('Error in agent chat API:', error);
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

    const searchParams = request.nextUrl.searchParams;
    const nodeId = searchParams.get('nodeId');
    const agentType = searchParams.get('agentType');

    if (!nodeId || !agentType) {
      return NextResponse.json(
        { error: 'Missing required parameters: nodeId, agentType' },
        { status: 400 }
      );
    }

    // Get user's company
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    // Get conversation
    const conversation = await db.agentConversation.findUnique({
      where: {
        nodeId_agentType: {
          nodeId,
          agentType,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({
        success: true,
        conversation: null,
      });
    }

    // Verify company access
    if (conversation.companyId !== user.company.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      conversation: {
        id: conversation.id,
        messages: conversation.messages,
        script: conversation.script,
        tableSchema: conversation.tableSchema,
        inputTables: conversation.inputTables,
      },
    });
  } catch (error: any) {
    console.error('Error getting agent conversation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: Delete specific versions (messages) from a conversation
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { nodeId, agentType, deleteVersionIndices } = body;

    if (!nodeId || !agentType || !Array.isArray(deleteVersionIndices) || deleteVersionIndices.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: nodeId, agentType, deleteVersionIndices' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    const conversation = await db.agentConversation.findUnique({
      where: { nodeId_agentType: { nodeId, agentType } },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.companyId !== user.company.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const messages = conversation.messages as any[];

    // deleteVersionIndices contains message indices to remove
    // We need to remove both the user message (at index) and the assistant response (at index+1)
    // for each version, but versions are tracked by assistant message indices.
    // The caller sends the messageIndex from scriptVersions, which points to assistant messages.
    // We remove the assistant message and the user message right before it.
    const indicesToRemove = new Set<number>();
    for (const msgIdx of deleteVersionIndices) {
      indicesToRemove.add(msgIdx); // assistant message
      // Find the user message before it
      if (msgIdx > 0 && messages[msgIdx - 1]?.role === 'user') {
        indicesToRemove.add(msgIdx - 1);
      }
    }

    const filteredMessages = messages.filter((_: any, i: number) => !indicesToRemove.has(i));

    await db.agentConversation.update({
      where: { id: conversation.id },
      data: { messages: filteredMessages, updatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      messages: filteredMessages,
    });
  } catch (error: any) {
    console.error('Error patching agent conversation:', error);
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

    const searchParams = request.nextUrl.searchParams;
    const nodeId = searchParams.get('nodeId');
    const agentType = searchParams.get('agentType');

    if (!nodeId || !agentType) {
      return NextResponse.json(
        { error: 'Missing required parameters: nodeId, agentType' },
        { status: 400 }
      );
    }

    // Get user's company
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { company: true },
    });

    if (!user?.company) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    // Get and verify conversation
    const conversation = await db.agentConversation.findUnique({
      where: {
        nodeId_agentType: {
          nodeId,
          agentType,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Verify company access
    if (conversation.companyId !== user.company.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete conversation
    await db.agentConversation.delete({
      where: { id: conversation.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting agent conversation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
