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
        conversationHistory,
      });
    } else if (agentType === 'python') {
      agentResponse = await pythonAgentChat({
        nodeId,
        agentType,
        userMessage,
        script,
        tableSchema,
        inputTables,
        conversationHistory,
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
      },
      {
        role: 'assistant',
        content: agentResponse.message,
        timestamp: Date.now(),
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
