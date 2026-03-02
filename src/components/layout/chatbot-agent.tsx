'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import {
    X,
    Send,
    Bot,
    Loader2,
    Trash2,
    Sparkles,
    MessageSquare,
    Command as CommandIcon,
    PenLine,
    Search,
    Database,
    Code2,
    BookOpen,
    ChevronsUpDown,
    Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { fetchOpenRouterModelsAction } from '@/app/actions';
import { useOpenRouterSettings } from '@/hooks/use-openrouter';
import { getOpenRouterAgentModelAction, saveOpenRouterAgentModelAction } from '@/actions/openrouter';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { createKnowledgeBaseEntryAction } from '@/app/actions/knowledge-base';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { ConsultedNodesSection } from '@/components/agents/consulted-nodes-section';
import { ToolCallsDisplay, type ToolCallInfo } from '@/components/agents/tool-call-display';
import type { ConsultedNode } from '@/lib/types';

type Message = {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    consultedNodes?: ConsultedNode[];
};

// Safely extract a display string from a message content field
// (handles Genkit array format, plain strings, and any other shape)
function safeContentString(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('');
    }
    if (content && typeof (content as any).text === 'string') return (content as any).text;
    return '';
}

// Parse recharts config from markdown code blocks
function parseRechartsBlocks(content: unknown): { text: string; charts: any[] } {
    const safeContent = safeContentString(content);
    const charts: any[] = [];
    const text = safeContent.replace(/```recharts\n([\s\S]*?)```/g, (_, json) => {
        try {
            const config = JSON.parse(json.trim());
            charts.push(config);
            return `[CHART_${charts.length - 1}]`;
        } catch {
            return json;
        }
    });
    return { text, charts };
}

