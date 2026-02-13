'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  MessageSquare,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  Code2,
  Database,
  BookOpen,
  PenLine,
  Search,
  CornerDownLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { AgentChatMessage, AgentResponse } from '@/lib/types';
import { createKnowledgeBaseEntryAction } from '@/app/actions/knowledge-base';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';

// Try to extract message from raw JSON that leaked through
function extractFromRawJson(content: string): string {
  // If the content looks like it contains a raw JSON response, extract the message
  const trimmed = content.trim();
  // Match patterns like: JSON\n{...} or ```json\n{...}``` or just {...} at start
  const jsonPatterns = [
    /^(?:JSON\s*\n?\s*)?(\{[\s\S]*\})\s*$/,
    /^```(?:json)?\s*\n(\{[\s\S]*\})\s*```\s*$/,
  ];

  for (const pattern of jsonPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && typeof parsed.message === 'string') {
          return parsed.message;
        }
      } catch { /* not valid JSON */ }
    }
  }

  // Also try bracket-counting for cases where the JSON is embedded in other text
  const jsonStart = content.indexOf('{"message"');
  if (jsonStart !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = jsonStart; j < content.length; j++) {
      const ch = content[j];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"' && !esc) { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(content.substring(jsonStart, j + 1));
            if (parsed && typeof parsed.message === 'string') {
              return parsed.message;
            }
          } catch { /* ignore */ }
          break;
        }
      }
    }
  }

  return content;
}

