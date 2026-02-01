'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Loader2, AlertCircle, ArrowLeft, RotateCcw } from 'lucide-react';
import { AgentChatMessage, AgentResponse } from '@/lib/types';

interface AgentChatProps {
  nodeId: string;
  agentType: 'sql' | 'python';
  script: string;
  tableSchema?: Record<string, string[]>;
  inputTables?: Record<string, any[]>;
  onScriptUpdate?: (newScript: string) => void;
  onClose?: () => void;
  onGoBack?: (messageIndex: number) => void;
}

export function AgentChat({
  nodeId,
  agentType,
  script,
  tableSchema,
  inputTables,
  onScriptUpdate,
  onClose,
  onGoBack,
}: AgentChatProps) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [needsClarification, setNeedsClarification] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversation history on mount
  useEffect(() => {
    loadConversation();
  }, [nodeId, agentType]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversation = async () => {
    try {
      const params = new URLSearchParams({
        nodeId,
        agentType,
      });
      const response = await fetch(`/api/agents/chat?${params}`);
      const data = await response.json();

      if (data.success && data.conversation) {
        setMessages(data.conversation.messages || []);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message to UI immediately
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        scriptSnapshot: script, // Save snapshot of script BEFORE agent changes
      },
    ]);

    try {
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeId,
          agentType,
          userMessage,
          script,
          tableSchema,
          inputTables,
        }),
      });

      const data: AgentResponse = await response.json();

      if (data.success) {
        // Add assistant message
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            timestamp: Date.now(),
            scriptSnapshot: data.updatedScript || script, // Save snapshot of script AFTER agent changes
          },
        ]);

        // Handle clarification
        if (data.needsClarification && data.clarificationQuestions) {
          setNeedsClarification(true);
          setClarificationQuestions(data.clarificationQuestions);
        } else {
          setNeedsClarification(false);
          setClarificationQuestions([]);
        }

        // Update script if provided
        if (data.updatedScript && onScriptUpdate) {
          onScriptUpdate(data.updatedScript);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Errore: ${data.message}`,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Si è verificato un errore durante l\'invio del messaggio.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoBack = (messageIndex: number) => {
    // Check if there is a snapshot to restore for this message
    const targetMessage = messages[messageIndex];
    if (targetMessage && targetMessage.scriptSnapshot && onScriptUpdate) {
      onScriptUpdate(targetMessage.scriptSnapshot);
    }

    // Truncate messages to the specified index
    setMessages((prev) => prev.slice(0, messageIndex + 1));

    // If onGoBack callback is provided, call it
    if (onGoBack) {
      onGoBack(messageIndex);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = async () => {
    try {
      const params = new URLSearchParams({
        nodeId,
        agentType,
      });
      await fetch(`/api/agents/chat?${params}`, {
        method: 'DELETE',
      });
      setMessages([]);
      setNeedsClarification(false);
      setClarificationQuestions([]);
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            Agente {agentType === 'sql' ? 'SQL' : 'Python'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearConversation}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Cronologia"
          >
            <X className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              title="Chiudi"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
            <MessageSquare className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">
              Chatta con l'agente {agentType === 'sql' ? 'SQL' : 'Python'} per modificare il codice.
            </p>
            <p className="text-xs mt-2 text-gray-400">
              L'agente capisce il contesto delle tabelle e del codice.
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group items-center gap-2`}
          >
            {msg.role === 'user' && (
              <button
                onClick={() => handleGoBack(index)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                title="Torna qui (cancella successivi)"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900'
                }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
            {msg.role === 'assistant' && (
              <button
                onClick={() => handleGoBack(index)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                title="Torna qui (cancella successivi)"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}


        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              <span className="text-sm text-gray-500">L'agente sta pensando...</span>
            </div>
          </div>
        )}

        {needsClarification && clarificationQuestions.length > 0 && (
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900 text-sm">
                    Ho bisogno di chiarimenti
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Per aiutarti meglio, rispondi a queste domande:
                  </p>
                </div>
              </div>
              <ul className="space-y-1 mt-2">
                {clarificationQuestions.map((question, idx) => (
                  <li key={idx} className="text-sm text-amber-800 flex items-start gap-2">
                    <span className="flex-shrink-0">{idx + 1}.</span>
                    <span>{question}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Scrivi un messaggio all'agente..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">Invia</span>
          </button>
        </div>
      </div>
    </div>
  );
}
