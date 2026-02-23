'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Coins,
  CheckSquare,
  Square,
  Settings2,
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
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { AgentChatMessage, AgentResponse } from '@/lib/types';
import { createKnowledgeBaseEntryAction } from '@/app/actions/knowledge-base';
import { ConsultedNodesSection } from '@/components/agents/consulted-nodes-section';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { ChartStyle, resolveChartStyle } from '@/lib/chart-style';
import { gridStrokeDasharray, lineStrokeDasharray } from '@/lib/chart-theme';
import type { BarChartStyle, LineChartStyle, AreaChartStyle, PieChartStyle } from '@/lib/chart-style';
import ChartStyleEditor from '@/components/widgets/builder/ChartStyleEditor';

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

function InlineChart({ config }: { config: any }) {
  const { theme: globalTheme } = useChartTheme();
  const [chartStyle, setChartStyle] = useState<ChartStyle | undefined>(
    config.style ? { ...config.style, type: config.type } : undefined
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const theme = useMemo(() => resolveChartStyle(globalTheme, chartStyle ?? null), [globalTheme, chartStyle]);
  const { type, data, xAxisKey, dataKeys, colors, title } = config;
  const chartColors = chartStyle?.colors || colors || theme.colors;

  if (!data || !Array.isArray(data) || data.length === 0) return null;

  // Type-specific style accessors
  const barS = chartStyle as BarChartStyle | undefined;
  const lineS = chartStyle as LineChartStyle | undefined;
  const areaS = chartStyle as AreaChartStyle | undefined;
  const pieS = chartStyle as PieChartStyle | undefined;

  const renderChart = () => {
    const gridDash = gridStrokeDasharray(theme.gridStyle);
    const tickStyle = { fontSize: theme.axisFontSize, fontFamily: theme.fontFamily };
    const tooltipStyle = { fontSize: theme.tooltipFontSize, fontFamily: theme.fontFamily, borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' };
    const legendStyle = { fontSize: theme.legendFontSize, fontFamily: theme.fontFamily };

    if (type === 'bar-chart') {
      const radius = barS?.barRadius ?? theme.barRadius;
      const stacked = barS?.stackBars;
      return (
        <BarChart data={data} barGap={barS?.barGap} barCategoryGap={barS?.barCategoryGap != null ? `${barS.barCategoryGap}%` : undefined}>
          {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridDash} stroke={theme.gridColor} />}
          <XAxis dataKey={xAxisKey} tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          {(dataKeys || []).map((key: string, i: number) => (
            <Bar key={key} dataKey={key} fill={chartColors[i % chartColors.length]} radius={[radius, radius, 0, 0]} stackId={stacked ? 'stack' : undefined} />
          ))}
        </BarChart>
      );
    }

    if (type === 'line-chart') {
      const lw = lineS?.lineWidth ?? theme.lineWidth;
      const ls = lineS?.lineStyle ?? theme.defaultLineStyle;
      const lt = lineS?.lineType ?? 'monotone';
      const showDots = lineS?.showDots ?? true;
      const dotR = lineS?.dotRadius ?? 4;
      return (
        <LineChart data={data}>
          {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridDash} stroke={theme.gridColor} />}
          <XAxis dataKey={xAxisKey} tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          {(dataKeys || []).map((key: string, i: number) => (
            <Line key={key} type={lt as any} dataKey={key} stroke={chartColors[i % chartColors.length]} strokeWidth={lw} dot={showDots ? { r: dotR } : false} connectNulls strokeDasharray={lineStrokeDasharray(ls)} />
          ))}
        </LineChart>
      );
    }

    if (type === 'area-chart') {
      const areaOp = areaS?.areaOpacity ?? theme.areaOpacity;
      const areaLt = areaS?.lineType ?? 'monotone';
      const stacked = areaS?.stackAreas;
      return (
        <AreaChart data={data}>
          {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridDash} stroke={theme.gridColor} />}
          <XAxis dataKey={xAxisKey} tick={tickStyle} />
          <YAxis tick={tickStyle} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          {(dataKeys || []).map((key: string, i: number) => (
            <Area key={key} type={areaLt as any} dataKey={key} fill={chartColors[i % chartColors.length]} stroke={chartColors[i % chartColors.length]} fillOpacity={areaOp} stackId={stacked ? 'stack' : undefined} />
          ))}
        </AreaChart>
      );
    }

    if (type === 'pie-chart') {
      const innerR = pieS?.innerRadius ?? 0;
      const outerR = pieS?.outerRadius ?? 70;
      const paddingA = pieS?.paddingAngle ?? 0;
      const showLabels = pieS?.showLabels ?? true;
      return (
        <PieChart>
          <Pie data={data} dataKey={(dataKeys || ['value'])[0]} nameKey={xAxisKey} cx="50%" cy="50%" innerRadius={innerR} outerRadius={outerR} paddingAngle={paddingA} label={showLabels ? { fontSize: 10 } : false}>
            {data.map((_: any, i: number) => (
              <Cell key={i} fill={chartColors[i % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
        </PieChart>
      );
    }

    // Fallback: bar chart
    return (
      <BarChart data={data}>
        {theme.gridStyle !== 'none' && <CartesianGrid strokeDasharray={gridDash} stroke={theme.gridColor} />}
        <XAxis dataKey={xAxisKey} tick={tickStyle} />
        <YAxis tick={tickStyle} />
        <Tooltip contentStyle={tooltipStyle} />
        {(dataKeys || []).map((key: string, i: number) => (
          <Bar key={key} dataKey={key} fill={chartColors[i % chartColors.length]} />
        ))}
      </BarChart>
    );
  };

  return (
    <>
      <div className="my-2 p-3 rounded-lg border bg-background relative group">
        {title && <p className="text-xs font-semibold mb-2 text-center">{title}</p>}
        {/* Style editor button - visible on hover */}
        <button
          onClick={() => setIsEditorOpen(true)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted border bg-background/80 backdrop-blur-sm z-10"
          title="Personalizza stile grafico"
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <ResponsiveContainer width="100%" height={200}>
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Style editor dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Personalizza Stile Grafico</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 grid grid-cols-5 gap-4 overflow-hidden">
            {/* Preview */}
            <div className="col-span-3 flex flex-col border rounded-lg p-3 bg-muted/20">
              {title && <p className="text-xs font-semibold mb-2 text-center">{title}</p>}
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  {renderChart()}
                </ResponsiveContainer>
              </div>
            </div>
            {/* Editor */}
            <div className="col-span-2 overflow-y-auto pr-1">
              <ChartStyleEditor
                chartType={type || 'bar-chart'}
                style={chartStyle}
                globalTheme={globalTheme}
                onChange={setChartStyle}
                dataKeys={dataKeys}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Collapsible code block component
function CollapsibleCode({ lang, code }: { lang: string; code: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const lineCount = code.trim().split('\n').length;

  return (
    <div className="relative my-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-1 bg-muted rounded-t-lg border border-b-0 hover:bg-muted/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1">
          <Code2 className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] uppercase font-medium text-muted-foreground">{lang}</span>
          <span className="text-[9px] text-muted-foreground/60 ml-1">({lineCount} righe)</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <pre className="bg-zinc-950 text-zinc-100 px-3 py-2 rounded-b-lg text-[11px] overflow-x-auto max-w-full whitespace-pre-wrap break-all border animate-in slide-in-from-top-1 duration-150">
          <code className="block min-w-0">{code}</code>
        </pre>
      )}
      {!isOpen && (
        <div className="bg-zinc-950 text-zinc-500 px-3 py-1.5 rounded-b-lg text-[10px] border cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => setIsOpen(true)}>
          Clicca per espandere...
        </div>
      )}
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

        // Code block - collapsed by default
        const codeMatch = part.match(/```\s*([^\n\s]*)\s*([\s\S]*?)```/i);
        if (codeMatch) {
          return <CollapsibleCode key={i} lang={codeMatch[1]} code={codeMatch[2].trim()} />;
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
  nodeQueries?: Record<string, { query: string; isPython: boolean; connectorId?: string }>;
  connectorId?: string;
  selectedDocuments?: string[];
  onScriptUpdate?: (newScript: string) => void;
  onAutoExecutePreview?: (script: string) => Promise<{ success: boolean; error?: string }>;
  onClose?: () => void;
  onGoBack?: (messageIndex: number) => void;
}

export function AgentChat({
  nodeId,
  agentType,
  script,
  tableSchema,
  inputTables,
  nodeQueries,
  connectorId,
  selectedDocuments,
  onScriptUpdate,
  onAutoExecutePreview,
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
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(-1); // -1 = auto-follow latest
  const [totalUsage, setTotalUsage] = useState<{ tokens: number; cost: number }>({ tokens: 0, cost: 0 });
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<number>>(new Set());
  const [isAutoExecuting, setIsAutoExecuting] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const MAX_AUTO_RETRIES = 3;

  // Ref to auto-scroll version timeline to active version
  const versionTimelineRef = useRef<HTMLDivElement>(null);
  const activeVersionBtnRef = useRef<HTMLButtonElement>(null);

  // Capture the initial script before any agent modifications
  const initialScriptRef = useRef<string>(script);
  useEffect(() => {
    if (messages.length === 0) {
      initialScriptRef.current = script;
    }
  }, [messages.length, script]);

  // Compute script versions from message snapshots
  const scriptVersions = useMemo(() => {
    const versions: { label: string; script: string; messageIndex: number; timestamp?: number }[] = [];
    const originalScript = initialScriptRef.current;
    versions.push({ label: 'Originale', script: originalScript, messageIndex: -1 });

    let lastScript = originalScript;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.scriptSnapshot && msg.scriptSnapshot !== lastScript) {
        versions.push({
          label: `v${versions.length}`,
          script: msg.scriptSnapshot,
          messageIndex: i,
          timestamp: msg.timestamp,
        });
        lastScript = msg.scriptSnapshot;
      }
    }
    return versions;
  }, [messages]);

  const resolvedActiveIndex = activeVersionIndex === -1
    ? scriptVersions.length - 1
    : Math.min(activeVersionIndex, scriptVersions.length - 1);

  const handleVersionSelect = useCallback((versionIndex: number) => {
    const version = scriptVersions[versionIndex];
    if (!version || !onScriptUpdate) return;
    onScriptUpdate(version.script);
    setActiveVersionIndex(versionIndex === scriptVersions.length - 1 ? -1 : versionIndex);
  }, [scriptVersions, onScriptUpdate]);

  const handleVersionPrev = useCallback(() => {
    if (resolvedActiveIndex > 0) handleVersionSelect(resolvedActiveIndex - 1);
  }, [resolvedActiveIndex, handleVersionSelect]);

  const handleVersionNext = useCallback(() => {
    if (resolvedActiveIndex < scriptVersions.length - 1) handleVersionSelect(resolvedActiveIndex + 1);
  }, [resolvedActiveIndex, scriptVersions.length, handleVersionSelect]);

  // Auto-scroll the version timeline to keep the active version visible
  useEffect(() => {
    if (activeVersionBtnRef.current && versionTimelineRef.current) {
      const btn = activeVersionBtnRef.current;
      const container = versionTimelineRef.current;
      const btnLeft = btn.offsetLeft;
      const btnWidth = btn.offsetWidth;
      const containerWidth = container.clientWidth;
      const scrollLeft = container.scrollLeft;

      // If the button is out of view, scroll to center it
      if (btnLeft < scrollLeft || btnLeft + btnWidth > scrollLeft + containerWidth) {
        container.scrollTo({
          left: btnLeft - containerWidth / 2 + btnWidth / 2,
          behavior: 'smooth',
        });
      }
    }
  }, [resolvedActiveIndex, scriptVersions.length]);

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

  // Collapsible script preview in messages
  const [expandedScripts, setExpandedScripts] = useState<Set<number>>(new Set());

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

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isAutoExecuting]);

  // Auto-execute preview and retry on errors (up to MAX_AUTO_RETRIES)
  const triggerAutoExecute = useCallback(async (scriptToExecute: string, retryAttempt: number = 0) => {
    if (!onAutoExecutePreview) return;

    setIsAutoExecuting(true);
    setAutoRetryCount(retryAttempt);

    try {
      const result = await onAutoExecutePreview(scriptToExecute);

      if (result.success) {
        setMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: retryAttempt > 0
            ? `✅ **Anteprima eseguita con successo** (dopo ${retryAttempt} correzione/i)`
            : '✅ **Anteprima eseguita con successo!**',
          timestamp: Date.now(),
        }]);
        setIsAutoExecuting(false);
        setAutoRetryCount(0);
      } else if (retryAttempt < MAX_AUTO_RETRIES) {
        // Check if this is a non-retryable configuration error (agent can't fix these)
        const nonRetryableErrors = [
          'Nessun connettore SQL configurato',
          'Connettore SQL non trovato o non configurato',
          'connettore non configurato',
          'connector not found',
          'No connector',
        ];
        const isConfigError = nonRetryableErrors.some(e =>
          result.error?.toLowerCase().includes(e.toLowerCase())
        );

        if (isConfigError) {
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `⚠️ **Errore di configurazione**: ${result.error}\n\nQuesto non e' un errore di codice — assicurati di aver selezionato un connettore SQL nel pannello del nodo prima di eseguire.`,
            timestamp: Date.now(),
          }]);
          setIsAutoExecuting(false);
          setAutoRetryCount(0);
          return;
        }

        // Execution failed - send error to agent for auto-correction
        const errorMessage = `ERRORE ESECUZIONE AUTOMATICA (tentativo ${retryAttempt + 1}/${MAX_AUTO_RETRIES}): ${result.error}\n\nCORREGGI il codice e restituisci il codice COMPLETO corretto in updatedScript. E' OBBLIGATORIO includere updatedScript nella risposta, altrimenti il sistema non puo' riprovare.`;

        setMessages(prev => [...prev, {
          role: 'user' as const,
          content: `🔄 **Auto-retry ${retryAttempt + 1}/${MAX_AUTO_RETRIES}**: ${result.error}`,
          timestamp: Date.now(),
          scriptSnapshot: scriptToExecute,
        }]);

        setIsAutoExecuting(false);
        setIsLoading(true);
        setLoadingStatus(`Correzione automatica (tentativo ${retryAttempt + 1}/${MAX_AUTO_RETRIES})...`);

        try {
          const response = await fetch('/api/agents/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId,
              agentType,
              userMessage: errorMessage,
              script: scriptToExecute,
              tableSchema,
              inputTables,
              nodeQueries,
              connectorId,
              selectedDocuments,
            }),
          });

          const data: AgentResponse = await response.json();

          if (data.success) {
            setMessages(prev => [...prev, {
              role: 'assistant' as const,
              content: data.message,
              timestamp: Date.now(),
              scriptSnapshot: data.updatedScript || scriptToExecute,
              clarificationQuestions: data.needsClarification ? data.clarificationQuestions : undefined,
              consultedNodes: data.consultedNodes,
            }]);

            if (data.usage) {
              setTotalUsage(prev => ({
                tokens: prev.tokens + (data.usage?.total_tokens || 0),
                cost: prev.cost + (data.usage?.total_cost || 0),
              }));
            }

            if (data.updatedScript && onScriptUpdate) {
              onScriptUpdate(data.updatedScript);

              if (!data.needsClarification) {
                setIsLoading(false);
                setLoadingStatus('');
                setTimeout(() => {
                  triggerAutoExecute(data.updatedScript!, retryAttempt + 1);
                }, 500);
                return;
              }
            } else if (!data.updatedScript && retryAttempt < MAX_AUTO_RETRIES) {
              // Agent responded without updatedScript - re-send insisting
              setMessages(prev => [...prev, {
                role: 'user' as const,
                content: `⚠️ **Manca updatedScript** - reinvio richiesta di correzione...`,
                timestamp: Date.now(),
              }]);

              const insistMessage = `NON hai incluso updatedScript nella risposta precedente. DEVI restituire il codice COMPLETO corretto in updatedScript. Riprova ora - correggi l'errore e includi il codice completo.`;

              const retryResponse = await fetch('/api/agents/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nodeId,
                  agentType,
                  userMessage: insistMessage,
                  script: scriptToExecute,
                  tableSchema,
                  inputTables,
                  nodeQueries,
                  connectorId,
                  selectedDocuments,
                }),
              });

              const retryData: AgentResponse = await retryResponse.json();

              if (retryData.success) {
                setMessages(prev => [...prev, {
                  role: 'assistant' as const,
                  content: retryData.message,
                  timestamp: Date.now(),
                  scriptSnapshot: retryData.updatedScript || scriptToExecute,
                  consultedNodes: retryData.consultedNodes,
                }]);

                if (retryData.updatedScript && onScriptUpdate) {
                  onScriptUpdate(retryData.updatedScript);
                  setIsLoading(false);
                  setLoadingStatus('');
                  setTimeout(() => {
                    triggerAutoExecute(retryData.updatedScript!, retryAttempt + 1);
                  }, 500);
                  return;
                }
              }
            }
          }
        } catch (agentError: any) {
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `❌ **Errore comunicazione agente:** ${agentError.message}`,
            timestamp: Date.now(),
          }]);
        } finally {
          setIsLoading(false);
          setLoadingStatus('');
          setIsAutoExecuting(false);
          setAutoRetryCount(0);
        }
      } else {
        // Max retries exhausted
        setMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: `❌ **Esecuzione fallita dopo ${MAX_AUTO_RETRIES} tentativi.** Errore: ${result.error}\n\nPuoi provare a correggere manualmente o dare istruzioni piu' specifiche.`,
          timestamp: Date.now(),
        }]);
        setIsAutoExecuting(false);
        setAutoRetryCount(0);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: `❌ **Errore inatteso:** ${error.message}`,
        timestamp: Date.now(),
      }]);
      setIsAutoExecuting(false);
      setAutoRetryCount(0);
    }
  }, [onAutoExecutePreview, nodeId, agentType, tableSchema, inputTables, connectorId, onScriptUpdate]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setLoadingStatus('Sto analizzando la tua richiesta...');
    setActiveVersionIndex(-1); // Re-enter auto-follow on new message

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
          nodeQueries,
          connectorId,
          selectedDocuments,
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
            clarificationQuestions: data.needsClarification ? data.clarificationQuestions : undefined,
            consultedNodes: data.consultedNodes,
          },
        ]);

        // Clear floating clarification state (now rendered inline in messages)
        setNeedsClarification(false);
        setClarificationQuestions([]);

        if (data.updatedScript && onScriptUpdate) {
          onScriptUpdate(data.updatedScript);

          // Auto-execute preview if callback available and no clarification needed
          if (onAutoExecutePreview && !data.needsClarification) {
            setTimeout(() => {
              triggerAutoExecute(data.updatedScript!, 0);
            }, 300);
          }
        }

        // Track usage/cost
        if (data.usage) {
          const u = data.usage;
          setTotalUsage(prev => ({
            tokens: prev.tokens + (u.total_tokens || 0),
            cost: prev.cost + (u.total_cost || 0),
          }));
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
      // Find which version this message corresponds to
      const versionIndex = scriptVersions.findIndex(v => v.messageIndex === messageIndex);
      if (versionIndex !== -1) {
        setActiveVersionIndex(versionIndex);
      } else {
        // Message didn't introduce a version change - find nearest version at or before this index
        let bestIdx = 0;
        for (let i = scriptVersions.length - 1; i >= 0; i--) {
          if (scriptVersions[i].messageIndex <= messageIndex) {
            bestIdx = i;
            break;
          }
        }
        setActiveVersionIndex(bestIdx);
      }
    }
    // Non-destructive: conversation history is preserved
  };

  const clearConversation = async () => {
    try {
      const params = new URLSearchParams({ nodeId, agentType });
      await fetch(`/api/agents/chat?${params}`, { method: 'DELETE' });
    } catch { /* ignore */ }
    setMessages([]);
    setNeedsClarification(false);
    setClarificationQuestions([]);
    setActiveVersionIndex(-1);
  };

  const toggleDeleteSelection = (versionIndex: number) => {
    // Can't delete the "Originale" version (index 0)
    if (versionIndex === 0) return;
    setSelectedForDelete(prev => {
      const next = new Set(prev);
      if (next.has(versionIndex)) next.delete(versionIndex);
      else next.add(versionIndex);
      return next;
    });
  };

  const handleDeleteVersions = async () => {
    if (selectedForDelete.size === 0) return;

    // Get the messageIndex for each selected version
    const messageIndicesToDelete = Array.from(selectedForDelete)
      .map(vIdx => scriptVersions[vIdx]?.messageIndex)
      .filter((idx): idx is number => idx !== undefined && idx >= 0);

    if (messageIndicesToDelete.length === 0) return;

    try {
      const response = await fetch('/api/agents/chat', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          agentType,
          deleteVersionIndices: messageIndicesToDelete,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessages(data.messages || []);
        setActiveVersionIndex(-1);
        toast({
          title: "Versioni eliminate",
          description: `${selectedForDelete.size} versione/i eliminate con successo.`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Impossibile eliminare le versioni.",
        variant: "destructive",
      });
    }

    setSelectedForDelete(new Set());
    setDeleteMode(false);
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
                {totalUsage.tokens > 0 && (
                  <TooltipProvider delayDuration={200}>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-medium cursor-default">
                          <Coins className="h-2.5 w-2.5" />
                          {totalUsage.cost > 0
                            ? `$${totalUsage.cost.toFixed(4)}`
                            : `${(totalUsage.tokens / 1000).toFixed(1)}k tok`
                          }
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-[10px]">
                        <div className="space-y-0.5">
                          <div>Token totali: {totalUsage.tokens.toLocaleString()}</div>
                          {totalUsage.cost > 0 && <div>Costo sessione: ${totalUsage.cost.toFixed(6)}</div>}
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                  </TooltipProvider>
                )}
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

        {/* Script Version Timeline */}
        {scriptVersions.length >= 2 && (
          <div className="flex flex-col border-b bg-muted/5">
            <div className="flex items-center gap-1 px-3 py-1">
              <History className="h-3 w-3 text-muted-foreground shrink-0" />
              <button
                onClick={handleVersionPrev}
                disabled={resolvedActiveIndex === 0 || deleteMode}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3 w-3 text-muted-foreground" />
              </button>
              <div
                ref={versionTimelineRef}
                className="flex gap-0.5 overflow-x-auto scroll-smooth"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--muted-foreground) / 0.3) transparent' }}
              >
                <TooltipProvider delayDuration={300}>
                  {scriptVersions.map((version, idx) => (
                    <UiTooltip key={idx}>
                      <TooltipTrigger asChild>
                        <button
                          ref={resolvedActiveIndex === idx ? activeVersionBtnRef : undefined}
                          onClick={() => {
                            if (deleteMode) {
                              toggleDeleteSelection(idx);
                            } else {
                              handleVersionSelect(idx);
                            }
                          }}
                          className={cn(
                            "px-1.5 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap transition-all flex items-center gap-0.5",
                            "hover:bg-primary/10",
                            deleteMode && selectedForDelete.has(idx)
                              ? "bg-destructive/20 text-destructive ring-1 ring-destructive/40"
                              : resolvedActiveIndex === idx
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-muted/50 text-muted-foreground"
                          )}
                        >
                          {deleteMode && idx > 0 && (
                            selectedForDelete.has(idx)
                              ? <CheckSquare className="h-2.5 w-2.5" />
                              : <Square className="h-2.5 w-2.5" />
                          )}
                          {version.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-[10px]">
                        {version.messageIndex === -1
                          ? "Script originale prima delle modifiche"
                          : `Versione del ${version.timestamp ? new Date(version.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}`
                        }
                      </TooltipContent>
                    </UiTooltip>
                  ))}
                </TooltipProvider>
              </div>
              <button
                onClick={handleVersionNext}
                disabled={resolvedActiveIndex === scriptVersions.length - 1 || deleteMode}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
              <span className="text-[9px] text-muted-foreground ml-1 shrink-0">
                {resolvedActiveIndex + 1}/{scriptVersions.length}
              </span>
              {/* Delete mode toggle */}
              {scriptVersions.length > 1 && (
                <button
                  onClick={() => {
                    setDeleteMode(!deleteMode);
                    setSelectedForDelete(new Set());
                  }}
                  className={cn(
                    "p-0.5 rounded ml-0.5 shrink-0 transition-colors",
                    deleteMode
                      ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  )}
                  title={deleteMode ? "Annulla eliminazione" : "Elimina versioni"}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Delete confirmation bar */}
            {deleteMode && (
              <div className="flex items-center gap-2 px-3 py-1 bg-destructive/5 border-t animate-in slide-in-from-top-1 duration-150">
                <span className="text-[10px] text-destructive">
                  {selectedForDelete.size > 0
                    ? `${selectedForDelete.size} versione/i selezionate`
                    : "Seleziona le versioni da eliminare"
                  }
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px]"
                    onClick={() => { setDeleteMode(false); setSelectedForDelete(new Set()); }}
                  >
                    Annulla
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-5 px-2 text-[10px]"
                    disabled={selectedForDelete.size === 0}
                    onClick={handleDeleteVersions}
                  >
                    Elimina ({selectedForDelete.size})
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

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
                      title="Ripristina questa versione dello script"
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
                    {(() => {
                      const vIdx = scriptVersions.findIndex(v => v.messageIndex === i);
                      if (vIdx > 0) {
                        return (
                          <span className={cn(
                            "text-[8px] font-semibold px-1.5 py-0.5 rounded-full",
                            resolvedActiveIndex === vIdx
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {scriptVersions[vIdx].label}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className={cn(
                    "max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm break-all whitespace-pre-wrap",
                    m.role === 'user'
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted/50 border rounded-tl-none"
                  )}>
                    <div className="min-w-0">
                      {/* Inline clarification questions - preserved in chat history */}
                      {m.role === 'assistant' && m.clarificationQuestions && m.clarificationQuestions.length > 0 && (
                        <div className="mb-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                          <div className="flex items-start gap-1.5 mb-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="font-medium text-amber-900 dark:text-amber-200 text-[11px]">
                              Ho bisogno di chiarimenti:
                            </p>
                          </div>
                          <ul className="space-y-0.5 ml-5">
                            {m.clarificationQuestions.map((q, idx) => (
                              <li key={idx} className="text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                                <span className="flex-shrink-0 font-bold">{idx + 1}.</span>
                                <span>{q}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Consulted nodes - collapsible */}
                      {m.role === 'assistant' && m.consultedNodes && m.consultedNodes.length > 0 && (
                        <ConsultedNodesSection nodes={m.consultedNodes} />
                      )}
                      {m.role === 'assistant' ? (
                        <RichContent content={text} charts={charts} onApplyCode={onScriptUpdate} />
                      ) : (
                        m.content
                      )}
                      {/* Collapsible script preview - same style as CollapsibleCode */}
                      {m.role === 'assistant' && m.scriptSnapshot && (() => {
                        const vIdx = scriptVersions.findIndex(v => v.messageIndex === i);
                        if (vIdx <= 0) return null;
                        const isExpanded = expandedScripts.has(i);
                        const scriptLang = agentType === 'sql' ? 'SQL' : 'PYTHON';
                        const lineCount = m.scriptSnapshot.trim().split('\n').length;
                        return (
                          <div className="relative my-2">
                            <button
                              onClick={() => {
                                setExpandedScripts(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                });
                              }}
                              className="flex items-center justify-between w-full px-3 py-1 bg-muted rounded-t-lg border border-b-0 hover:bg-muted/80 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-1">
                                <Code2 className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] uppercase font-medium text-muted-foreground">{scriptLang}</span>
                                <span className="text-[9px] text-muted-foreground/60 ml-1">({lineCount} righe)</span>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              )}
                            </button>
                            {isExpanded && (
                              <pre className="bg-zinc-950 text-zinc-100 px-3 py-2 rounded-b-lg text-[11px] overflow-x-auto max-w-full whitespace-pre-wrap break-all border animate-in slide-in-from-top-1 duration-150">
                                <code className="block min-w-0">{m.scriptSnapshot}</code>
                              </pre>
                            )}
                            {!isExpanded && (
                              <div className="bg-zinc-950 text-zinc-500 px-3 py-1.5 rounded-b-lg text-[10px] border cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => {
                                setExpandedScripts(prev => {
                                  const next = new Set(prev);
                                  next.add(i);
                                  return next;
                                });
                              }}>
                                Clicca per espandere...
                              </div>
                            )}
                          </div>
                        );
                      })()}
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

            {isAutoExecuting && (
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-2xl rounded-tl-none px-3 py-2">
                  <div className="text-[11px] text-purple-700 dark:text-purple-300">
                    Esecuzione anteprima automatica...
                    {autoRetryCount > 0 && ` (tentativo ${autoRetryCount + 1}/${MAX_AUTO_RETRIES})`}
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