// Simple markdown renderer for tables, bold, code blocks
function RichContent({ content, charts }: { content: unknown; charts: any[] }) {
    const safeStr = safeContentString(content);
    const parts = safeStr.split(/(\[CHART_\d+\]|```(?:sql|python|json)[\s\S]*?```|\|.*\|(?:\n\|.*\|)*)/g);

    return (
        <div className="space-y-2">
            {parts.map((part, i) => {
                if (typeof part !== 'string') return null;

                // Chart placeholder
                const chartMatch = part.match(/\[CHART_(\d+)\]/);
                if (chartMatch) {
                    const chartIndex = parseInt(chartMatch[1]);
                    const chart = charts[chartIndex];
                    if (chart) return <InlineChart key={i} config={chart} />;
                    return null;
                }

                // Code block
                const codeMatch = part.match(/```(sql|python|json)\n([\s\S]*?)```/);
                if (codeMatch) {
                    return (
                        <div key={i} className="relative my-2">
                            <div className="flex items-center gap-1 px-3 py-1 bg-muted rounded-t-lg border border-b-0">
                                <Code2 className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] uppercase font-medium text-muted-foreground">{codeMatch[1]}</span>
                            </div>
                            <pre className="bg-zinc-950 text-zinc-100 px-3 py-2 rounded-b-lg text-[11px] overflow-x-auto border">
                                <code>{codeMatch[2].trim()}</code>
                            </pre>
                        </div>
                    );
                }

                // Markdown table
                if (part.includes('|') && part.split('\n').length >= 2) {
                    const lines = part.trim().split('\n').filter(l => l.includes('|'));
                    if (lines.length >= 2) {
                        const headers = lines[0].split('|').filter(c => c.trim() && !c.match(/^[\s-]+$/));
                        const isSeparator = (line: string) => /^\|[\s-:|]+\|$/.test(line.trim());
                        const dataLines = lines.filter(l => !isSeparator(l)).slice(1);

                        if (headers.length > 0 && dataLines.length > 0) {
                            return (
                                <div key={i} className="my-2 rounded-lg border w-full overflow-hidden">
                                    <table className="w-full text-[11px] table-auto">
                                        <thead>
                                            <tr className="bg-muted/50">
                                                {headers.map((h, j) => (
                                                    <th key={j} className="px-2 py-1.5 text-left font-semibold border-b">
                                                        {h.trim()}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataLines.map((row, j) => {
                                                const cells = row.split('|').filter(c => c.trim());
                                                return (
                                                    <tr key={j} className="border-b last:border-0 hover:bg-muted/30">
                                                        {cells.map((cell, k) => (
                                                            <td key={k} className="px-2 py-1 break-words">{cell.trim()}</td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        }
                    }
                }

                // Regular text with bold markdown
                if (!part.trim()) return null;
                return (
                    <div key={i} className="whitespace-pre-wrap break-words min-w-0" dangerouslySetInnerHTML={{
                        __html: part
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-[11px]">$1</code>')
                    }} />
                );
            })}
        </div>
    );
}

function InlineChart({ config }: { config: any }) {
    const { theme } = useChartTheme();
    const { type, data, xAxisKey, dataKeys, colors, title } = config;

    // Type-guard all values that could be non-primitive (AI may produce objects instead of strings/arrays)
    const chartColors = Array.isArray(colors) ? colors : theme.colors;
    const safeTitle = typeof title === 'string' ? title : null;
    const safeXAxisKey = typeof xAxisKey === 'string' ? xAxisKey : 'name';
    const safeDataKeys: string[] = Array.isArray(dataKeys)
        ? dataKeys.filter((k: unknown) => typeof k === 'string')
        : [];

    if (!data || !Array.isArray(data) || data.length === 0) return null;

    return (
        <div className="my-2 p-3 rounded-lg border bg-background w-full overflow-x-hidden">
            {safeTitle && <p className="text-xs font-semibold mb-2 text-center">{safeTitle}</p>}
            <ResponsiveContainer width="100%" height={200}>
                {type === 'bar-chart' ? (
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={safeXAxisKey} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {safeDataKeys.map((key, i) => (
                            <Bar key={key} dataKey={key} fill={chartColors[i % chartColors.length]} />
                        ))}
                    </BarChart>
                ) : type === 'line-chart' ? (
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={safeXAxisKey} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {safeDataKeys.map((key, i) => (
                            <Line key={key} type="monotone" dataKey={key} stroke={chartColors[i % chartColors.length]} strokeWidth={2} />
                        ))}
                    </LineChart>
                ) : type === 'area-chart' ? (
                    <AreaChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={safeXAxisKey} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        {safeDataKeys.map((key, i) => (
                            <Area key={key} type="monotone" dataKey={key} fill={chartColors[i % chartColors.length]} stroke={chartColors[i % chartColors.length]} fillOpacity={0.3} />
                        ))}
                    </AreaChart>
                ) : type === 'pie-chart' ? (
                    <PieChart>
                        <Pie data={data} dataKey={(safeDataKeys.length > 0 ? safeDataKeys : ['value'])[0]} nameKey={safeXAxisKey} cx="50%" cy="50%" outerRadius={70} label={{ fontSize: 10 }}>
                            {data.map((_: any, i: number) => (
                                <Cell key={i} fill={chartColors[i % chartColors.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                ) : (
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={safeXAxisKey} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        {safeDataKeys.map((key, i) => (
                            <Bar key={key} dataKey={key} fill={chartColors[i % chartColors.length]} />
                        ))}
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}

import { useLayout } from '@/components/providers/layout-provider';

export function ChatBotAgent() {
    const { toast } = useToast();
    const { isChatbotOpen, toggleChatbot, setChatbotOpen } = useLayout();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [conversationId, setConversationId] = useState<string | null>(null);

    // Model selector state
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
    const [isSavingModel, setIsSavingModel] = useState(false);

    // Correction dialog state
    const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
    const [correctionMessageIndex, setCorrectionMessageIndex] = useState<number | null>(null);
    const [correctionText, setCorrectionText] = useState('');
    const [correctionTags, setCorrectionTags] = useState('');
    const [isSavingCorrection, setIsSavingCorrection] = useState(false);

    // Refs for dynamic values injected into stream transport
    const modelRef = useRef(model);
    modelRef.current = model;
    const conversationIdRef = useRef(conversationId);
    conversationIdRef.current = conversationId;

    // Streaming transport (stable reference, reads dynamic values via refs)
    const streamTransport = useMemo(() => new DefaultChatTransport({
        api: '/api/super-agent/stream',
        prepareSendMessagesRequest: ({ body, messages: msgs, ...rest }) => ({
            ...rest,
            body: {
                messages: msgs,
                ...body,
                model: modelRef.current,
                conversationId: conversationIdRef.current,
            },
        }),
    }), []);

    // useChat hook for streaming
    const {
        messages: streamMessages,
        sendMessage: streamSendMessage,
        status: streamStatus,
        setMessages: setStreamMessages,
    } = useChat({
        transport: streamTransport,
        onFinish: async ({ message }: { message: UIMessage }) => {
            // Extract text from message parts
            const textContent = message.parts
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map(p => p.text)
                .join('');

            // Add the completed assistant message to our local state
            setMessages(prev => [...prev, {
                role: 'assistant' as const,
                content: textContent,
                timestamp: Date.now(),
            }]);

            // Clear stream messages (transferred to local state)
            setStreamMessages([]);

            // Refresh conversation ID from server (needed after first message creates a new conversation)
            try {
                const res = await fetch('/api/super-agent');
                const data = await res.json();
                if (data.success && data.conversation) {
                    setConversationId(data.conversation.id);
                }
            } catch { /* ignore */ }
        },
        onError: (error: Error) => {
            setMessages(prev => [...prev, {
                role: 'assistant' as const,
                content: `⚠️ **Errore**\n\n${error.message || "Si è verificato un errore durante la comunicazione con l'agente."}`,
                timestamp: Date.now(),
            }]);
            setStreamMessages([]);
        },
    });

    const isStreamLoading = streamStatus === 'streaming' || streamStatus === 'submitted';

    // Load models and saved agent model on mount
    useEffect(() => {
        fetchOpenRouterModelsAction().then(result => {
            if (result.data) setAvailableModels(result.data);
        });
        getOpenRouterAgentModelAction().then(result => {
            if (result.model) setModel(result.model);
        });
    }, []);

    const handleModelChange = async (newModel: string) => {
        setModel(newModel);
        setModelSelectorOpen(false);
        setIsSavingModel(true);
        try {
            await saveOpenRouterAgentModelAction(newModel);
        } catch { /* ignore */ }
        setIsSavingModel(false);
    };

    // Load conversation from server on mount
    useEffect(() => {
        const loadConversation = async () => {
            try {
                const res = await fetch('/api/super-agent');
                const data = await res.json();
                if (data.success && data.conversation) {
                    setConversationId(data.conversation.id);
                    // Normalize content to string to handle legacy Genkit array format
                    setMessages((data.conversation.messages as any[]).map((m: any) => ({
                        role: m.role as 'user' | 'assistant',
                        content: safeContentString(m.content),
                        timestamp: m.timestamp || Date.now(),
                        consultedNodes: m.consultedNodes,
                    })));
                } else {
                    setMessages([{
                        role: 'assistant',
                        content: "Ciao! Sono **FridAI**, il tuo super agente. Posso esplorare tutti i tuoi alberi, eseguire query SQL, generare grafici e molto altro. Chiedimi qualsiasi cosa sui tuoi dati!",
                        timestamp: Date.now(),
                    }]);
                }
            } catch {
                setMessages([{
                    role: 'assistant',
                    content: "Ciao! Sono **FridAI**, il tuo super agente. Come posso aiutarti?",
                    timestamp: Date.now(),
                }]);
            }
        };
        loadConversation();
    }, []);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        setTimeout(() => {
            const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
            if (viewport) {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
            }
        }, 100);
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isStreamLoading]);

    const handleSend = () => {
        if (!input.trim() || isStreamLoading) return;

        const userText = input.trim();
        setInput('');

        // Add user message to local state immediately
        setMessages(prev => [...prev, {
            role: 'user',
            content: userText,
            timestamp: Date.now(),
        }]);

        // Kick off streaming
        streamSendMessage({ text: userText });
    };

    const clearChat = async () => {
        try {
            await fetch('/api/super-agent', { method: 'DELETE' });
        } catch { /* ignore */ }

        setConversationId(null);
        setStreamMessages([]);
        setMessages([{
            role: 'assistant',
            content: "Chat ripulita. Come posso aiutarti?",
            timestamp: Date.now(),
        }]);
    };

    const openCorrectionDialog = (messageIndex: number) => {
        setCorrectionMessageIndex(messageIndex);
        setCorrectionText('');
        setCorrectionTags('');
        setCorrectionDialogOpen(true);
    };

    const handleSaveCorrection = async () => {
        if (!correctionText.trim() || correctionMessageIndex === null) return;

        setIsSavingCorrection(true);
        try {
            const originalMessage = messages[correctionMessageIndex];
            // Find the user question that preceded this assistant message
            let userQuestion = '';
            for (let i = correctionMessageIndex - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                    userQuestion = messages[i].content;
                    break;
                }
            }

            const tags = correctionTags
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(Boolean);

            const result = await createKnowledgeBaseEntryAction({
                question: userQuestion || 'Correzione manuale',
                answer: correctionText,
                tags,
                category: 'Correzione',
                context: `Risposta originale: ${originalMessage.content.substring(0, 500)}`,
            });

            if (result.error) {
                throw new Error(result.error);
            }

            toast({
                title: "Correzione salvata",
                description: "La correzione e' stata aggiunta alla Knowledge Base.",
            });

            // Also send the correction as a new message to the agent
            setInput(`CORREZIONE: ${correctionText}`);
            setCorrectionDialogOpen(false);
        } catch (error: any) {
            toast({
                title: "Errore",
                description: error.message || "Impossibile salvare la correzione.",
                variant: "destructive",
            });
        } finally {
            setIsSavingCorrection(false);
        }
    };

    if (!isChatbotOpen) {
        return (
            <Button
                onClick={() => setChatbotOpen(true)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl animate-in fade-in zoom-in duration-300 z-50 group overflow-hidden bg-gradient-to-br from-primary to-purple-600"
            >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <MessageSquare className="h-6 w-6 text-white" />
            </Button>
        );
    }

    return (
        <>
            <div className="fixed top-0 right-0 z-40 h-screen w-96 border-l bg-background/95 backdrop-blur-xl animate-in slide-in-from-right duration-500 shadow-2xl">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex h-16 items-center justify-between border-b px-6 bg-muted/30">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold tracking-tight">FridAI Super Agent</h2>
                                <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                                    <PopoverTrigger asChild>
                                        <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                                            <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                            <span className="truncate max-w-[160px]">
                                                {isSavingModel ? 'Salvando...' : (availableModels.find(m => m.id === model)?.name || model.split('/').pop())}
                                            </span>
                                            <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Cerca modello..." />
                                            <CommandList>
                                                <CommandEmpty>Nessun modello trovato.</CommandEmpty>
                                                <CommandGroup heading="Modelli disponibili">
                                                    {availableModels.map(m => (
                                                        <CommandItem
                                                            key={m.id}
                                                            value={m.id}
                                                            onSelect={() => handleModelChange(m.id)}
                                                            className="text-xs"
                                                        >
                                                            <Check className={cn("mr-2 h-3 w-3", model === m.id ? "opacity-100" : "opacity-0")} />
                                                            <span className="truncate">{m.name}</span>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={clearChat} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setChatbotOpen(false)} className="h-8 w-8 rounded-lg">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Capability badges */}
                    <div className="flex gap-1 px-4 py-2 border-b bg-muted/10 overflow-x-auto">
                        <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
                            <Database className="h-2.5 w-2.5" /> SQL
                        </Badge>
                        <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
                            <Code2 className="h-2.5 w-2.5" /> Python
                        </Badge>
                        <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
                            <Search className="h-2.5 w-2.5" /> Alberi
                        </Badge>
                        <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
                            <BookOpen className="h-2.5 w-2.5" /> KB
                        </Badge>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                        <div className="w-full min-w-0 overflow-x-hidden space-y-4">
                            {messages.map((m, i) => {
                                // safeContentString guards against any non-string content from DB
                                const safeContent = safeContentString(m.content);
                                const { text, charts } = m.role === 'assistant'
                                    ? parseRechartsBlocks(safeContent)
                                    : { text: safeContent, charts: [] };

                                return (
                                    <div key={m.timestamp + i} className={cn(
                                        "w-full min-w-0 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2",
                                        m.role === 'user' ? "items-end" : "items-start"
                                    )}>
                                        <div className={cn(
                                            "flex items-center gap-2 mb-0.5",
                                            m.role === 'user' ? "flex-row-reverse" : "flex-row"
                                        )}>
                                            <div className={cn(
                                                "h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                                                m.role === 'user' ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-primary/80 to-purple-500/80 text-white"
                                            )}>
                                                {m.role === 'user' ? 'U' : <Sparkles className="h-3 w-3" />}
                                            </div>
                                            <span className="text-[10px] font-medium text-muted-foreground">
                                                {m.role === 'user' ? 'Tu' : 'FridAI'}
                                            </span>
                                        </div>
                                        <div className={cn(
                                            "max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm break-all overflow-hidden",
                                            m.role === 'user'
                                                ? "bg-primary text-primary-foreground rounded-tr-none"
                                                : "bg-muted/50 border rounded-tl-none"
                                        )}>
                                            <div className="min-w-0">
                                                {/* Consulted nodes - collapsible */}
                                                {m.role === 'assistant' && m.consultedNodes && m.consultedNodes.length > 0 && (
                                                    <ConsultedNodesSection nodes={m.consultedNodes} />
                                                )}
                                                {m.role === 'assistant' ? (
                                                    <RichContent content={text} charts={charts} />
                                                ) : (
                                                    safeContent
                                                )}
                                            </div>
                                        </div>
                                        {m.role === 'assistant' && i > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary gap-1"
                                                onClick={() => openCorrectionDialog(i)}
                                            >
                                                <PenLine className="h-3 w-3" />
                                                Correggi
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Streaming: show real-time tool calls and text */}
                            {isStreamLoading && streamMessages.length > 0 && (() => {
                                const assistantMsg = streamMessages.filter(m => m.role === 'assistant').pop();
                                if (!assistantMsg) return null;

                                // Extract tool calls from parts
                                const toolCalls: ToolCallInfo[] = assistantMsg.parts
                                    .filter((p): p is Extract<typeof p, { type: string; toolName: string }> =>
                                        p.type === 'dynamic-tool' || p.type.startsWith('tool-')
                                    )
                                    .map((tc: any) => ({
                                        toolCallId: tc.toolCallId,
                                        toolName: tc.toolName || tc.type.replace('tool-', ''),
                                        args: tc.input || {},
                                        status: tc.state === 'output-available' ? 'completed' as const
                                            : tc.state === 'output-error' ? 'failed' as const
                                            : 'running' as const,
                                        result: tc.state === 'output-available'
                                            ? (typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output))
                                            : tc.state === 'output-error' ? tc.errorText : undefined,
                                    }));

                                // Extract streaming text
                                const streamingText = assistantMsg.parts
                                    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
                                    .map((p: any) => p.text)
                                    .join('');

                                return (
                                    <div className="w-full min-w-0 flex flex-col gap-1 items-start animate-in fade-in">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <div className="h-5 w-5 rounded-full flex items-center justify-center bg-gradient-to-br from-primary/80 to-purple-500/80 text-white">
                                                <Sparkles className="h-3 w-3 animate-pulse" />
                                            </div>
                                            <span className="text-[10px] font-medium text-muted-foreground">FridAI</span>
                                        </div>
                                        <div className="max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm bg-muted/50 border rounded-tl-none min-w-0 overflow-hidden">
                                            {/* Tool calls display */}
                                            {toolCalls.length > 0 && (
                                                <ToolCallsDisplay toolCalls={toolCalls} />
                                            )}
                                            {/* Streaming text */}
                                            {streamingText && (
                                                <div className="mt-1">
                                                    {(() => {
                                                        const { text, charts } = parseRechartsBlocks(streamingText);
                                                        return <RichContent content={text} charts={charts} />;
                                                    })()}
                                                </div>
                                            )}
                                            {/* Dots while waiting */}
                                            {!streamingText && toolCalls.every(tc => tc.status === 'completed') && (
                                                <div className="flex gap-1">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Initial dots while stream is submitted but no messages yet */}
                            {isStreamLoading && streamMessages.length === 0 && (
                                <div className="flex items-start gap-2">
                                    <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center">
                                        <Loader2 className="h-3 w-3 animate-spin text-white" />
                                    </div>
                                    <div className="bg-muted/30 border rounded-2xl rounded-tl-none px-3 py-2">
                                        <div className="text-[11px] text-muted-foreground mb-1">Sto analizzando la tua richiesta...</div>
                                        <div className="flex gap-1">
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>

                    {/* Input */}
                    <div className="p-3 border-t bg-background">
                        <div className="relative group">
                            <Input
                                placeholder="Chiedi qualsiasi cosa sui tuoi dati..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                className="pr-12 h-11 rounded-xl border-muted-foreground/20 focus-visible:ring-primary shadow-inner bg-muted/5 group-focus-within:bg-background transition-all text-sm"
                            />
                            <Button
                                onClick={handleSend}
                                disabled={!input.trim() || isStreamLoading}
                                size="icon"
                                className="absolute right-1.5 top-1 h-9 w-9 rounded-lg"
                            >
                                {isStreamLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            </Button>
                        </div>
                        <div className="mt-2 text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1.5 uppercase font-medium tracking-widest">
                            <CommandIcon className="h-2.5 w-2.5" />
                            Invio per inviare
                        </div>
                    </div>
                </div>
            </div>

            {/* Correction Dialog */}
            <Dialog open={correctionDialogOpen} onOpenChange={setCorrectionDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PenLine className="h-4 w-4" />
                            Correggi la risposta
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="text-sm font-medium">Risposta corretta</label>
                            <Textarea
                                placeholder="Scrivi la risposta corretta..."
                                value={correctionText}
                                onChange={(e) => setCorrectionText(e.target.value)}
                                rows={4}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Tag (separati da virgola)</label>
                            <Input
                                placeholder="es. vendite, fatturato, ordini"
                                value={correctionTags}
                                onChange={(e) => setCorrectionTags(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCorrectionDialogOpen(false)}>
                            Annulla
                        </Button>
                        <Button
                            onClick={handleSaveCorrection}
                            disabled={!correctionText.trim() || isSavingCorrection}
                        >
                            {isSavingCorrection ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Salva nella KB
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