// Parse recharts config from markdown code blocks
function parseRechartsBlocks(content: string): { text: string; charts: any[] } {
  // First, try to extract from raw JSON if needed
  const cleaned = extractFromRawJson(content);

  const charts: any[] = [];
  const text = cleaned.replace(/```recharts\n([\s\S]*?)```/g, (_, json) => {
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

const DEFAULT_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe', '#00c49f', '#ffbb28', '#ff8042'];

function InlineChart({ config }: { config: any }) {
  const { type, data, xAxisKey, dataKeys, colors, title } = config;
  const chartColors = colors || DEFAULT_COLORS;
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  return (
    <div className="my-2 p-3 rounded-lg border bg-background">
      {title && <p className="text-xs font-semibold mb-2 text-center">{title}</p>}
      <ResponsiveContainer width="100%" height={200}>
        {type === 'bar-chart' ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {(dataKeys || []).map((key: string, i: number) => (
              <Bar key={key} dataKey={key} fill={chartColors[i % chartColors.length]} />
            ))}
          </BarChart>
        ) : type === 'line-chart' ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {(dataKeys || []).map((key: string, i: number) => (
              <Line key={key} type="monotone" dataKey={key} stroke={chartColors[i % chartColors.length]} strokeWidth={2} />
            ))}
          </LineChart>
        ) : type === 'area-chart' ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {(dataKeys || []).map((key: string, i: number) => (
              <Area key={key} type="monotone" dataKey={key} fill={chartColors[i % chartColors.length]} stroke={chartColors[i % chartColors.length]} fillOpacity={0.3} />
            ))}
          </AreaChart>
        ) : type === 'pie-chart' ? (
          <PieChart>
            <Pie data={data} dataKey={(dataKeys || ['value'])[0]} nameKey={xAxisKey} cx="50%" cy="50%" outerRadius={70} label={{ fontSize: 10 }}>
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
            <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            {(dataKeys || []).map((key: string, i: number) => (
              <Bar key={key} dataKey={key} fill={chartColors[i % chartColors.length]} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// Rich content renderer: markdown tables, code blocks, charts, bold, inline code
function RichContent({ content, charts, onApplyCode }: { content: string; charts: any[]; onApplyCode?: (code: string) => void }) {
  const parts = content.split(/(\[CHART_\d+\]|```[\s\S]*?```|\|.*\|(?:\n\|.*\|)*)/gi);

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        // Chart placeholder
        const chartMatch = part.match(/\[CHART_(\d+)\]/);
        if (chartMatch) {
          const chartIndex = parseInt(chartMatch[1]);
          const chart = charts[chartIndex];
          if (chart) return <InlineChart key={i} config={chart} />;
          return null;
        }

        // Code block
        const codeMatch = part.match(/```\s*([^\n\s]*)\s*([\s\S]*?)```/i);
        if (codeMatch) {
          return (
            <div key={i} className="relative my-2">
              <div className="flex items-center justify-between px-3 py-1 bg-muted rounded-t-lg border border-b-0">
                <div className="flex items-center gap-1">
                  <Code2 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase font-medium text-muted-foreground">{codeMatch[1]}</span>
                </div>
              </div>
              <pre className="bg-zinc-950 text-zinc-100 px-3 py-2 rounded-b-lg text-[11px] overflow-x-auto max-w-full whitespace-pre-wrap break-all border">
                <code className="block min-w-0">{codeMatch[2].trim()}</code>
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

interface AgentChatProps {
  nodeId: string;
  agentType: 'sql' | 'python';
  script: string;
  tableSchema?: Record<string, string[]>;
  inputTables?: Record<string, any[]>;
  connectorId?: string;
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
  connectorId,
  onScriptUpdate,
  onClose,
  onGoBack,
}: AgentChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [needsClarification, setNeedsClarification] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [modelName, setModelName] = useState<string>('Gemini 2.5 Flash');

  useEffect(() => {
    getOpenRouterSettingsAction().then((settings) => {
      if (settings?.model) {
        // Simple formatter: remove provider prefix and clean up
        const cleanName = settings.model.split('/').pop() || settings.model;
        // Capitalize words and replace dashes with spaces
        const formatted = cleanName
          .split(/[-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        setModelName(formatted);
      }
    });
  }, []);

  // Correction dialog state
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionMessageIndex, setCorrectionMessageIndex] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionTags, setCorrectionTags] = useState('');
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);

  /* Load conversation history on mount */
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    // Use a small timeout to ensure DOM is fully rendered (especially code blocks/charts)
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  /* Load conversation history logic */
  const loadConversation = async () => {
    try {
      const params = new URLSearchParams({ nodeId, agentType });
      const response = await fetch(`/api/agents/chat?${params}`);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error('[AGENT CHAT] JSON Parse Error:', parseError);
        return;
      }
      if (data.success && data.conversation) {
        setMessages(data.conversation.messages || []);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  // Load conversation history on mount
  useEffect(() => {
    loadConversation();
  }, [nodeId, agentType]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setLoadingStatus('Sto analizzando la tua richiesta...');

    // Add user message to UI immediately
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
        scriptSnapshot: script,
      },
    ]);

    try {
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          agentType,
          userMessage,
          script,
          tableSchema,
          inputTables,
          connectorId,
        }),
      });

      const data: AgentResponse = await response.json();

      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.message,
            timestamp: Date.now(),
            scriptSnapshot: data.updatedScript || script,
          },
        ]);

        if (data.needsClarification && data.clarificationQuestions) {
          setNeedsClarification(true);
          setClarificationQuestions(data.clarificationQuestions);
        } else {
          setNeedsClarification(false);
          setClarificationQuestions([]);
        }

        if (data.updatedScript && onScriptUpdate) {
          onScriptUpdate(data.updatedScript);
        }
      } else {
        throw new Error(data.message || 'Errore sconosciuto');
      }
    } catch (error: any) {
      const errorDetail = error.message || "Impossibile comunicare con l'agente.";
      toast({
        title: "Errore",
        description: errorDetail,
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Ho riscontrato un problema: **${errorDetail}**\n\nPuoi riprovare la domanda o darmi piu' dettagli per aiutarmi a cercare meglio.`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleGoBack = (messageIndex: number) => {
    const targetMessage = messages[messageIndex];
    if (targetMessage && targetMessage.scriptSnapshot && onScriptUpdate) {
      onScriptUpdate(targetMessage.scriptSnapshot);
    }
    setMessages((prev) => prev.slice(0, messageIndex + 1));
    if (onGoBack) {
      onGoBack(messageIndex);
    }
  };

  const clearConversation = async () => {
    try {
      const params = new URLSearchParams({ nodeId, agentType });
      await fetch(`/api/agents/chat?${params}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setMessages([]);
    setNeedsClarification(false);
    setClarificationQuestions([]);
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
        tags: [...tags, agentType],
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

  const agentName = agentType === 'sql' ? 'SQL' : 'Python';
  const agentColor = agentType === 'sql' ? 'from-blue-500/80 to-cyan-500/80' : 'from-green-500/80 to-emerald-500/80';
  const agentBadgeColor = agentType === 'sql' ? 'from-blue-500/20 to-cyan-500/20 text-blue-600' : 'from-green-500/20 to-emerald-500/20 text-green-600';

  return (
    <>
      <div className="flex flex-col h-full bg-background/95 backdrop-blur-xl border rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br",
              agentBadgeColor
            )}>
              {agentType === 'sql' ? <Database className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">Agente {agentName}</h2>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>{modelName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={clearConversation} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Capability badges */}
        <div className="flex gap-1 px-3 py-1.5 border-b bg-muted/10 overflow-x-auto">
          <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
            <Search className="h-2.5 w-2.5" /> Esplora DB
          </Badge>
          <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
            <BookOpen className="h-2.5 w-2.5" /> KB
          </Badge>
          <Badge variant="outline" className="text-[9px] shrink-0 gap-1">
            {agentType === 'sql' ? <Database className="h-2.5 w-2.5" /> : <Code2 className="h-2.5 w-2.5" />}
            {agentType === 'sql' ? 'Test Query' : 'Test Code'}
          </Badge>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-to-br mb-3",
                  agentBadgeColor
                )}>
                  {agentType === 'sql' ? <Database className="h-6 w-6" /> : <Code2 className="h-6 w-6" />}
                </div>
                <p className="text-sm font-medium text-foreground">
                  Agente {agentName} pronto
                </p>
                <p className="text-xs mt-1 text-muted-foreground max-w-[250px]">
                  Esploro il DB, cerco nella KB, testo il codice e non mollo mai. Chiedimi qualsiasi cosa!
                </p>
              </div>
            )}

            {messages.map((m, i) => {
              const { text, charts } = m.role === 'assistant'
                ? parseRechartsBlocks(m.content)
                : { text: m.content, charts: [] };

              return (
                <div key={(m.timestamp || 0) + i} className={cn(
                  "flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 group",
                  m.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "flex items-center gap-2 mb-0.5",
                    m.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}>
                    {/* Go back button (reordered for user) */}
                    <button
                      onClick={() => handleGoBack(i)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all"
                      title="Torna qui (cancella successivi)"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                    <div className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                      m.role === 'user' ? "bg-primary text-primary-foreground" : `bg-gradient-to-br ${agentColor} text-white`
                    )}>
                      {m.role === 'user' ? 'U' : <Sparkles className="h-3 w-3" />}
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {m.role === 'user' ? 'Tu' : `Agente ${agentName}`}
                    </span>
                  </div>
                  <div className={cn(
                    "max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm break-all whitespace-pre-wrap",
                    m.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted/50 border rounded-tl-none"
                  )}>
                    <div className="min-w-0">
                      {m.role === 'assistant' ? (
                        <RichContent content={text} charts={charts} onApplyCode={onScriptUpdate} />
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                  {m.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-1">
                      {i > 0 && (
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
                      {(() => {
                        const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/g;
                        let match;
                        let codeToUse = null;

                        // Iterate to find the first non-json code block
                        while ((match = codeBlockRegex.exec(m.content)) !== null) {
                          const lang = match[1].toLowerCase().trim();
                          const content = match[2].trim();

                          // Check if it looks like a JSON object (starts with { and ends with })
                          const looksLikeJson = content.startsWith('{') && content.endsWith('}');

                          if (lang !== 'json' && !looksLikeJson && content.length > 5) {
                            codeToUse = content;
                            break;
                          }
                        }

                        if (codeToUse && onScriptUpdate) {
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-primary gap-1"
                              onClick={() => onScriptUpdate(codeToUse!)}
                            >
                              <CornerDownLeft className="h-3 w-3" />
                              Usa codice
                            </Button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start gap-2">
                <div className={cn("h-5 w-5 rounded-full flex items-center justify-center bg-gradient-to-br", agentColor)}>
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                </div>
                <div className="bg-muted/30 border rounded-2xl rounded-tl-none px-3 py-2">
                  <div className="text-[11px] text-muted-foreground mb-1">{loadingStatus}</div>
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            {needsClarification && clarificationQuestions.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-200 text-[12px]">
                        Ho bisogno di chiarimenti
                      </p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Per aiutarti meglio, rispondi a queste domande:
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1 mt-2">
                    {clarificationQuestions.map((question, idx) => (
                      <li key={idx} className="text-[12px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                        <span className="flex-shrink-0 font-bold">{idx + 1}.</span>
                        <span>{question}</span>
                      </li>
                    ))}
                  </ul>
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
              placeholder={`Chiedi all'agente ${agentName}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={isLoading}
              className="pr-12 h-10 rounded-xl border-muted-foreground/20 focus-visible:ring-primary shadow-inner bg-muted/5 group-focus-within:bg-background transition-all text-sm"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="absolute right-1.5 top-1 h-8 w-8 rounded-lg"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
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
