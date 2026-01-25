

// Updated: 2026-01-18 15:35 - Inline handler fix
'use client';

import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Trash2, Eye, Video, Image as ImageIcon, Link as LinkIcon, Zap, Pencil, Check, X, Database, Bot, GitBranch, Flag, Code, Table, Variable, BarChart3, Play, Download, LineChart, Mail, Send, Paperclip, ArrowDownToLine, Minimize2, Maximize2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf, DecisionNode, MediaItem, LinkItem, TriggerItem, EmailActionConfig } from '@/lib/types';
import { Input } from '../ui/input';
import _ from 'lodash';
import { useToast } from '@/hooks/use-toast';
import { executeTriggerAction, generateSqlAction, executeSqlPreviewAction, getConnectorsAction, fetchTableSchemaAction, generatePythonAction, executePythonPreviewAction, exportTableToSqlAction, fetchTableDataAction } from '@/app/actions';
import { sendEmailWithConnectorAction, sendTestEmailWithDataAction } from '@/app/actions/connectors';
import { uploadFile } from '@/lib/storage-client';
import Image from 'next/image';
import { ScrollArea } from '../ui/scroll-area';
import { DataTable } from '../ui/data-table';
import { EmailBodyEditor, EmailBodyEditorRef } from './email-body-editor';
import WidgetEditor from '../widgets/builder/WidgetEditor';
import { WidgetConfig } from '@/lib/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useOpenRouterSettings } from '@/hooks/use-openrouter';

// Memoized input component to prevent re-renders when typing
const MemoizedChatInput = memo(function MemoizedChatInput({
  placeholder,
  onSubmit,
  disabled,
  buttonText,
  buttonClassName
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  disabled: boolean;
  buttonText: string;
  buttonClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputRef.current?.value) {
        onSubmit(inputRef.current.value);
        inputRef.current.value = '';
      }
    }
  }, [onSubmit]);

  const handleClick = useCallback(() => {
    if (inputRef.current?.value) {
      onSubmit(inputRef.current.value);
      inputRef.current.value = '';
    }
  }, [onSubmit]);

  return (
    <div className="p-2 border-t bg-background flex gap-2">
      <input
        ref={inputRef}
        placeholder={placeholder}
        className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent h-9 px-3 text-sm outline-none"
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Button
        size="sm"
        className={`gap-2 rounded-lg ${buttonClassName || ''}`}
        disabled={disabled}
        onClick={handleClick}
      >
        {buttonText}
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
});

const CollapsibleSection = ({
  title,
  count = 0,
  storageKey,
  children,
  icon: Icon
}: {
  title: string,
  count?: number,
  storageKey: string,
  children: React.ReactNode,
  icon?: any
}) => {
  // Default to open if has items, closed if empty - UNLESS a user preference is saved
  const [isOpen, setIsOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const loadState = () => {
      const savedState = localStorage.getItem(storageKey);
      if (savedState !== null) {
        setIsOpen(savedState === 'true');
      } else {
        // Default rule: open if has items, closed otherwise
        setIsOpen(count > 0);
      }
    };

    loadState();
    setHasLoaded(true);

    // Listen for storage events (from collapse/expand all buttons)
    const handleStorage = () => loadState();
    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey, count]);

  const toggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    localStorage.setItem(storageKey, String(newState));
  };

  if (!hasLoaded) return null; // Avoid hydration mismatch or flash

  return (
    <Collapsible open={isOpen} onOpenChange={toggle} className="border border-purple-500/40 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full flex items-center justify-between p-3 h-auto hover:bg-muted/50 rounded-none">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium text-sm">{title}</span>
            {count > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-semibold">
                {count}
              </span>
            )}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-0 border-t border-border/50 bg-muted/10">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface EditNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string, newNodeData: any) => void;
  initialNode: DecisionNode | DecisionLeaf | { question: string } | { option: string };
  nodeType: 'question' | 'decision';
  variableId?: string;
  nodePath: string;
  treeId: string;
  isSaving: boolean;
  availableInputTables?: { name: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[] }[];
  availableParentMedia?: MediaItem[];
  availableParentLinks?: LinkItem[];
  availableParentTriggers?: TriggerItem[];
}

type FileToUpload = {
  file: File;
  name: string;
  type: 'image' | 'video';
}

export default function EditNodeDialog({
  isOpen,
  onClose,
  onSave,
  initialNode,
  nodeType,
  variableId,
  nodePath,
  treeId,
  isSaving,
  availableInputTables = [],
  availableParentMedia = [],
  availableParentLinks = [],
  availableParentTriggers = []
}: EditNodeDialogProps) {
  const { toast } = useToast();
  const { apiKey: openRouterApiKey, model: openRouterModel } = useOpenRouterSettings();

  // Local state for node type switching (Question <-> Decision)
  const [currentNodeType, setCurrentNodeType] = useState<'question' | 'decision'>(nodeType);

  // Debug: log whenever currentNodeType changes
  React.useEffect(() => {
    console.log('🔵 [RENDER] currentNodeType changed to:', currentNodeType);
  }, [currentNodeType]);
  const [pendingTypeChange, setPendingTypeChange] = useState<'question' | 'decision' | null>(null);

  // Helper to request type change with confirmation
  const requestTypeChange = (targetType: 'question' | 'decision') => {
    if (currentNodeType === targetType) return;

    // Always ask for confirmation as requested by user ("chiedimi conferma prima di procedere")
    // Use pendingTypeChange to trigger the dialog
    setPendingTypeChange(targetType);
  };

  const confirmTypeChange = () => {
    console.log('[CONFIRM TYPE CHANGE] Called with pendingTypeChange:', pendingTypeChange);
    console.log('[CONFIRM TYPE CHANGE] Current decisionText:', decisionText);
    console.log('[CONFIRM TYPE CHANGE] Current questionText:', questionText);

    if (pendingTypeChange) {
      // Copy text between fields when switching types
      if (pendingTypeChange === 'question' && decisionText) {
        // Converting from Decision to Question: copy decision text to question
        console.log('[CONFIRM TYPE CHANGE] Copying decisionText to questionText:', decisionText);
        setQuestionText(decisionText);
      } else if (pendingTypeChange === 'decision' && questionText) {
        // Converting from Question to Decision: copy question text to decision
        console.log('[CONFIRM TYPE CHANGE] Copying questionText to decisionText:', questionText);
        setDecisionText(questionText);
      }
      setCurrentNodeType(pendingTypeChange);
      setPendingTypeChange(null);
    }
  };

  const [questionText, setQuestionText] = useState('');
  const [optionText, setOptionText] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [filesToUpload, setFilesToUpload] = useState<FileToUpload[]>([]);
  const [triggers, setTriggers] = useState<TriggerItem[]>([]);
  const [newTriggerName, setNewTriggerName] = useState('');
  const [newTriggerPath, setNewTriggerPath] = useState('');
  const [internalSaving, setInternalSaving] = useState(false);
  const [previewingMedia, setPreviewingMedia] = useState<MediaItem | { url: string, type: 'image' | 'video' } | null>(null);

  // SQL State
  const [sqlQuery, setSqlQuery] = useState('');
  const [sqlConnectorId, setSqlConnectorId] = useState<string>('');
  const [sqlResultName, setSqlResultName] = useState('');
  const [selectedPipelines, setSelectedPipelines] = useState<string[]>([]);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [sqlConnectors, setSqlConnectors] = useState<{ id: string, name: string }[]>([]);
  const [dataConnectors, setDataConnectors] = useState<{ id: string, name: string }[]>([]);
  const [sqlPreviewData, setSqlPreviewData] = useState<any[] | null>(null);
  const [sqlChatHistory, setSqlChatHistory] = useState<{ role: 'user' | 'assistant', content: string, timestamp?: number }[]>([]);

  // Python State
  const [pythonCode, setPythonCode] = useState('');
  const [pythonOutputType, setPythonOutputType] = useState<'table' | 'variable' | 'chart'>('table');
  const [pythonResultName, setPythonResultName] = useState('');
  const [pythonAgentStatus, setPythonAgentStatus] = useState<string | null>(null);
  const [pythonProgressStep, setPythonProgressStep] = useState<number>(0); // 0=none, 1=dati, 2=python, 3=rendering
  const [hasPythonCodeChanged, setHasPythonCodeChanged] = useState(false);
  const [pythonPreviewResult, setPythonPreviewResult] = useState<{
    type: 'table' | 'variable' | 'chart';
    data?: any[];
    columns?: string[];
    variables?: Record<string, any>;
    chartBase64?: string;
    chartHtml?: string;
    debugLogs?: string[];
  } | null>(null);
  const [pythonConnectorId, setPythonConnectorId] = useState<string>('');
  const [pythonSelectedPipelines, setPythonSelectedPipelines] = useState<string[]>([]);
  const [pythonDebugLogs, setPythonDebugLogs] = useState<string[]>([]);
  const [pythonChatHistory, setPythonChatHistory] = useState<{ role: 'user' | 'assistant', content: string, timestamp?: number, preview?: { type: 'table' | 'variable' | 'chart', data?: any[], columns?: string[], variables?: Record<string, any>, chartBase64?: string, chartHtml?: string } }[]>([]);

  // SQL Export State
  const [sqlExportEnabled, setSqlExportEnabled] = useState(true);
  const [sqlExportSourceTables, setSqlExportSourceTables] = useState<string[]>([]);
  const [sqlExportTargetConnectorId, setSqlExportTargetConnectorId] = useState<string>('');
  const [sqlExportTargetTableName, setSqlExportTargetTableName] = useState<string>('');
  const [sqlExportStatus, setSqlExportStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [sqlExportError, setSqlExportError] = useState<string | null>(null);
  const [sqlExportRowCount, setSqlExportRowCount] = useState<number | null>(null);

  // Email Action State
  const defaultEmailConfig: EmailActionConfig = {
    enabled: true,
    connectorId: '',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: {
      tablesInBody: [],
      tablesAsExcel: [],
      pythonOutputsInBody: [],
      pythonOutputsAsAttachment: [],
      mediaAsAttachment: [],
    }
  };
  const [emailConfig, setEmailConfig] = useState<EmailActionConfig>(defaultEmailConfig);
  const [smtpConnectors, setSmtpConnectors] = useState<{ id: string, name: string }[]>([]);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  // Safe accessors for email attachments (prevent undefined errors)
  const safeEmailAttachments = {
    tablesInBody: emailConfig.attachments?.tablesInBody || [],
    tablesAsExcel: emailConfig.attachments?.tablesAsExcel || [],
    pythonOutputsInBody: emailConfig.attachments?.pythonOutputsInBody || [],
    pythonOutputsAsAttachment: emailConfig.attachments?.pythonOutputsAsAttachment || [],
    mediaAsAttachment: emailConfig.attachments?.mediaAsAttachment || [],
  };

  // Widget Builder State
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig | undefined>(undefined);



  const isExecutingRef = useRef(false);

  // State for inline editing links
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  const editorRef = useRef<EmailBodyEditorRef>(null);

  // State for inline editing triggers
  const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<TriggerItem | null>(null);

  // State for inline editing media names
  const [editingMediaName, setEditingMediaName] = useState<{ index: number, type: 'existing' | 'new', name: string } | null>(null);


  const componentIsSaving = isSaving || internalSaving;

  // Track if we've already done initial pipeline restoration to prevent re-running
  const hasRestoredPipeline = useRef(false);

  // Reset the ref when dialog closes
  // Track initialization to prevent overwriting state on re-renders
  const hasInitialized = useRef(false);

  // Reset the ref when dialog closes
  useEffect(() => {
    if (!isOpen) {
      hasRestoredPipeline.current = false;
      hasInitialized.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !hasInitialized.current) {
      hasInitialized.current = true; // Mark as initialized

      setCurrentNodeType(nodeType); // Sync prop to state on open

      const node = initialNode as DecisionNode; // Cast for simplicity, check properties
      if (nodeType === 'question' && 'question' in node) {
        setQuestionText(node.question || '');
      } else if (nodeType === 'question' && 'option' in node) {
        setOptionText((node as any).option);
      } else if (nodeType === 'decision' && 'decision' in node) {
        setDecisionText(node.decision || '');
      }

      const nodeMedia = ('media' in node && Array.isArray(node.media)) ? node.media : [];
      setMedia(nodeMedia?.map(m => ({ ...m, name: m.name || m.url.split('/').pop()?.split('?')[0] || "File" })) || []);


      // Handle legacy string links and convert them to the new object format
      const normalizedLinks = ('links' in node && Array.isArray(node.links))
        ? node.links?.map(link => {
          if (typeof link === 'string') {
            return { name: link, url: link }; // Legacy: use URL as name
          }
          return link;
        }).filter((l): l is LinkItem => l && (l as any).url)
        : [];
      setLinks(normalizedLinks);

      // Handle legacy string triggers and convert them
      const normalizedTriggers = ('triggers' in node && Array.isArray(node.triggers))
        ? node.triggers?.map(trigger => {
          if (typeof trigger === 'string') {
            return { name: trigger, path: trigger };
          }
          return trigger;
        }).filter((t): t is TriggerItem => t && (t as any).path)
        : [];
      setTriggers(normalizedTriggers);

      setFilesToUpload([]);
      setNewLinkName('');
      setNewLinkUrl('');
      setNewTriggerName('');
      setNewTriggerPath('');
      setPreviewingMedia(null);
      setEditingLink(null);
      setEditingTriggerIndex(null);
      setEditingTrigger(null);
      setEditingMediaName(null);

      // Load SQL Query
      const query = node.sqlQuery || '';
      setSqlQuery(query);
      setSqlPreviewData(null);
      const connId = node.sqlConnectorId || '';
      setSqlConnectorId(connId);

      // Debug: Log all relevant data
      console.log('[EDIT-DIALOG] Loading node SQL data:', {
        query,
        connId,
        sqlResultName: node.sqlResultName,
        sqlChatHistory: node.sqlChatHistory,
        availableTablesCount: availableInputTables?.length || 0,
        availableTables: availableInputTables?.map(t => t.name) || [],
        hasRestoredPipeline: hasRestoredPipeline.current
      });

      // Also restore pipeline selection if needed (this logic is safe to run inside the initialization block)
      if (availableInputTables && availableInputTables.length >= 0) {
        if ('selectedPipelines' in node && Array.isArray((node as any).selectedPipelines)) {
          setSelectedPipelines((node as any).selectedPipelines);
        } else if (query && availableInputTables.length > 0) {
          // Fallback: Try to restore pipeline selection visual state from query regex
          const foundPipelines: string[] = [];

          // scan query for table names
          availableInputTables.forEach(t => {
            // Simple check: does the query contain the table name?
            // We use a regex to ensure whole word match to avoid partial matches
            const regex = new RegExp(`\\b${t.name}\\b`, 'i');
            if (regex.test(query)) {
              foundPipelines.push(t.name);

              // If we found a pipeline table and no connector is set, set it from the first one found
              if (t.connectorId && !connId) {
                setSqlConnectorId(t.connectorId);
              }
            }
          });

          if (foundPipelines.length > 0) {
            setSelectedPipelines(foundPipelines);
            console.log('[EDIT-DIALOG] Restored pipelines from query:', foundPipelines);
          }
        }
      }

      if (node && 'sqlResultName' in node) {
        setSqlResultName(node.sqlResultName || '');
      } else {
        setSqlResultName('');
      }
      setSqlChatHistory((initialNode as any).sqlChatHistory || []);


      // Load Python Script Data
      setPythonCode((node as any).pythonCode || '');
      setPythonOutputType((node as any).pythonOutputType || 'table');
      setPythonResultName((node as any).pythonResultName || '');
      setPythonConnectorId((node as any).pythonConnectorId || '');
      setPythonSelectedPipelines((node as any).pythonSelectedPipelines || []);
      setPythonChatHistory((node as any).pythonChatHistory || []);
      setPythonPreviewResult(null);

      // Load Email Action Config with safe defaults merge
      if ((node as any).emailAction) {
        const loadedConfig = (node as any).emailAction;
        // Merge with defaults to ensure all properties exist
        setEmailConfig({
          ...defaultEmailConfig,
          ...loadedConfig,
          attachments: {
            ...defaultEmailConfig.attachments,
            ...(loadedConfig.attachments || {}),
          }
        });
      } else {
        setEmailConfig(defaultEmailConfig);
      }

      // Load SQL Export Config
      if ((node as any).sqlExportAction) {
        const loadedSqlConfig = (node as any).sqlExportAction;
        setSqlExportSourceTables(loadedSqlConfig.sourceTables || []);
        setSqlExportTargetConnectorId(loadedSqlConfig.targetConnectorId || '');
        setSqlExportTargetTableName(loadedSqlConfig.targetTableName || '');
      } else {
        setSqlExportSourceTables([]);
        setSqlExportTargetConnectorId('');
        setSqlExportTargetTableName('');
      }

      // Load Widget Config
      // Load Widget Config
      if ('widgetConfig' in node && node.widgetConfig) {
        setWidgetConfig(node.widgetConfig);
        if (node.widgetConfig.data && node.widgetConfig.data.length > 0) {
          // Auto-load sealed data based on context (SQL or Python)
          // We infer type from widgetConfig itself or node type if possible, 
          // but generic storage is enough to hydrate the preview vars
          if (node.pythonCode) {
            // Must be python data
            setPythonPreviewResult({
              type: node.pythonOutputType || 'table',
              data: node.widgetConfig.data
            });
            // Also set progress to show results
            setPythonProgressStep(3);
          } else if (node.sqlQuery) {
            setSqlPreviewData(node.widgetConfig.data);
          }
        }
      } else {
        setWidgetConfig(undefined);
      }

    }
  }, [isOpen, initialNode, nodeType, availableInputTables]);

  // Load Connectors
  useEffect(() => {
    if (isOpen) {
      const loadConnectors = async () => {
        const res = await getConnectorsAction();
        if (res.data) {
          const sqls = res.data.filter((c: any) => c.type === 'SQL').map((c: any) => ({ id: c.id, name: c.name }));
          setSqlConnectors(sqls);

          // Data Connectors for Python (SQL + HubSpot + etc) - exclude SMTP
          const dataConns = res.data.filter((c: any) => c.type !== 'SMTP').map((c: any) => ({ id: c.id, name: c.name }));
          setDataConnectors(dataConns);

          const smtps = res.data.filter((c: any) => c.type === 'SMTP').map((c: any) => ({ id: c.id, name: c.name }));
          setSmtpConnectors(smtps);
        }
      };
      loadConnectors();
    }
  }, [isOpen]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: FileToUpload[] = Array.from(files).map(file => {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          variant: 'destructive',
          title: 'File Troppo Grande',
          description: `Il file ${file.name} supera il limite di 10MB.`,
        });
        return null;
      }
      const type = file.type.startsWith('video') ? 'video' : 'image';
      return { file, type, name: file.name };
    }).filter((f): f is FileToUpload => f !== null);

    setFilesToUpload(prev => [...prev, ...newFiles]);
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  };

  const handleRemoveExistingMedia = (index: number) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  }

  const [isWidgetRefreshing, setIsWidgetRefreshing] = useState(false);

  const handleRefreshWidgetData = async (sourceType: 'current-sql' | 'current-python' | 'parent-table', sourceId: string): Promise<any[]> => {
    setIsWidgetRefreshing(true);
    try {
      if (sourceType === 'current-sql') {
        if (!sqlQuery) throw new Error("Nessuna query SQL definita");

        // Execute SQL with full dependencies from selected pipelines
        const pipelineDeps = selectedPipelines.map(pName => {
          const dep = availableInputTables?.find(t => t.name === pName);
          if (!dep) return null;
          return {
            tableName: dep.name,
            query: dep.sqlQuery,
            connectorId: dep.connectorId,
            isPython: dep.isPython,
            pythonCode: dep.pythonCode,
            pipelineDependencies: dep.pipelineDependencies
          };
        }).filter(Boolean);

        const res = await executeSqlPreviewAction(
          sqlQuery,
          sqlConnectorId,
          pipelineDeps as any
        );

        if (res.error) throw new Error(res.error || "Errore esecuzione SQL");

        // Update main SQL preview state too to keep sync
        if (res.data) setSqlPreviewData(res.data);
        return res.data || [];

      } else if (sourceType === 'current-python') {
        if (!pythonCode) throw new Error("Nessun codice Python definito");

        // Build full dependency chain including SQL result and parent tables
        const pipelineDeps: any[] = [];

        // Add SQL result if selected
        if (pythonSelectedPipelines.includes('Risultato SQL') || pythonSelectedPipelines.includes(sqlResultName)) {
          if (sqlPreviewData) {
            pipelineDeps.push({
              tableName: sqlResultName || 'Risultato SQL',
              data: sqlPreviewData,
              query: sqlQuery,
              connectorId: sqlConnectorId
            });
          } else if (sqlQuery) {
            // Need to execute SQL first to get data
            const sqlRes = await executeSqlPreviewAction(
              sqlQuery,
              sqlConnectorId,
              selectedPipelines.map(pName => {
                const dep = availableInputTables?.find(t => t.name === pName);
                if (!dep) return null;
                return {
                  tableName: dep.name,
                  query: dep.sqlQuery,
                  connectorId: dep.connectorId,
                  isPython: dep.isPython,
                  pythonCode: dep.pythonCode,
                  pipelineDependencies: dep.pipelineDependencies
                };
              }).filter(Boolean) as any
            );

            if (sqlRes.data) {
              setSqlPreviewData(sqlRes.data);
              pipelineDeps.push({
                tableName: sqlResultName || 'Risultato SQL',
                data: sqlRes.data,
                query: sqlQuery,
                connectorId: sqlConnectorId
              });
            }
          }
        }

        // Add other selected parent tables
        pythonSelectedPipelines.forEach(pName => {
          if (pName === 'Risultato SQL' || pName === sqlResultName) return; // Already added above
          const dep = availableInputTables?.find(t => t.name === pName);
          if (dep) {
            pipelineDeps.push({
              tableName: dep.name,
              query: dep.sqlQuery,
              connectorId: dep.connectorId,
              isPython: dep.isPython,
              pythonCode: dep.pythonCode,
              pipelineDependencies: dep.pipelineDependencies
            });
          }
        });

        // Execute Python with full dependency chain
        const res = await executePythonPreviewAction(
          pythonCode,
          pythonOutputType,
          {}, // Empty input data, will fetch from dependencies
          pipelineDeps,
          pythonConnectorId
        );

        if (!res.success) throw new Error(res.error || "Errore esecuzione Python");

        // Update main state
        if (res.data) {
          setPythonPreviewResult({
            type: pythonOutputType,
            data: res.data,
            columns: res.columns,
            variables: res.variables,
            chartBase64: res.chartBase64,
            chartHtml: res.chartHtml,
            debugLogs: res.debugLogs
          });
        }
        return res.data || [];

      } else if (sourceType === 'parent-table') {
        // Fetch parent table data
        const res = await fetchTableDataAction(sourceId); // sourceId is tableName
        if (res.error) throw new Error(res.error || "Errore recupero tabella");
        return res.data || [];
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Errore Aggiornamento Dati",
        description: e.message
      });
      return [];
    } finally {
      setIsWidgetRefreshing(false);
    }
    return [];
  };

  // Helper to build dependencies payload (duplicate from handlePythonSubmit logic basically)
  const buildPipelineDependenciesForExecution = (selected: string[]) => {
    const deps: any[] = [];
    // Add SQL result if present and selected
    if (selected.includes('Risultato SQL') && sqlPreviewData) {
      deps.push({
        tableName: sqlResultName || 'Risultato SQL',
        data: sqlPreviewData, // We pass data if we have it? No, executePythonPreviewAction takes dependencies mainly for resolution
        // Wait, server action might need to resolve them from DB if not passed.
        // Actually executePythonPreviewAction signature: (code, outputType, connectorId, dependencyNames, parentOutputsJson?)
        // If we verify signature: executePythonPreviewAction(code, type, connId, selectedPipelines, parentOutputsJson)
        // Check actions.ts signature.
      });
    }
    // ... This logic is complex to replicate perfect.
    // For this iteration, let's simplify: if current-python refresh is requested, we might just warn "Usa Esegui" or try best effort. 
    // Or even better: we rely on the main "Esegui" for python and just update the widget if data changes.
    return []; // Placeholder
  };


  const handleRemoveNewFile = (index: number) => {
    setFilesToUpload(prev => prev.filter((_, i) => i !== index));
  }

  const handleAddLink = () => {
    if (newLinkName.trim() && newLinkUrl.trim()) {
      try {
        // Basic URL validation
        new URL(newLinkUrl);
        setLinks([...links, { name: newLinkName.trim(), url: newLinkUrl.trim() }]);
        setNewLinkName('');
        setNewLinkUrl('');
      } catch (_) {
        toast({
          variant: 'destructive',
          title: 'Link non valido',
          description: 'Per favore, inserisci un URL valido (es. https://...).',
        });
      }
    }
  };

  const handleRemoveLink = (index: number) => {
    setLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTrigger = () => {
    if (newTriggerName.trim() && newTriggerPath.trim() && !triggers.some(t => typeof t === 'object' && t.name === newTriggerName.trim())) {
      setTriggers([...triggers, { name: newTriggerName.trim(), path: newTriggerPath.trim() }]);
      setNewTriggerName('');
      setNewTriggerPath('');
    }
  };

  const handleRemoveTrigger = (index: number) => {
    setTriggers(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartEditLink = (index: number) => {
    setEditingLinkIndex(index);
    const linkToEdit = links[index];
    setEditingLink(_.cloneDeep(linkToEdit));
  };

  const handleCancelEditLink = () => {
    setEditingLinkIndex(null);
    setEditingLink(null);
  };

  const handleSaveEditLink = () => {
    if (editingLinkIndex !== null && editingLink) {
      try {
        new URL(editingLink.url); // Validate URL
        const newLinks = [...links];
        newLinks[editingLinkIndex] = editingLink;
        setLinks(newLinks);
        handleCancelEditLink();
      } catch (_) {
        toast({
          variant: 'destructive',
          title: 'Link non valido',
          description: 'Per favore, inserisci un URL valido.',
        });
      }
    }
  };

  const handleStartEditTrigger = (index: number) => {
    setEditingTriggerIndex(index);
    const triggerToEdit = triggers[index];
    setEditingTrigger(_.cloneDeep(triggerToEdit));
  };

  const handleCancelEditTrigger = () => {
    setEditingTriggerIndex(null);
    setEditingTrigger(null);
  };

  const handleSaveEditTrigger = () => {
    if (editingTriggerIndex !== null && editingTrigger) {
      if (editingTrigger.name.trim() && editingTrigger.path.trim()) {
        const newTriggers = [...triggers];
        newTriggers[editingTriggerIndex] = editingTrigger;
        setTriggers(newTriggers);
        handleCancelEditTrigger();
      } else {
        toast({
          variant: 'destructive',
          title: 'Dati trigger non validi',
          description: 'Sia il nome che il path del trigger sono obbligatori.',
        });
      }
    }
  };

  const handleExecuteTrigger = async (trigger: TriggerItem) => {
    setInternalSaving(true);
    const result = await executeTriggerAction(treeId, (initialNode as any).id, trigger);
    if (result.success) {
      toast({
        title: 'Trigger Eseguito',
        description: result.message,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Esecuzione Trigger Fallita',
        description: result.message,
      });
    }
    setInternalSaving(false);
  };

  const handleSaveMediaName = () => {
    if (!editingMediaName) return;

    if (editingMediaName.type === 'existing') {
      const newMedia = [...media];
      newMedia[editingMediaName.index].name = editingMediaName.name;
      setMedia(newMedia);
    } else { // 'new'
      const newFiles = [...filesToUpload];
      newFiles[editingMediaName.index].name = editingMediaName.name;
      setFilesToUpload(newFiles);
    }
    setEditingMediaName(null);
  };

  // Memoized handler for Python chat submissions to prevent re-renders
  const handlePythonSubmit = useCallback((userPrompt: string) => {
    const apiKey = openRouterApiKey || '';
    const model = openRouterModel || 'google/gemini-2.0-flash-001';

    if (!apiKey) {
      toast({ variant: 'destructive', title: "Configurazione Mancante", description: "Imposta la chiave API nelle Impostazioni." });
      return;
    }

    const newHistory = [...pythonChatHistory, { role: 'user' as const, content: userPrompt, timestamp: Date.now() }];
    setPythonChatHistory(newHistory);

    setPythonAgentStatus("Generazione Codice Python...");

    const performGeneration = async (currentHistory: any[], retryCount = 0) => {
      try {
        const response = await generatePythonAction(
          userPrompt,
          { apiKey, model },
          pythonOutputType,
          pythonSelectedPipelines,
          currentHistory
        );

        if (response.code) {
          setPythonAgentStatus(retryCount > 0 ? `Correzione in corso (Tentativo ${retryCount}/3)...` : "Esecuzione Anteprima Automatica...");

          const previewRes = await executePythonPreviewAction(
            response.code,
            pythonOutputType,
            {},
            pythonSelectedPipelines.map(pName => {
              const dep = availableInputTables?.find(t => t.name === pName);
              return {
                tableName: dep?.name || '',
                query: dep?.sqlQuery,
                connectorId: dep?.connectorId,
                isPython: dep?.isPython,
                pythonCode: dep?.pythonCode,
                pipelineDependencies: dep?.pipelineDependencies
              };
            }),
            pythonConnectorId
          );

          if (previewRes.success) {
            setPythonCode(response.code);
            setPythonPreviewResult({
              type: pythonOutputType,
              data: previewRes.data,
              columns: previewRes.columns,
              variables: previewRes.variables,
              chartBase64: previewRes.chartBase64,
              chartHtml: previewRes.chartHtml,
              debugLogs: previewRes.debugLogs
            });
            setHasPythonCodeChanged(true);

            const successMsg = retryCount > 0
              ? `Ho corretto l'errore ed eseguito lo script con successo (al tentativo ${retryCount})!\n\n\`\`\`python\n${response.code}\n\`\`\``
              : `Ho generato ed eseguito lo script con successo!\n\n\`\`\`python\n${response.code}\n\`\`\``;

            setPythonChatHistory(prev => [...prev, {
              role: 'assistant',
              content: successMsg,
              timestamp: Date.now(),
              preview: {
                type: pythonOutputType,
                data: previewRes.data,
                columns: previewRes.columns,
                chartHtml: previewRes.chartHtml,
                chartBase64: previewRes.chartBase64,
                variables: previewRes.variables
              }
            }]);
          } else {
            if (retryCount < 3) {
              const errorFeedback = `The code failed execution with this error: ${previewRes.error}.\n\nOUTPUT LOGS (STDOUT) - Use this to fix column names:\n${previewRes.stdout || "No output captured."}\n\nPlease fix the code to resolve this error. Return ONLY the fixed python code.`;
              const nextHistory = [
                ...currentHistory,
                { role: 'assistant', content: `\`\`\`python\n${response.code}\n\`\`\`` },
                { role: 'user', content: errorFeedback }
              ];
              await performGeneration(nextHistory, retryCount + 1);
            } else {
              const errorMessage = `Non sono riuscito a correggere l'errore dopo 3 tentativi. Ultimo errore:\n${previewRes.error}\n\nUltimo codice:\n\`\`\`python\n${response.code}\n\`\`\``;
              setPythonChatHistory(prev => [...prev, { role: 'assistant', content: errorMessage, timestamp: Date.now() }]);
              toast({ variant: 'destructive', title: "Errore Irrisolvibile", description: "Impossibile correggere automaticamente lo script." });
            }
          }
        } else {
          const errorMessage = `Errore generazione: ${response.error || "Sconosciuto"}`;
          setPythonChatHistory(prev => [...prev, { role: 'assistant', content: errorMessage, timestamp: Date.now() }]);
          toast({ variant: 'destructive', title: "Errore AI", description: response.error || "Errore sconosciuto" });
        }
      } catch (e: any) {
        const errorMessage = `Errore critico: ${e.message}`;
        setPythonChatHistory(prev => [...prev, { role: 'assistant', content: errorMessage, timestamp: Date.now() }]);
      }
    };

    performGeneration(newHistory, 0).finally(() => setPythonAgentStatus(null));
  }, [openRouterApiKey, openRouterModel, pythonChatHistory, pythonOutputType, pythonSelectedPipelines, pythonConnectorId, availableInputTables, toast]);

  const handleSaveClick = async () => {
    // Validation based on CURRENT node type, with fallback for type conversion case
    const effectiveQuestionText = questionText.trim() || decisionText.trim();
    const effectiveDecisionText = decisionText.trim() || questionText.trim();

    if (currentNodeType === 'question' && !('option' in initialNode) && !effectiveQuestionText) {
      toast({ title: 'Il testo della domanda è obbligatorio', variant: 'destructive' });
      return;
    }
    if (currentNodeType === 'decision' && !effectiveDecisionText) {
      toast({ title: 'Il testo della decisione è obbligatorio', variant: 'destructive' });
      return;
    }
    // Option text is no longer mandatory for saving (as per user request)

    setInternalSaving(true);

    try {
      let uploadedMedia: MediaItem[] = [];
      if (filesToUpload.length > 0) {
        const uploadPromises = filesToUpload.map(async ({ file, name, type }) => {
          const result = await uploadFile(file, `trees/${treeId}`, `${Date.now()}-${file.name}`);
          const downloadURL = result?.url || '';
          return { name: name, type, url: downloadURL, originalFilename: file.name };
        });
        uploadedMedia = await Promise.all(uploadPromises);
      }

      const finalMedia = [...media, ...uploadedMedia];

      let newNodeData: any = { ...initialNode };

      console.log('[TYPE SWITCH DEBUG] currentNodeType:', currentNodeType);
      console.log('[TYPE SWITCH DEBUG] questionText:', questionText);
      console.log('[TYPE SWITCH DEBUG] decisionText:', decisionText);
      console.log('[TYPE SWITCH DEBUG] initialNode:', initialNode);

      // 1. Structure Updates (Type Switching & Core Text)
      if (currentNodeType === 'question' && !('option' in initialNode)) {
        // Question Node
        // Use decisionText as fallback if questionText is empty (async state update case)
        const effectiveQuestionText = questionText.trim() || decisionText.trim();
        newNodeData.question = effectiveQuestionText;
        if ('decision' in newNodeData) delete newNodeData.decision;
        if (!newNodeData.options) newNodeData.options = {};
      } else if (currentNodeType === 'decision') {
        // Decision Node
        // Use questionText as fallback if decisionText is empty (async state update case)
        const effectiveDecisionText = decisionText.trim() || questionText.trim();
        newNodeData.decision = effectiveDecisionText;
        if ('question' in newNodeData) delete newNodeData.question;
        if ('options' in newNodeData) delete newNodeData.options;
      } else if ('option' in initialNode) {
        // Option Node (Edge)
        newNodeData.option = optionText;
      }

      // 2. Common Properties (Apply to ALL node types: Question, Decision, Option)

      // Media
      if (finalMedia.length > 0) newNodeData.media = finalMedia;
      else delete newNodeData.media;

      // Links
      if (links.length > 0) newNodeData.links = links;
      else delete newNodeData.links;

      // Triggers
      if (triggers.length > 0) newNodeData.triggers = triggers;
      else delete newNodeData.triggers;

      // SQL Data
      if (sqlQuery) {
        newNodeData.sqlQuery = sqlQuery.trim();
        newNodeData.sqlConnectorId = sqlConnectorId || undefined;
        newNodeData.sqlResultName = sqlResultName.trim() || undefined;

        if (selectedPipelines.length > 0) {
          newNodeData.selectedPipelines = selectedPipelines;
        } else {
          delete newNodeData.selectedPipelines;
        }
      } else {
        delete newNodeData.sqlQuery;
        delete newNodeData.sqlConnectorId;
        delete newNodeData.sqlResultName;
        delete newNodeData.selectedPipelines;
      }

      // Python Data
      if (pythonCode) {
        newNodeData.pythonCode = pythonCode.trim();
        newNodeData.pythonOutputType = pythonOutputType;
        newNodeData.pythonResultName = pythonResultName.trim() || undefined;
        newNodeData.pythonConnectorId = pythonConnectorId || undefined;
        if (pythonSelectedPipelines.length > 0) {
          newNodeData.pythonSelectedPipelines = pythonSelectedPipelines;
        } else {
          delete newNodeData.pythonSelectedPipelines;
        }
      } else {
        delete newNodeData.pythonCode;
        delete newNodeData.pythonOutputType;
        delete newNodeData.pythonResultName;
        delete newNodeData.pythonConnectorId;
        delete newNodeData.pythonSelectedPipelines;
      }

      // Email Action (Apply to ALL node types, including Options)
      if (emailConfig.enabled && emailConfig.connectorId && emailConfig.to && emailConfig.subject) {
        newNodeData.emailAction = emailConfig;
      } else {
        delete newNodeData.emailAction;
      }

      // SQL Export Action
      if (sqlExportSourceTables.length > 0 && sqlExportTargetConnectorId && sqlExportTargetTableName) {
        newNodeData.sqlExportAction = {
          sourceTables: sqlExportSourceTables,
          targetConnectorId: sqlExportTargetConnectorId,
          targetTableName: sqlExportTargetTableName,
        };
      } else {
        delete newNodeData.sqlExportAction;
      }

      // Widget Configuration
      if (widgetConfig) {
        newNodeData.widgetConfig = {
          ...widgetConfig,
          // SEAL DATA: Save current preview data into the config
          data: pythonPreviewResult?.data || sqlPreviewData || widgetConfig.data || []
        };
      } else {
        delete newNodeData.widgetConfig;
      }

      onSave(nodePath, newNodeData);
      onClose();

    } catch (error) {
      console.error('Error saving node:', error);
      toast({
        variant: 'destructive',
        title: 'Errore Salvataggio',
        description: 'Impossibile salvare le modifiche.',
      });
    } finally {
      setInternalSaving(false);
    }
  };

  let title = 'Modifica Nodo';
  let description = "Apporta le modifiche al nodo qui sotto. Fai clic su Salva quando hai finito.";

  if (currentNodeType === 'question' && !('option' in initialNode)) {
    title = 'Modifica Domanda';
    description = "Modifica il testo della domanda e aggiungi eventuali media o link.";
  } else if (currentNodeType === 'question' && 'option' in initialNode) {
    title = 'Modifica Opzione';
    description = "Modifica il testo dell'opzione di risposta (facoltativo se usato solo come passaggio).";
  } else if (currentNodeType === 'decision') {
    title = 'Modifica Risultato Finale';
    description = "Specifica il risultato finale o l'azione da intraprendere.";
  }

  const canSave = !componentIsSaving && (
    (currentNodeType === 'question' && !('option' in initialNode) && (questionText.trim() !== '' || decisionText.trim() !== '')) ||
    (currentNodeType === 'question' && 'option' in initialNode) || // Allow empty option text
    (currentNodeType === 'decision' && (decisionText.trim() !== '' || questionText.trim() !== ''))
  );

  const MediaListItem = ({
    item,
    isUrl,
    index,
    onRemove,
    onPreview,
  }: {
    item: MediaItem | FileToUpload,
    isUrl: boolean,
    index: number,
    onRemove: () => void,
    onPreview: () => void,
  }) => {
    const url = isUrl ? (item as MediaItem).url : URL.createObjectURL((item as FileToUpload).file);
    const displayName = item.name;
    const originalFilename = isUrl ? (item as MediaItem).originalFilename || url.split('/').pop()?.split('?')[0] : (item as FileToUpload).file.name;

    const type = isUrl ? 'existing' : 'new';
    const isEditing = editingMediaName?.type === type && editingMediaName?.index === index;

    return (
      <div className="flex items-center gap-2 p-1.5 rounded-md bg-background/50 hover:bg-background">
        <div className="w-10 h-10 rounded bg-secondary flex-shrink-0 overflow-hidden relative flex items-center justify-center">
          {item.type === 'image' ? (
            <Image src={url} alt="Anteprima" layout="fill" objectFit="cover" />
          ) : (
            <Video className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className='flex-1 min-w-0'>
          {isEditing ? (
            <Input
              value={editingMediaName?.name || ''}
              onChange={e => setEditingMediaName(prev => prev ? { ...prev, name: e.target.value } : null)}
              className="h-8 text-sm"
              placeholder="Nome descrittivo..."
              disabled={componentIsSaving}
              autoFocus
            />
          ) : (
            <div>
              <p className='truncate text-sm font-medium' title={displayName}>{displayName}</p>
              <p className='truncate text-xs text-muted-foreground' title={originalFilename}>{originalFilename}</p>
            </div>
          )}
        </div>
        <div className='flex items-center'>
          {isEditing ? (
            <>
              <Button variant="ghost" size="icon" onClick={handleSaveMediaName} className="h-8 w-8 text-green-600 hover:text-green-700" title="Salva" disabled={componentIsSaving}>
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEditingMediaName(null)} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Annulla" disabled={componentIsSaving}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="icon" onClick={onPreview} className="h-8 w-8 text-muted-foreground" title="Anteprima">
                <Eye className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onPointerDown={e => e.preventDefault()} onClick={() => setEditingMediaName({ index, type, name: displayName })} className="h-8 w-8 text-muted-foreground" title="Modifica" disabled={componentIsSaving}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onRemove} className="h-8 w-8 text-destructive" title="Rimuovi">
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };


  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !componentIsSaving && !pendingTypeChange && onClose()}>
        <DialogContent className="sm:max-w-[75vw] md:max-w-[75vw] lg:max-w-[75vw] !max-w-[75vw] w-[75vw]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div className='grid gap-1.5'>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>

              {/* Collapse/Expand All Buttons */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2 gap-1.5"
                  onClick={() => {
                    const keys = [
                      `collapse-links-${treeId}-${nodePath}`,
                      `collapse-triggers-${treeId}-${nodePath}`,
                      `collapse-media-${treeId}-${nodePath}`,
                      `collapse-sql-${treeId}-${nodePath}`,
                      `collapse-python-${treeId}-${nodePath}`,
                      `collapse-sql-export-${treeId}-${nodePath}`,
                      `collapse-email-${treeId}-${nodePath}`,
                    ];
                    keys.forEach(k => localStorage.setItem(k, 'false'));
                    window.dispatchEvent(new Event('storage'));
                  }}
                  disabled={componentIsSaving}
                  title="Implodi tutto"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  Implodi
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2 gap-1.5"
                  onClick={() => {
                    const keys = [
                      `collapse-links-${treeId}-${nodePath}`,
                      `collapse-triggers-${treeId}-${nodePath}`,
                      `collapse-media-${treeId}-${nodePath}`,
                      `collapse-sql-${treeId}-${nodePath}`,
                      `collapse-python-${treeId}-${nodePath}`,
                      `collapse-sql-export-${treeId}-${nodePath}`,
                      `collapse-email-${treeId}-${nodePath}`,
                    ];
                    keys.forEach(k => localStorage.setItem(k, 'true'));
                    window.dispatchEvent(new Event('storage'));
                  }}
                  disabled={componentIsSaving}
                  title="Esplodi tutto"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Esplodi
                </Button>
              </div>

              {/* Node Type Switcher - Only show for Question/Decision nodes, not Options */}
              {!('option' in initialNode) && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
                  <Button
                    type="button"
                    variant={currentNodeType === 'question' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-8 text-xs px-3 gap-2 transition-all ${currentNodeType === 'question'
                      ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                      : 'text-muted-foreground hover:bg-muted'
                      }`}
                    onClick={() => requestTypeChange('question')}
                    disabled={componentIsSaving}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Domanda
                  </Button>
                  <Button
                    type="button"
                    variant={currentNodeType === 'decision' ? 'default' : 'ghost'}
                    size="sm"
                    className={`h-8 text-xs px-3 gap-2 transition-all ${currentNodeType === 'decision'
                      ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                      : 'text-muted-foreground hover:bg-muted'
                      }`}
                    onClick={() => requestTypeChange('decision')}
                    disabled={componentIsSaving}
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Risultato
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] -mx-6 px-6">
            <div className="grid gap-4 py-4">
              {currentNodeType === 'question' && !('option' in initialNode) && (
                <div className="grid gap-4">
                  {variableId && (
                    <div className="space-y-1 mb-4">
                      <Label htmlFor='var-id'>ID Variabile Standard</Label>
                      <Input id="var-id" value={variableId} readOnly disabled className="font-mono text-xs" />
                      <p className="text-xs text-muted-foreground">La modifica di questa domanda aggiornerà la variabile standard in tutto il sistema.</p>
                    </div>
                  )}
                  <div className="grid gap-1">
                    <Label htmlFor="node-text">Testo Domanda</Label>
                    <Textarea
                      id="node-text"
                      name="questionText"
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      className="min-h-[80px] max-h-48 mt-1"
                      placeholder='Es: "Il dispositivo è in garanzia?"'
                      disabled={componentIsSaving}
                    />
                  </div>
                </div>
              )}
              {currentNodeType === 'question' && 'option' in initialNode && (
                <div className="grid gap-2">
                  <Label htmlFor="option-text">Nome Opzione</Label>
                  <Input
                    id="option-text"
                    value={optionText}
                    onChange={(e) => setOptionText(e.target.value)}
                    placeholder='Es: "Sì" o "Opzione A"'
                    disabled={componentIsSaving}
                  />
                </div>
              )}
              {currentNodeType === 'decision' && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="decision-text">Testo Decisione (Obbligatorio)</Label>
                    <Textarea
                      id="decision-text"
                      value={decisionText}
                      onChange={(e) => setDecisionText(e.target.value)}
                      className="min-h-[80px] max-h-48"
                      placeholder='Es: "Procedi con la riparazione gratuita."'
                      disabled={componentIsSaving}
                    />
                  </div>
                </div>
              )}

              {/* Links Section */}
              <CollapsibleSection
                title="Links"
                count={links.length}
                storageKey={`collapse-links-${treeId}-${nodePath}`}
                icon={LinkIcon}
              >
                <div className="space-y-2 pt-2">
                  <div className='space-y-1 max-h-36 overflow-y-auto bg-muted/50 rounded-md p-1'>
                    {links.map((link, index) => {
                      const isEditing = editingLinkIndex === index;
                      return (
                        <div key={index} className="flex items-center gap-2 p-1.5 rounded-md bg-background/50 hover:bg-background">
                          {isEditing && editingLink ? (
                            <div className='flex-1 min-w-0 space-y-2'>
                              <Input
                                value={editingLink.name}
                                onChange={e => setEditingLink({ ...editingLink, name: e.target.value })}
                                className="h-8 text-xs"
                                placeholder="Nome link..."
                                disabled={componentIsSaving}
                              />
                              <Input
                                value={editingLink.url}
                                onChange={e => setEditingLink({ ...editingLink, url: e.target.value })}
                                className="h-8 text-xs"
                                placeholder="https://..."
                                disabled={componentIsSaving}
                              />
                            </div>
                          ) : (
                            <div className='flex-1 min-w-0'>
                              <p className='truncate text-sm font-medium'>{link.name}</p>
                              <p className='text-xs text-muted-foreground' style={{ wordBreak: 'break-all' }}>{link.url}</p>
                            </div>
                          )}
                          <div className='flex items-center'>
                            {isEditing ? (
                              <>
                                <Button variant="ghost" size="icon" onClick={handleSaveEditLink} className="h-8 w-8 text-green-600 hover:text-green-700" title="Salva" disabled={componentIsSaving}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={handleCancelEditLink} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Annulla" disabled={componentIsSaving}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <a href={link.url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Apri link">
                                    <LinkIcon className="h-4 w-4" />
                                  </Button>
                                </a>
                                <Button variant="ghost" size="icon" onClick={() => handleStartEditLink(index)} className="h-8 w-8 text-muted-foreground" title="Modifica" disabled={componentIsSaving}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveLink(index)} className="h-8 w-8 text-destructive" title="Rimuovi" disabled={componentIsSaving}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {links.length === 0 && (
                      <p className='text-xs text-center text-muted-foreground py-2'>Nessun link allegato.</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        value={newLinkName}
                        onChange={e => setNewLinkName(e.target.value)}
                        placeholder="Nome Link"
                        disabled={componentIsSaving}
                        className="h-8 text-xs"
                      />
                      <Input
                        value={newLinkUrl}
                        onChange={e => setNewLinkUrl(e.target.value)}
                        placeholder="https://..."
                        disabled={componentIsSaving}
                        className="h-8 text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddLink} disabled={componentIsSaving || !newLinkName.trim() || !newLinkUrl.trim()} className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary h-8">Aggiungi</Button>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Triggers Section */}
              <CollapsibleSection
                title="Triggers"
                count={triggers.length}
                storageKey={`collapse-triggers-${treeId}-${nodePath}`}
                icon={Zap}
              >
                <div className="space-y-2 pt-2">
                  <div className='space-y-1 max-h-36 overflow-y-auto bg-muted/50 rounded-md p-1'>
                    {triggers.map((trigger, index) => {
                      const isEditing = editingTriggerIndex === index;
                      return (
                        <div key={index} className="flex items-center gap-2 p-1.5 rounded-md bg-background/50 hover:bg-background">
                          {isEditing && editingTrigger ? (
                            <div className='flex-1 min-w-0 space-y-2'>
                              <Input
                                value={editingTrigger.name}
                                onChange={e => setEditingTrigger({ ...editingTrigger, name: e.target.value })}
                                className="h-8 text-xs"
                                placeholder="Nome trigger..."
                                disabled={componentIsSaving}
                              />
                              <Input
                                value={editingTrigger.path}
                                onChange={e => setEditingTrigger({ ...editingTrigger, path: e.target.value })}
                                className="h-8 text-xs"
                                placeholder="Es: FIRESTORE_WRITE::commesse"
                                disabled={componentIsSaving}
                              />
                            </div>
                          ) : (
                            <div className='flex-1 min-w-0'>
                              <p className='truncate text-sm font-medium'>{trigger.name}</p>
                              <p className='text-xs text-muted-foreground break-all' style={{ wordBreak: 'break-all' }}>{trigger.path}</p>
                            </div>
                          )}
                          <div className='flex items-center'>
                            {isEditing ? (
                              <>
                                <Button variant="ghost" size="icon" onClick={handleSaveEditTrigger} className="h-8 w-8 text-green-600 hover:text-green-700" title="Salva" disabled={componentIsSaving}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={handleCancelEditTrigger} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Annulla" disabled={componentIsSaving}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleExecuteTrigger(trigger)} className="h-8 w-8 text-muted-foreground" title="Esegui Trigger">
                                  <Zap className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleStartEditTrigger(index)} className="h-8 w-8 text-muted-foreground" title="Modifica" disabled={componentIsSaving}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveTrigger(index)} className="h-8 w-8 text-destructive" title="Rimuovi" disabled={componentIsSaving}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {triggers.length === 0 && (
                      <p className='text-xs text-center text-muted-foreground py-2'>Nessun trigger definito.</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        value={newTriggerName}
                        onChange={e => setNewTriggerName(e.target.value)}
                        placeholder="Nome Trigger"
                        disabled={componentIsSaving}
                        className="h-8 text-xs"
                      />
                      <Input
                        value={newTriggerPath}
                        onChange={e => setNewTriggerPath(e.target.value)}
                        placeholder="Path/ID Trigger"
                        disabled={componentIsSaving}
                        className="h-8 text-xs"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTrigger(); } }}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddTrigger} disabled={componentIsSaving || !newTriggerName.trim() || !newTriggerPath.trim()} className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary h-8">Aggiungi</Button>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Media Section */}
              <CollapsibleSection
                title="Media"
                count={media.length + filesToUpload.length}
                storageKey={`collapse-media-${treeId}-${nodePath}`}
                icon={ImageIcon}
              >
                <div className='space-y-2 pt-2'>
                  <div className='space-y-1 max-h-48 overflow-y-auto bg-muted/50 rounded-md p-1'>
                    {media?.map((item, index) => (
                      <MediaListItem
                        key={`existing-${index}`}
                        item={item}
                        isUrl={true}
                        index={index}
                        onRemove={() => handleRemoveExistingMedia(index)}
                        onPreview={() => setPreviewingMedia(item)}
                      />
                    ))}
                    {filesToUpload.map((fileItem, index) => (
                      <MediaListItem
                        key={`new-${index}`}
                        item={fileItem}
                        isUrl={false}
                        index={index}
                        onRemove={() => handleRemoveNewFile(index)}
                        onPreview={() => setPreviewingMedia({ url: URL.createObjectURL(fileItem.file), type: fileItem.type })}
                      />
                    ))}
                    {media.length === 0 && filesToUpload.length === 0 && (
                      <p className='text-xs text-center text-muted-foreground py-4'>Nessun media allegato.</p>
                    )}
                  </div>
                  <div className="flex items-end">
                    <Label htmlFor="media-upload" className="w-full cursor-pointer">
                      <div className="w-full text-primary border border-primary/50 hover:bg-primary/10 hover:text-primary rounded-md h-9 flex items-center justify-center text-sm font-medium transition-colors">
                        Scegli File
                      </div>
                      <Input id="media-upload" type="file" accept="image/*,video/*" onChange={handleFileChange} disabled={componentIsSaving} multiple className='hidden' />
                    </Label>
                  </div>
                </div>
              </CollapsibleSection>


              {/* SQL Generation with Chatbot UI */}
              <CollapsibleSection
                title="Dati e Integrazioni SQL"
                count={sqlQuery ? 1 : 0}
                storageKey={`collapse-sql-${treeId}-${nodePath}`}
                icon={Database}
              >
                <div className="grid gap-4 pt-3">
                  {/* Connector Selection */}
                  <div className="grid gap-2">
                    <Label>Connettore Database</Label>
                    <Select value={sqlConnectorId} onValueChange={setSqlConnectorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona un Database..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sqlConnectors?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Pipeline Selection (Moved Up) */}
                  {availableInputTables && availableInputTables.length > 0 && (
                    <div className="grid gap-2 p-3 bg-muted/20 rounded-lg border border-dashed">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Usa Risultati Da (Pipeline)</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableInputTables?.map(t => (
                          <div key={t.name} className="flex items-center space-x-2 bg-white dark:bg-zinc-800 p-1.5 px-2.5 rounded-full border shadow-sm">
                            <Check
                              className={`h-3 w-3 cursor-pointer ${selectedPipelines.includes(t.name) ? 'text-primary' : 'text-muted-foreground/30'}`}
                              onClick={() => {
                                if (selectedPipelines.includes(t.name)) {
                                  setSelectedPipelines(prev => prev.filter(p => p !== t.name));
                                } else {
                                  setSelectedPipelines(prev => [...prev, t.name]);
                                }
                              }}
                            />
                            <Label className="text-xs cursor-pointer" onClick={() => {
                              if (selectedPipelines.includes(t.name)) {
                                setSelectedPipelines(prev => prev.filter(p => p !== t.name));
                              } else {
                                setSelectedPipelines(prev => [...prev, t.name]);
                              }
                            }}>{t.name}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Two Column Layout: Left = Query/Editor, Right = Chatbot */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* LEFT COLUMN: Query Editor & Result Name - fills full height */}
                    <div className="flex flex-col order-2 lg:order-1 h-full">
                      {/* SQL Editor */}
                      <div className="grid gap-2 flex-1">
                        <Label>Query SQL</Label>
                        <Textarea
                          value={sqlQuery}
                          onChange={(e) => setSqlQuery(e.target.value)}
                          className="font-mono text-sm flex-1 min-h-[200px]"
                          placeholder="SELECT * FROM ..."
                        />
                      </div>

                      <div className="flex justify-between items-end mt-3 gap-4">
                        <div className="grid gap-2 flex-1">
                          <Label>Nome Tabella Risultato (Opzionale)</Label>
                          <Input
                            value={sqlResultName}
                            onChange={(e) => setSqlResultName(e.target.value)}
                            placeholder="Es. ClientiAttivi (per riutilizzo)"
                          />
                        </div>

                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (!sqlQuery) {
                              toast({ variant: 'destructive', title: "Errore", description: "Inserisci una query SQL prima di eseguire l'anteprima." });
                              return;
                            }
                            setAgentStatus("Esecuzione Query...");

                            // Build Dependencies for Execution
                            let pipelineDeps: any[] = [];
                            if (availableInputTables && availableInputTables.length > 0) {
                              // Auto-detect which tables are referenced in the SQL query
                              const referencedTables = new Set<string>();

                              // Parse the SQL query for table references (FROM, JOIN)
                              const sqlUpper = sqlQuery.toUpperCase();
                              availableInputTables.forEach(table => {
                                const tableNameUpper = table.name.toUpperCase();
                                // Check for FROM or JOIN references
                                if (sqlUpper.includes(`FROM ${tableNameUpper}`) ||
                                  sqlUpper.includes(`FROM\n${tableNameUpper}`) ||
                                  sqlUpper.includes(`JOIN ${tableNameUpper}`) ||
                                  sqlUpper.includes(`JOIN\n${tableNameUpper}`)) {
                                  referencedTables.add(table.name);
                                }
                              });

                              console.log('[SQL PREVIEW] Auto-detected referenced tables:', Array.from(referencedTables));

                              // Include both selected tables AND auto-detected referenced tables
                              const tablesToInclude = new Set([...selectedPipelines, ...referencedTables]);

                              pipelineDeps = availableInputTables
                                .filter(t => tablesToInclude.has(t.name))
                                .map(table => ({
                                  tableName: table.name,
                                  query: table.sqlQuery || undefined,
                                  isPython: table.isPython,
                                  pythonCode: table.pythonCode,
                                  connectorId: table.connectorId,
                                  pipelineDependencies: table.pipelineDependencies
                                }))
                                .filter(d => d.query || (d.isPython && d.pythonCode));
                            }

                            executeSqlPreviewAction(sqlQuery, sqlConnectorId, pipelineDeps).then((res) => {
                              setAgentStatus(null);
                              if (res.data) {
                                setSqlPreviewData(res.data);
                                toast({ title: "Query Eseguita", description: `Estratti ${res.data.length} record.` });
                              } else {
                                toast({ variant: 'destructive', title: "Errore SQL", description: res.error || "Errore sconosciuto" });
                              }
                            });
                          }}
                          disabled={!!agentStatus}
                        >
                          {agentStatus === "Esecuzione Query..." ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                          Esegui Anteprima
                        </Button>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: AI Chatbot */}
                    <div className="order-1 lg:order-2">
                      <div className="bg-muted/30 border rounded-lg overflow-hidden flex flex-col h-[300px]">
                        <div className="bg-muted/50 p-2 px-3 border-b flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Bot className="h-3.5 w-3.5" />
                            AI SQL Assistant
                          </span>
                          {agentStatus && (
                            <div className="bg-background text-[10px] h-5 gap-1 flex items-center px-2 rounded-full border">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {agentStatus.replace('...', '')}
                            </div>
                          )}
                        </div>

                        <ScrollArea className="flex-1 p-4">
                          <div className="flex flex-col gap-4">
                            {/* Intro Message */}
                            {sqlChatHistory.length === 0 && (
                              <div className="flex gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Bot className="h-4 w-4 text-primary" />
                                </div>
                                <div className="bg-white dark:bg-zinc-800 p-2.5 rounded-2xl rounded-tl-sm text-sm border shadow-sm max-w-[85%]">
                                  <p>Ciao! Posso aiutarti a scrivere query SQL per i tuoi dati. Dimmi cosa ti serve estrarre.</p>
                                </div>
                              </div>
                            )}

                            {/* History Messages */}
                            {sqlChatHistory?.map((msg, idx) => (
                              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''} group`}>
                                {msg.role === 'assistant' && (
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <Bot className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <div className={`${msg.role === 'user'
                                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                                  : 'bg-white dark:bg-zinc-800 rounded-tl-sm border shadow-sm'
                                  } p-2.5 rounded-2xl text-sm max-w-[85%] space-y-2 relative`}>
                                  <p className="whitespace-pre-wrap">{msg.content}</p>

                                  {/* Insert Query Button for Assistant Messages with Code */}
                                  {msg.role === 'assistant' && (msg.content.includes('SELECT') || msg.content.includes('WITH')) && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="w-full h-7 text-[10px] gap-1 mt-2"
                                      onClick={() => {
                                        const codeBlockRegex = /```(?:sql|tsql|mssql)?\s*([\s\S]*?)```/i;
                                        const match = msg.content.match(codeBlockRegex);
                                        let queryToInsert = '';

                                        if (match && match[1]) {
                                          queryToInsert = match[1].trim();
                                        } else {
                                          const selectIdx = msg.content.indexOf('SELECT');
                                          if (selectIdx >= 0) {
                                            queryToInsert = msg.content.substring(selectIdx);
                                          } else {
                                            queryToInsert = msg.content;
                                          }
                                        }

                                        if (queryToInsert) {
                                          setSqlQuery(queryToInsert);
                                          toast({ title: "Query Inserita", description: "L'editor SQL è stato aggiornato." });
                                        }
                                      }}
                                    >
                                      <ArrowDownToLine className="h-3 w-3" /> Inserisci nel Editor
                                    </Button>
                                  )}
                                </div>
                                {msg.role === 'user' && (
                                  <div className="flex flex-col gap-1 items-end">
                                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-white font-bold text-xs">
                                      U
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Torna a questo punto"
                                      onClick={() => {
                                        const newHistory = sqlChatHistory.slice(0, idx);
                                        setSqlChatHistory(newHistory);
                                        toast({ title: "Conversazione Riavvobolta", description: "Sei tornato a un punto precedente." });
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Loading State */}
                            {agentStatus && (
                              <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Bot className="h-4 w-4 text-primary" />
                                </div>
                                <div className="bg-white dark:bg-zinc-800 p-2.5 rounded-2xl rounded-tl-sm text-sm border shadow-sm max-w-[85%] space-y-2">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{agentStatus}</span>
                                  </div>
                                  <div className="h-1 bg-muted rounded-full overflow-hidden w-32">
                                    <div className="h-full bg-primary animate-pulse w-2/3" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </ScrollArea>

                        {/* Input Area */}
                        <div className="p-2 border-t bg-background flex gap-2">
                          <Input
                            placeholder="Descrivi cosa estrarre (es. 'Tutti i clienti attivi')"
                            className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent"
                            id="ai-prompt-input"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                const btn = document.getElementById('ai-send-btn');
                                if (btn) btn.click();
                              }
                            }}
                          />
                          <Button
                            id="ai-send-btn"
                            size="sm"
                            className="gap-2 rounded-lg"
                            disabled={!!agentStatus}
                            onClick={() => {
                              const input = document.getElementById('ai-prompt-input') as HTMLInputElement;
                              if (!input || !input.value) return;

                              const userPrompt = input.value;
                              input.value = '';

                              const newHistory = [...sqlChatHistory, { role: 'user' as const, content: userPrompt, timestamp: Date.now() }];
                              setSqlChatHistory(newHistory);

                              const apiKey = openRouterApiKey || '';
                              const model = openRouterModel || 'google/gemini-2.0-flash-001';

                              if (!apiKey) {
                                toast({ variant: 'destructive', title: "Configurazione Mancante", description: "Imposta la chiave API nelle Impostazioni." });
                                return;
                              }

                              setAgentStatus("Analisi Schema in corso...");

                              fetchTableSchemaAction(
                                sqlConnectorId || '',
                                selectedPipelines?.map(p => p.split(':')[1])
                              ).then((schemaRes) => {
                                let schemaContext = schemaRes.schemaContext;

                                if (schemaRes.error) {
                                  console.warn("Schema fetch warning:", schemaRes.error);
                                }

                                setAgentStatus("Generazione Query SQL...");

                                generateSqlAction(
                                  userPrompt,
                                  { apiKey, model },
                                  sqlConnectorId,
                                  schemaContext || undefined,
                                  newHistory
                                ).then((res) => {
                                  if (res.sql) {
                                    const assistantMsg = { role: 'assistant' as const, content: `Ecco la query:\n\`\`\`sql\n${res.sql}\n\`\`\``, timestamp: Date.now() };
                                    setSqlChatHistory([...newHistory, assistantMsg]);
                                  } else {
                                    const errorMsg = { role: 'assistant' as const, content: `Errore: ${res.error || "Errore sconosciuto"}`, timestamp: Date.now() };
                                    setSqlChatHistory([...newHistory, errorMsg]);
                                    toast({ variant: 'destructive', title: "Errore AI", description: res.error || "Errore sconosciuto" });
                                  }
                                  setAgentStatus(null);
                                });
                              });
                            }}
                          >
                            {agentStatus ? 'Elaborazione...' : 'Invia'}
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preview section BELOW the columns - max 200px height */}
                  {sqlPreviewData && (
                    <div className="border rounded-md overflow-hidden mt-4">
                      <div className="flex justify-between items-center bg-muted/50 p-2 border-b">
                        <span className="font-semibold text-xs flex items-center gap-2">
                          <Database className="h-3 w-3" />
                          Risultati Anteprima ({sqlPreviewData.length} record)
                        </span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSqlPreviewData(null)}><X className="h-3 w-3" /></Button>
                      </div>
                      <div className="max-h-[200px] overflow-auto">
                        <DataTable data={sqlPreviewData} />
                      </div>
                    </div>
                  )}

                </div>
              </CollapsibleSection>

              {/* Python Script Section */}
              <CollapsibleSection
                title="Script Python"
                count={pythonCode ? 1 : 0}
                storageKey={`collapse-python-${treeId}-${nodePath}`}
                icon={Code}
              >
                <div className="grid gap-4 pt-3">
                  {/* Output Type Selector */}
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Tipo Output</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={pythonOutputType === 'table' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPythonOutputType('table')}
                        className="flex-1"
                      >
                        <Table className="h-3.5 w-3.5 mr-1.5" />
                        Tabella
                      </Button>
                      <Button
                        type="button"
                        variant={pythonOutputType === 'variable' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPythonOutputType('variable')}
                        className="flex-1"
                      >
                        <Variable className="h-3.5 w-3.5 mr-1.5" />
                        Variabile
                      </Button>
                      <Button
                        type="button"
                        variant={pythonOutputType === 'chart' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPythonOutputType('chart')}
                        className="flex-1"
                      >
                        <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                        Grafico
                      </Button>
                    </div>
                  </div>

                  {/* Database Connector Selection */}
                  <div className="grid gap-2">
                    <Label>Database (per accesso dati)</Label>
                    <Select value={pythonConnectorId} onValueChange={setPythonConnectorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona un Database..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuno</SelectItem>
                        {dataConnectors.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Opzionale: seleziona un database per usare i dati nel tuo script.</p>
                  </div>

                  {/* Pipeline Selection */}
                  {availableInputTables && availableInputTables.length > 0 && (
                    <div className="grid gap-2 p-3 bg-muted/20 rounded-lg border border-dashed">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Usa Dati Da (Pipeline)</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableInputTables?.map(t => (
                          <div key={t.name} className="flex items-center space-x-2 bg-white dark:bg-zinc-800 p-1.5 px-2.5 rounded-full border shadow-sm">
                            <Check
                              className={`h-3 w-3 cursor-pointer ${pythonSelectedPipelines.includes(t.name) ? 'text-yellow-600' : 'text-muted-foreground/30'}`}
                              onClick={() => {
                                if (pythonSelectedPipelines.includes(t.name)) {
                                  setPythonSelectedPipelines(prev => prev.filter(p => p !== t.name));
                                } else {
                                  setPythonSelectedPipelines(prev => [...prev, t.name]);
                                }
                              }}
                            />
                            <Label className="text-xs cursor-pointer" onClick={() => {
                              if (pythonSelectedPipelines.includes(t.name)) {
                                setPythonSelectedPipelines(prev => prev.filter(p => p !== t.name));
                              } else {
                                setPythonSelectedPipelines(prev => [...prev, t.name]);
                              }
                            }}>{t.name}</Label>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Questi risultati saranno disponibili come DataFrame nel tuo script.</p>
                    </div>
                  )}

                  {/* Two Column Layout: Left = Code/Preview, Right = Chatbot */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* LEFT COLUMN: Code Editor & Result Name - fills full height */}
                    <div className="flex flex-col order-2 lg:order-1 h-full">
                      {/* Python Code Editor */}
                      <div className="grid gap-2 flex-1">
                        <Label>Codice Python</Label>
                        <Textarea
                          value={pythonCode}
                          onChange={(e) => setPythonCode(e.target.value)}
                          className="font-mono text-sm flex-1 min-h-[200px]"
                          placeholder={`# ${pythonOutputType === 'table' ? 'Ritorna un DataFrame Pandas' : pythonOutputType === 'variable' ? 'Ritorna un dizionario di variabili' : 'Ritorna una figura Matplotlib/Plotly'}\n`}
                        />
                      </div>

                      <div className="flex justify-between items-end mt-3 gap-4">
                        <div className="grid gap-2 flex-1">
                          <Label>Nome Risultato (Opzionale)</Label>
                          <Input
                            value={pythonResultName}
                            onChange={(e) => setPythonResultName(e.target.value)}
                            placeholder="Es. DataAnalysis (per riutilizzo)"
                          />
                        </div>

                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (!pythonCode) {
                              toast({ variant: 'destructive', title: "Errore", description: "Inserisci del codice Python prima di eseguire l'anteprima." });
                              return;
                            }

                            setPythonAgentStatus("Recupero Dati in corso...");
                            setPythonProgressStep(1);
                            isExecutingRef.current = true;

                            setTimeout(() => {
                              if (isExecutingRef.current) {
                                setPythonAgentStatus("Elaborazione Python...");
                                setPythonProgressStep(2);
                              }
                            }, 2000);

                            setTimeout(() => {
                              if (isExecutingRef.current) {
                                setPythonAgentStatus("Rendering Grafico...");
                                setPythonProgressStep(3);
                              }
                            }, 5000);

                            const dependencies: { tableName: string; connectorId?: string; query?: string; isPython?: boolean; pythonCode?: string; pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[] }[] = [];
                            if (availableInputTables) {
                              pythonSelectedPipelines.forEach(pName => {
                                const table = availableInputTables.find(t => t.name === pName);
                                if (table) {
                                  dependencies.push({
                                    tableName: pName,
                                    connectorId: table.connectorId,
                                    query: table.sqlQuery,
                                    isPython: table.isPython,
                                    pythonCode: table.pythonCode,
                                    pipelineDependencies: table.pipelineDependencies
                                  });
                                }
                              });
                            }

                            executePythonPreviewAction(pythonCode, pythonOutputType, {}, dependencies, pythonConnectorId).then((res: any) => {
                              isExecutingRef.current = false;
                              setPythonAgentStatus(null);
                              setPythonProgressStep(0);
                              if (res.success) {
                                setPythonPreviewResult({
                                  type: pythonOutputType,
                                  data: res.data,
                                  variables: res.variables,
                                  chartBase64: res.chartBase64,
                                  chartHtml: res.chartHtml,
                                  debugLogs: res.debugLogs
                                });
                                toast({ title: "Script Eseguito", description: "Anteprima pronta.", duration: 1000 });
                              } else {
                                toast({ variant: 'destructive', title: "Errore Python", description: res.error || "Errore sconosciuto" });
                              }
                            });
                          }}
                          disabled={!!pythonAgentStatus}
                        >
                          {pythonAgentStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Esegui Anteprima
                        </Button>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: AI Chatbot */}
                    <div className="order-1 lg:order-2">
                      <div className="bg-muted/30 border rounded-lg overflow-hidden flex flex-col h-[300px]">
                        <div className="bg-muted/50 p-2 px-3 border-b flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <Bot className="h-3.5 w-3.5" />
                            AI Python Assistant
                          </span>
                          {pythonAgentStatus && (
                            <div className="bg-background text-[10px] h-5 gap-1 flex items-center px-2 rounded-full border">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              {pythonAgentStatus.replace('...', '')}
                            </div>
                          )}
                        </div>

                        <ScrollArea className="flex-1 p-4" scrollbarAlwaysVisible>
                          <div className="flex flex-col gap-4">
                            {pythonChatHistory.length === 0 && (
                              <div className="flex gap-3">
                                <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                                  <Bot className="h-4 w-4 text-yellow-600" />
                                </div>
                                <div className="bg-white dark:bg-zinc-800 p-2.5 rounded-2xl rounded-tl-sm text-sm border shadow-sm max-w-[85%]">
                                  <p>Ciao! Posso generare script Python per {pythonOutputType === 'table' ? 'tabelle' : pythonOutputType === 'variable' ? 'variabili' : 'grafici'}. Dimmi cosa ti serve.</p>
                                </div>
                              </div>
                            )}

                            {pythonChatHistory?.map((msg, idx) => (
                              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''} group`}>
                                {msg.role === 'assistant' && (
                                  <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                                    <Bot className="h-4 w-4 text-yellow-600" />
                                  </div>
                                )}
                                <div className={`${msg.role === 'user'
                                  ? 'bg-primary text-primary-foreground rounded-br-sm'
                                  : 'bg-white dark:bg-zinc-800 rounded-tl-sm border shadow-sm'
                                  } p-2.5 rounded-2xl text-sm max-w-[85%] space-y-2 relative`}>
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  {msg.role === 'assistant' && msg.content.includes('```python') && (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="w-full h-7 text-[10px] gap-1 mt-2"
                                      onClick={() => {
                                        const match = msg.content.match(/```python\s*([\s\S]*?)```/);
                                        if (match && match[1]) {
                                          setPythonCode(match[1]);
                                          toast({ title: "Codice Inserito", description: "Lo script è stato aggiornato." });
                                        }
                                      }}
                                    >
                                      <ArrowDownToLine className="h-3 w-3" /> Inserisci nel Editor
                                    </Button>
                                  )}
                                </div>
                                {msg.role === 'user' && (
                                  <div className="flex flex-col gap-1 items-end">
                                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 text-white font-bold text-xs">
                                      U
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Torna a questo punto"
                                      onClick={() => {
                                        const newHistory = pythonChatHistory.slice(0, idx);
                                        setPythonChatHistory(newHistory);
                                        toast({ title: "Conversazione Riavvobolta", description: "Sei tornato a un punto precedente." });
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ))}

                            {pythonAgentStatus && (
                              <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2">
                                <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                                  <Bot className="h-4 w-4 text-yellow-600" />
                                </div>
                                <div className="bg-white dark:bg-zinc-800 p-2.5 rounded-2xl rounded-tl-sm text-sm border shadow-sm max-w-[85%] space-y-2">
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>{pythonAgentStatus}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </ScrollArea>

                        <MemoizedChatInput
                          placeholder={`Descrivi ${pythonOutputType === 'table' ? 'la tabella' : pythonOutputType === 'variable' ? 'le variabili' : 'il grafico'} da generare...`}
                          onSubmit={handlePythonSubmit}
                          disabled={!!pythonAgentStatus}
                          buttonText={pythonAgentStatus ? 'Elaborazione...' : 'Invia'}
                          buttonClassName="bg-yellow-600 hover:bg-yellow-700"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Visual Stepper - shown during execution */}
                  {pythonAgentStatus && (
                    <div className="flex items-center justify-center gap-8 py-4 mt-4 animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pythonProgressStep >= 1 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pythonProgressStep > 1 ? <Check className="h-5 w-5" /> : <Database className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pythonProgressStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>Recupero Dati</span>
                      </div>
                      <div className={`h-0.5 w-16 transition-all ${pythonProgressStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pythonProgressStep >= 2 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pythonProgressStep > 2 ? <Check className="h-5 w-5" /> : <Code className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pythonProgressStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>Elaborazione</span>
                      </div>
                      <div className={`h-0.5 w-16 transition-all ${pythonProgressStep >= 3 ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pythonProgressStep >= 3 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          <LineChart className="h-4 w-4" />
                        </div>
                        <span className={`text-[10px] font-medium ${pythonProgressStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>Rendering</span>
                      </div>
                    </div>
                  )}

                  {/* Preview Result - BELOW the two columns, max 200px */}
                  {pythonPreviewResult && (
                    <div className="border rounded-md overflow-hidden mt-4">
                      <div className="flex justify-between items-center bg-muted/50 p-2 border-b">
                        <span className="font-semibold text-xs flex items-center gap-2">
                          <Code className="h-3 w-3" />
                          Risultato Python ({pythonPreviewResult.type})
                        </span>
                        <div className="flex items-center gap-1">
                          {pythonPreviewResult.type === 'chart' && pythonPreviewResult.chartHtml && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] gap-1 px-2 font-bold"
                              onClick={() => {
                                const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pythonResultName || 'Chart Preview'}</title><style>body { margin: 0; padding: 20px; font-family: sans-serif; background-color: #f8fafc; }.chart-container { background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); padding: 20px; }</style></head><body><div class="chart-container">${pythonPreviewResult.chartHtml}</div></body></html>`;
                                const blob = new Blob([fullHtml], { type: 'text/html' });
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `${pythonResultName || 'chart_preview'}.html`;
                                link.click();
                                window.URL.revokeObjectURL(url);
                              }}
                            >
                              <Download className="h-3 w-3" /> Scarica HTML
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPythonPreviewResult(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      </div>
                      <div className="max-h-[200px] overflow-auto">
                        {pythonPreviewResult.type === 'table' && pythonPreviewResult.data && (
                          <DataTable data={pythonPreviewResult.data} columns={pythonPreviewResult.columns} />
                        )}
                        {pythonPreviewResult.type === 'variable' && pythonPreviewResult.variables && (
                          <pre className="p-3 text-xs">{JSON.stringify(pythonPreviewResult.variables, null, 2)}</pre>
                        )}
                        {pythonPreviewResult.type === 'chart' && (
                          <div className="bg-white dark:bg-zinc-950 h-[200px]">
                            {pythonPreviewResult.chartHtml ? (
                              <iframe
                                srcDoc={`<html><head><style>body { margin: 0; padding: 0; background: transparent; }</style></head><body>${pythonPreviewResult.chartHtml}</body></html>`}
                                className="w-full h-full border-none"
                                title="Interactive Chart"
                              />
                            ) : pythonPreviewResult.chartBase64 ? (
                              <img src={`data:image/png;base64,${pythonPreviewResult.chartBase64}`} alt="Chart Preview" className="max-w-full max-h-full block mx-auto" />
                            ) : (
                              <div className="p-8 text-center text-muted-foreground italic text-xs">Nessun grafico generato</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Debug Info */}
                  {pythonDebugLogs.length > 0 && (
                    <CollapsibleSection title="Debug Info & Timing" storageKey="debug-info">
                      <div className="bg-slate-950 text-slate-100 p-2 text-[10px] font-mono rounded overflow-auto max-h-40 border border-slate-800">
                        {pythonDebugLogs.map((log: string, i: number) => (
                          <div key={i} className="border-b border-slate-800/50 pb-0.5 mb-0.5 last:border-0">{log}</div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                </div>
              </CollapsibleSection>

              {/* Widget Builder Section */}
              <CollapsibleSection
                title="Widget Builder"
                count={widgetConfig ? 1 : 0}
                storageKey={`collapse-widget-builder-${treeId}-${nodePath}`}
                icon={BarChart3}
              >
                <div className="pt-3 h-[500px]">
                  {(pythonPreviewResult?.data || sqlPreviewData) ? (
                    <WidgetEditor
                      key={`widget-${JSON.stringify(pythonPreviewResult?.data || sqlPreviewData || []).substring(0, 100)}`}
                      data={pythonPreviewResult?.data || sqlPreviewData || []}
                      initialConfig={widgetConfig}
                      onSave={(config) => {
                        setWidgetConfig(config);
                      }}
                      availableSources={[
                        // Current Node Sources with dynamic names
                        ...(sqlQuery ? [{
                          id: 'sql',
                          name: sqlResultName ? `${sqlResultName} (SQL Corrente)` : 'Risultato SQL (Corrente)',
                          type: 'current-sql' as const
                        }] : []),
                        ...(pythonCode ? [{
                          id: 'python',
                          name: pythonResultName ? `${pythonResultName} (Python Corrente)` : 'Risultato Python (Corrente)',
                          type: 'current-python' as const
                        }] : []),
                        // Parent Sources
                        ...(availableInputTables || []).map(t => ({ id: t.name, name: `${t.name} (Padre)`, type: 'parent-table' as const }))
                      ]}
                      onRefreshData={handleRefreshWidgetData}
                      isRefreshing={isWidgetRefreshing}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground border-2 border-dashed rounded-lg p-6 text-center">
                      <BarChart3 className="h-10 w-10 mb-2 opacity-50" />
                      {pythonOutputType === 'chart' && pythonPreviewResult ? (
                        <div className="max-w-md space-y-2">
                          <p className="font-semibold text-foreground">Modalità Grafico Python rilevata</p>
                          <p>Il Widget Builder serve per creare grafici <strong>interattivi React</strong> partendo da dati grezzi.</p>
                          <p>Per usarlo, cambia il "Tipo Output" dello script Python in <strong>Tabella</strong> e riesegui l'anteprima. Il Widget Builder userà i dati della tabella per costruire il grafico.</p>
                        </div>
                      ) : (
                        <p>Esegui un'anteprima (SQL o Python "Tabella") per configurare il widget.</p>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* SQL Export Section */}
              {true && (
                <CollapsibleSection
                  title="Esporta in Database SQL"
                  count={sqlExportEnabled ? sqlExportSourceTables.length : 0}
                  storageKey={`collapse-sql-export-${treeId}-${nodePath}`}
                  icon={Database}
                >
                  <div className="grid gap-4 pt-3">

                    {/* Source Tables Selection */}
                    <div className="grid gap-2">
                      <Label>Tabelle da Esportare</Label>
                      <div className="flex flex-wrap gap-2">
                        {/* Parent tables */}
                        {availableInputTables?.map(t => (
                          <div key={t.name} className="flex items-center space-x-2 bg-white dark:bg-zinc-800 p-1.5 px-2.5 rounded-full border shadow-sm">
                            <Check
                              className={`h-3 w-3 cursor-pointer ${sqlExportSourceTables.includes(t.name) ? 'text-emerald-600' : 'text-muted-foreground/30'}`}
                              onClick={() => {
                                if (sqlExportSourceTables.includes(t.name)) {
                                  setSqlExportSourceTables(prev => prev.filter(p => p !== t.name));
                                } else {
                                  setSqlExportSourceTables(prev => [...prev, t.name]);
                                }
                              }}
                            />
                            <Label className="text-xs cursor-pointer" onClick={() => {
                              if (sqlExportSourceTables.includes(t.name)) {
                                setSqlExportSourceTables(prev => prev.filter(p => p !== t.name));
                              } else {
                                setSqlExportSourceTables(prev => [...prev, t.name]);
                              }
                            }}>{t.name} ({t.isPython ? 'Python' : 'SQL'})</Label>
                          </div>
                        ))}
                        {/* Current SQL result */}
                        {sqlResultName && (
                          <div className="flex items-center space-x-2 bg-white dark:bg-zinc-800 p-1.5 px-2.5 rounded-full border shadow-sm">
                            <Check
                              className={`h-3 w-3 cursor-pointer ${sqlExportSourceTables.includes(sqlResultName) ? 'text-emerald-600' : 'text-muted-foreground/30'}`}
                              onClick={() => {
                                if (sqlExportSourceTables.includes(sqlResultName)) {
                                  setSqlExportSourceTables(prev => prev.filter(p => p !== sqlResultName));
                                } else {
                                  setSqlExportSourceTables(prev => [...prev, sqlResultName]);
                                }
                              }}
                            />
                            <Label className="text-xs cursor-pointer" onClick={() => {
                              if (sqlExportSourceTables.includes(sqlResultName)) {
                                setSqlExportSourceTables(prev => prev.filter(p => p !== sqlResultName));
                              } else {
                                setSqlExportSourceTables(prev => [...prev, sqlResultName]);
                              }
                            }}>{sqlResultName} (Questo nodo)</Label>
                          </div>
                        )}
                        {/* Current Python result if table */}
                        {pythonResultName && pythonOutputType === 'table' && (
                          <div className="flex items-center space-x-2 bg-white dark:bg-zinc-800 p-1.5 px-2.5 rounded-full border shadow-sm">
                            <Check
                              className={`h-3 w-3 cursor-pointer ${sqlExportSourceTables.includes(pythonResultName) ? 'text-emerald-600' : 'text-muted-foreground/30'}`}
                              onClick={() => {
                                if (sqlExportSourceTables.includes(pythonResultName)) {
                                  setSqlExportSourceTables(prev => prev.filter(p => p !== pythonResultName));
                                } else {
                                  setSqlExportSourceTables(prev => [...prev, pythonResultName]);
                                }
                              }}
                            />
                            <Label className="text-xs cursor-pointer" onClick={() => {
                              if (sqlExportSourceTables.includes(pythonResultName)) {
                                setSqlExportSourceTables(prev => prev.filter(p => p !== pythonResultName));
                              } else {
                                setSqlExportSourceTables(prev => [...prev, pythonResultName]);
                              }
                            }}>{pythonResultName} (Python)</Label>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Target Connector Selection */}
                    <div className="grid gap-2">
                      <Label>Database Destinazione</Label>
                      <Select value={sqlExportTargetConnectorId} onValueChange={setSqlExportTargetConnectorId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona un Database SQL..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sqlConnectors.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Target Table Name */}
                    <div className="grid gap-2">
                      <Label>Nome Tabella Destinazione</Label>
                      <Input
                        value={sqlExportTargetTableName}
                        onChange={(e) => setSqlExportTargetTableName(e.target.value)}
                        placeholder="Es. ExportedDeals"
                      />
                      <p className="text-[10px] text-muted-foreground">La tabella verrà creata automaticamente se non esiste.</p>
                    </div>

                    {/* Execute Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={sqlExportStatus === 'running' || sqlExportSourceTables.length === 0 || !sqlExportTargetConnectorId || !sqlExportTargetTableName}
                      onClick={async () => {
                        setSqlExportStatus('running');
                        setSqlExportError(null);
                        setSqlExportRowCount(null);

                        try {
                          // For now, we'll use sqlPreviewData or pythonPreviewResult as source
                          // In a full implementation, we'd fetch data for each selected table
                          let sourceData: any[] = [];

                          for (const tableName of sqlExportSourceTables) {
                            // 1. Check Current Node Results (Cache)
                            if (tableName === sqlResultName && sqlPreviewData) {
                              sourceData = sqlPreviewData;
                              break;
                            }
                            if (tableName === pythonResultName && pythonPreviewResult?.data) {
                              sourceData = pythonPreviewResult.data;
                              break;
                            }

                            // 1b. Current Node - Fetch on demand if no cache
                            if (tableName === sqlResultName && sqlQuery && !sqlPreviewData) {
                              toast({ title: "Esecuzione SQL...", description: `Recupero dati da ${tableName}...` });
                              // Build pipelineDeps for current node
                              const pipelineDeps = availableInputTables
                                ?.filter(t => t.sqlQuery || (t.isPython && t.pythonCode))
                                .map(table => ({
                                  tableName: table.name,
                                  query: table.sqlQuery || undefined,
                                  isPython: table.isPython,
                                  pythonCode: table.pythonCode,
                                  connectorId: table.connectorId,
                                  pipelineDependencies: table.pipelineDependencies
                                })) || [];
                              const res = await executeSqlPreviewAction(sqlQuery, sqlConnectorId, pipelineDeps);
                              if (res.data) {
                                sourceData = res.data;
                                break;
                              } else {
                                throw new Error(`Errore recupero dati SQL da ${tableName}: ${res.error}`);
                              }
                            }
                            if (tableName === pythonResultName && pythonCode && !pythonPreviewResult?.data) {
                              toast({ title: "Elaborazione Python...", description: `Esecuzione script per ${tableName}...` });
                              const pipelineDeps = availableInputTables
                                ?.filter(t => t.sqlQuery || (t.isPython && t.pythonCode))
                                .map(table => ({
                                  tableName: table.name,
                                  query: table.sqlQuery || undefined,
                                  isPython: table.isPython,
                                  pythonCode: table.pythonCode,
                                  connectorId: table.connectorId,
                                  pipelineDependencies: table.pipelineDependencies
                                })) || [];
                              const res = await executePythonPreviewAction(pythonCode, 'table', {}, pipelineDeps, pythonConnectorId);
                              if (res.success && Array.isArray(res.data)) {
                                sourceData = res.data;
                                break;
                              } else {
                                throw new Error(`Errore recupero dati Python da ${tableName}: ${res.error}`);
                              }
                            }

                            // 2. Check Ancestor Tables (Fetch on demand)
                            const ancestorTable = availableInputTables?.find(t => t.name === tableName);
                            if (ancestorTable) {
                              // Python Ancestor
                              if (ancestorTable.isPython && ancestorTable.pythonCode) {
                                toast({ title: "Elaborazione Python...", description: `Esecuzione script per ${tableName}...` });
                                // Use executePythonPreviewAction to fetch data
                                const res = await executePythonPreviewAction(
                                  ancestorTable.pythonCode,
                                  'table',
                                  {},
                                  (ancestorTable.pipelineDependencies || []).map(d => ({ tableName: d.tableName, query: d.query })),
                                  ancestorTable.connectorId
                                );
                                if (res.success && Array.isArray(res.data)) {
                                  sourceData = res.data;
                                  break;
                                } else {
                                  throw new Error(`Errore recupero dati Python da ${tableName}: ${res.error}`);
                                }
                              }
                              // SQL Ancestor
                              else if (ancestorTable.sqlQuery) {
                                toast({ title: "Esecuzione SQL...", description: `Recupero dati da ${tableName}...` });
                                const res = await executeSqlPreviewAction(
                                  ancestorTable.sqlQuery,
                                  ancestorTable.connectorId || '',
                                  ancestorTable.pipelineDependencies || []
                                );
                                if (res.data) {
                                  sourceData = res.data;
                                  break;
                                } else {
                                  throw new Error(`Errore recupero dati SQL da ${tableName}: ${res.error}`);
                                }
                              }
                            }
                          }

                          if (sourceData.length === 0) {
                            setSqlExportError('Nessun dato disponibile. Esegui prima l\'anteprima della query o dello script.');
                            setSqlExportStatus('error');
                            return;
                          }

                          const result = await exportTableToSqlAction(
                            sqlExportTargetConnectorId,
                            sqlExportTargetTableName,
                            sourceData,
                            true
                          );

                          if (result.success) {
                            setSqlExportStatus('success');
                            setSqlExportRowCount(result.rowsInserted || 0);
                            toast({
                              title: "Esportazione completata",
                              description: `${result.rowsInserted} righe inserite in ${sqlExportTargetTableName}`,
                            });
                          } else {
                            setSqlExportStatus('error');
                            setSqlExportError(result.error || 'Errore sconosciuto');
                          }
                        } catch (e: any) {
                          setSqlExportStatus('error');
                          setSqlExportError(e.message || 'Errore durante l\'esportazione');
                        }
                      }}
                    >
                      {sqlExportStatus === 'running' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Esportazione in corso...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Salva in Database
                        </>
                      )}
                    </Button>

                    {/* Status Messages */}
                    {sqlExportStatus === 'success' && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-300">
                        ✅ Esportazione completata! {sqlExportRowCount} righe inserite.
                      </div>
                    )}
                    {sqlExportStatus === 'error' && sqlExportError && (
                      <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                        ❌ Errore: {sqlExportError}
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}

              {/* Email Action Section */}
              {true && (
                <CollapsibleSection
                  title="Invio Email"
                  count={emailConfig.enabled ? 1 : 0}
                  storageKey={`collapse-email-${treeId}-${nodePath}`}
                  icon={Mail}
                >
                  <div className="grid gap-4 pt-3">

                    {/* SMTP Connector Selection */}
                    <div className="grid gap-2">
                      <Label>Connettore SMTP</Label>
                      <Select
                        value={emailConfig.connectorId}
                        onValueChange={(v) => setEmailConfig(prev => ({ ...prev, connectorId: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona un connettore SMTP..." />
                        </SelectTrigger>
                        <SelectContent>
                          {smtpConnectors.length === 0 ? (
                            <SelectItem value="none" disabled>Nessun connettore SMTP configurato</SelectItem>
                          ) : (
                            smtpConnectors.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {smtpConnectors.length === 0 && (
                        <p className="text-[10px] text-amber-600">⚠️ Configura un connettore SMTP nelle Impostazioni per abilitare l'invio email.</p>
                      )}
                    </div>

                    {/* Recipients */}
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Label>A (Destinatari)</Label>
                        <Input
                          value={emailConfig.to}
                          onChange={(e) => setEmailConfig(prev => ({ ...prev, to: e.target.value }))}
                          placeholder="email@esempio.com, altro@esempio.com"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-2">
                          <Label>CC</Label>
                          <Input
                            value={emailConfig.cc || ''}
                            onChange={(e) => setEmailConfig(prev => ({ ...prev, cc: e.target.value }))}
                            placeholder="copia@esempio.com"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>CCN (BCC)</Label>
                          <Input
                            value={emailConfig.bcc || ''}
                            onChange={(e) => setEmailConfig(prev => ({ ...prev, bcc: e.target.value }))}
                            placeholder="nascosto@esempio.com"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Subject */}
                    <div className="grid gap-2">
                      <Label>Oggetto</Label>
                      <Input
                        value={emailConfig.subject}
                        onChange={(e) => setEmailConfig(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Oggetto dell'email..."
                      />
                    </div>

                    {/* Body - Rich Text Editor */}
                    <Label>Corpo Email & Allegati</Label>
                    <div className="flex flex-col md:flex-row gap-4 h-[500px]">
                      {/* Editor */}
                      <div className="flex-1 min-w-0 flex flex-col">
                        <EmailBodyEditor
                          ref={editorRef}
                          value={emailConfig.body}
                          onChange={(html) => setEmailConfig(prev => ({ ...prev, body: html }))}
                          availableTables={[
                            ...(availableInputTables?.map(t => ({ name: t.name })) || []),
                            ...(sqlResultName ? [{ name: sqlResultName }] : [])
                          ]}
                          availableCharts={pythonResultName && pythonOutputType === 'chart' ? [{ name: pythonResultName }] : []}
                          availableAttachments={[
                            ...(availableParentMedia?.map(m => ({ filename: m.name || m.url.split('/').pop() || 'file' })) || []),
                            ...media.map(m => ({ filename: m.name || m.url.split('/').pop() || 'file' }))
                          ]}
                        />
                      </div>

                      {/* Sidebar Resources */}
                      <div className="w-full md:w-[300px] bg-muted/10 border rounded-lg flex flex-col overflow-hidden shadow-sm">
                        <div className="p-2 border-b bg-muted/30">
                          <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Risorse Disponibili</h4>
                        </div>

                        <div className="p-3 overflow-y-auto space-y-5 flex-1">

                          {/* Tables */}
                          {((availableInputTables && availableInputTables.length > 0) || sqlResultName) && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold flex items-center gap-1.5 text-primary"><Database className="h-3.5 w-3.5" /> Tabelle</p>
                              <div className="space-y-1.5">
                                {availableInputTables?.map((table) => (
                                  <div key={table.name} className="bg-background border rounded p-2 text-xs hover:border-primary/50 transition-colors">
                                    <div className="font-medium mb-1.5 truncate" title={table.name}>{table.name}</div>
                                    <div className="flex items-center justify-between gap-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 text-[10px] px-2 h-6"
                                        onClick={() => editorRef.current?.insertPlaceholder('TABELLA', table.name)}
                                      >
                                        <Download className="h-3 w-3 mr-1" /> Inserisci
                                      </Button>
                                      <label className="flex items-center gap-1.5 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted">
                                        <input
                                          type="checkbox"
                                          checked={safeEmailAttachments.tablesAsExcel.includes(table.name)}
                                          onChange={(e) => {
                                            setEmailConfig(prev => ({
                                              ...prev,
                                              attachments: {
                                                ...prev.attachments,
                                                tablesAsExcel: e.target.checked
                                                  ? [...prev.attachments.tablesAsExcel, table.name]
                                                  : prev.attachments.tablesAsExcel.filter(t => t !== table.name)
                                              }
                                            }));
                                          }}
                                          className="rounded w-3.5 h-3.5"
                                        />
                                        <span className="text-muted-foreground text-[10px]">Excel</span>
                                      </label>
                                    </div>
                                  </div>
                                ))}
                                {sqlResultName && (
                                  <div className="bg-background border rounded p-2 text-xs hover:border-primary/50 transition-colors border-l-4 border-l-primary/30">
                                    <div className="font-medium mb-1.5 truncate" title={sqlResultName}>Output: {sqlResultName}</div>
                                    <div className="flex items-center justify-between gap-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 text-[10px] px-2"
                                        onClick={() => editorRef.current?.insertPlaceholder('TABELLA', sqlResultName)}
                                      >
                                        <Download className="h-3 w-3 mr-1" /> Inserisci
                                      </Button>
                                      <label className="flex items-center gap-1.5 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted">
                                        <input
                                          type="checkbox"
                                          checked={safeEmailAttachments.tablesAsExcel.includes(sqlResultName)}
                                          onChange={(e) => {
                                            setEmailConfig(prev => ({
                                              ...prev,
                                              attachments: {
                                                ...prev.attachments,
                                                tablesAsExcel: e.target.checked
                                                  ? [...prev.attachments.tablesAsExcel, sqlResultName]
                                                  : prev.attachments.tablesAsExcel.filter(t => t !== sqlResultName)
                                              }
                                            }));
                                          }}
                                          className="rounded w-3.5 h-3.5"
                                        />
                                        <span className="text-muted-foreground text-[10px]">Excel</span>
                                      </label>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Python Outputs */}
                          {pythonResultName && (
                            <div className="space-y-2 pt-2 border-t">
                              <p className="text-xs font-semibold flex items-center gap-1.5 text-purple-600"><Code className="h-3.5 w-3.5" /> Output Python</p>
                              <div className="bg-background border rounded p-2 text-xs hover:border-purple-300 transition-colors border-l-4 border-l-purple-500/30">
                                <div className="font-medium mb-1.5 truncate" title={pythonResultName}>
                                  {pythonResultName} <span className="opacity-70 text-[10px]">({pythonOutputType})</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 overflow-x-auto">
                                  {pythonOutputType === 'chart' && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="h-6 text-[10px] px-2 flex-shrink-0"
                                      onClick={() => editorRef.current?.insertPlaceholder('GRAFICO', pythonResultName)}
                                    >
                                      <BarChart3 className="h-3 w-3 mr-1" /> Inserisci
                                    </Button>
                                  )}
                                  <label className="flex items-center gap-1.5 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
                                    <input
                                      type="checkbox"
                                      checked={safeEmailAttachments.pythonOutputsAsAttachment.includes(pythonResultName)}
                                      onChange={(e) => {
                                        setEmailConfig(prev => ({
                                          ...prev,
                                          attachments: {
                                            ...prev.attachments,
                                            pythonOutputsAsAttachment: e.target.checked
                                              ? [...prev.attachments.pythonOutputsAsAttachment, pythonResultName]
                                              : prev.attachments.pythonOutputsAsAttachment.filter(t => t !== pythonResultName)
                                          }
                                        }));
                                      }}
                                      className="rounded w-3.5 h-3.5"
                                    />
                                    <span className="text-muted-foreground text-[10px]">Allega File</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Media / Attachments (Parents + Current) */}
                          {/* Media / Attachments (Parents + Current) */}
                          {(availableParentMedia?.length > 0 || media?.length > 0) && (
                            <div className="space-y-2 pt-2 border-t">
                              <p className="text-xs font-semibold flex items-center gap-1.5 text-blue-600"><Paperclip className="h-3.5 w-3.5" /> Media & Allegati</p>
                              <div className="space-y-1.5">
                                {[...(availableParentMedia || []), ...(media || [])].map((item, idx) => {
                                  const itemName = item.name || item.url.split('/').pop() || 'file';
                                  return (
                                    <div key={idx} className="bg-background border rounded p-2 text-xs hover:border-blue-300 transition-colors">
                                      <div className="flex items-center gap-1.5 truncate mb-1.5">
                                        {item.type === 'video' ? <Video className="h-3 w-3 text-blue-500" /> : <ImageIcon className="h-3 w-3 text-pink-500" />}
                                        <span className="truncate" title={itemName}>{itemName}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2 overflow-x-auto">
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          className="h-6 text-[10px] px-2 flex-shrink-0"
                                          onClick={() => editorRef.current?.insertPlaceholder('ALLEGATO', itemName)}
                                        >
                                          <Download className="h-3 w-3 mr-1" /> Inserisci
                                        </Button>
                                        <label className="flex items-center gap-1.5 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={safeEmailAttachments.mediaAsAttachment.includes(itemName)}
                                            onChange={(e) => {
                                              setEmailConfig(prev => ({
                                                ...prev,
                                                attachments: {
                                                  ...prev.attachments,
                                                  mediaAsAttachment: e.target.checked
                                                    ? [...(prev.attachments?.mediaAsAttachment || []), itemName]
                                                    : (prev.attachments?.mediaAsAttachment || []).filter(t => t !== itemName)
                                                }
                                              }));
                                            }}
                                            className="rounded w-3.5 h-3.5"
                                          />
                                          <span className="text-muted-foreground text-[10px]">Allega</span>
                                        </label>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Links */}
                          {(availableParentLinks.length > 0 || links.length > 0) && (
                            <div className="space-y-2 pt-2 border-t">
                              <p className="text-xs font-semibold flex items-center gap-1.5 text-indigo-600"><LinkIcon className="h-3.5 w-3.5" /> Link</p>
                              <div className="space-y-1.5">
                                {[...(availableParentLinks || []), ...(links || [])].map((link, idx) => (
                                  <div key={idx} className="bg-background border rounded p-2 text-xs flex items-center justify-between hover:border-indigo-300 transition-colors">
                                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                      <span className="truncate" title={link.name}>{link.name}</span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 hover:bg-indigo-100 text-indigo-600"
                                      title="Inserisci testo link"
                                      onClick={() => editorRef.current?.insertPlaceholder('LINK', link.name)}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Triggers */}
                          {(availableParentTriggers.length > 0 || triggers.length > 0) && (
                            <div className="space-y-2 pt-2 border-t">
                              <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-600"><Zap className="h-3.5 w-3.5" /> Trigger</p>
                              <div className="space-y-1.5">
                                {[...(availableParentTriggers || []), ...(triggers || [])].map((trigger, idx) => (
                                  <div key={idx} className="bg-background border rounded p-2 text-xs flex items-center justify-between hover:border-amber-300 transition-colors">
                                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                      <span className="truncate" title={trigger.name}>{trigger.name}</span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 hover:bg-amber-100 text-amber-600"
                                      title="Inserisci trigger"
                                      onClick={() => editorRef.current?.insertPlaceholder('TRIGGER', trigger.name)}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Empty State */}
                          {(!availableInputTables || availableInputTables.length === 0) && !sqlResultName && !pythonResultName && media.length === 0 && availableParentMedia.length === 0 && availableParentLinks.length === 0 && availableParentTriggers.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground px-4">
                              <p className="text-xs italic">Nessuna risorsa disponibile.</p>
                              <p className="text-[10px] opacity-70 mt-1">Configura tabelle, output Python o aggiungi media al nodo per vederli qui.</p>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>

                    {/* Test Email Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={!emailConfig.connectorId || !emailConfig.to || !emailConfig.subject || isSendingTestEmail}
                      onClick={async () => {
                        setIsSendingTestEmail(true);
                        try {
                          // Build selectedTables from user selections
                          const selectedTables: Array<{ name: string; query: string; inBody: boolean; asExcel: boolean; pipelineDependencies?: Array<{ tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }> }> = [];

                          // Build selectedPythonOutputs from user selections
                          const selectedPythonOutputs: Array<{
                            name: string;
                            code: string;
                            outputType: 'table' | 'variable' | 'chart';
                            connectorId?: string;
                            inBody: boolean;
                            asAttachment: boolean;
                            dependencies?: Array<{ tableName: string; connectorId?: string; query?: string; pipelineDependencies?: any[] }>;
                          }> = [];

                          // Extract table names referenced in placeholders from email body
                          const bodyContent = emailConfig.body || '';
                          const placeholderTableMatches = bodyContent.match(/\{\{TABELLA:([^}]+)\}\}/g) || [];
                          const placeholderTableNames = placeholderTableMatches.map(m => m.replace(/\{\{TABELLA:|}\}/g, ''));

                          // Add tables from parent nodes separating SQL from Python
                          if (availableInputTables && availableInputTables.length > 0) {
                            console.log('[EMAIL DEBUG] Available Tables:', availableInputTables);
                            for (const table of availableInputTables) {
                              console.log(`[EMAIL DEBUG] Processing table: ${table.name}, isPython: ${table.isPython}, code: ${!!table.pythonCode}`);
                              const inBody = safeEmailAttachments.tablesInBody.includes(table.name) || placeholderTableNames.includes(table.name);
                              const asExcel = safeEmailAttachments.tablesAsExcel.includes(table.name);

                              if (inBody || asExcel) {
                                if (table.isPython && table.pythonCode) {
                                  // It's a Python table (e.g. from a previous node) -> Treat as Python Output
                                  const dependencies: Array<{ tableName: string; connectorId?: string; query?: string; pipelineDependencies?: any[] }> = [];
                                  if (table.pipelineDependencies) {
                                    table.pipelineDependencies.forEach(dep => {
                                      dependencies.push({
                                        tableName: dep.tableName,
                                        connectorId: dep.connectorId,
                                        query: dep.query,
                                        pipelineDependencies: [] // recursive deps flattened/handled by backend usually
                                      });
                                    });
                                  }

                                  selectedPythonOutputs.push({
                                    name: table.name,
                                    code: table.pythonCode,
                                    outputType: 'table',
                                    connectorId: table.connectorId,
                                    inBody,
                                    asAttachment: asExcel, // Map 'asExcel' to 'asAttachment' for Python
                                    dependencies: dependencies.length > 0 ? dependencies : undefined
                                  });
                                } else {
                                  // It's a standard SQL table
                                  selectedTables.push({
                                    name: table.name,
                                    query: table.sqlQuery || `SELECT * FROM ${table.name}`,
                                    inBody,
                                    asExcel,
                                    pipelineDependencies: table.pipelineDependencies
                                  });
                                }
                              }
                            }
                          }

                          // Add current node SQL output if selected OR referenced in placeholder
                          if (sqlResultName && sqlQuery) {
                            const inBody = safeEmailAttachments.tablesInBody.includes(sqlResultName) || placeholderTableNames.includes(sqlResultName);
                            const asExcel = safeEmailAttachments.tablesAsExcel.includes(sqlResultName);
                            if (inBody || asExcel) {
                              // Build pipelineDependencies from selectedPipelines and availableInputTables
                              const currentNodeDeps: Array<{ tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string; pipelineDependencies?: any[] }> = [];
                              if (availableInputTables && selectedPipelines.length > 0) {
                                for (const pName of selectedPipelines) {
                                  const sourceTable = availableInputTables.find(t => t.name === pName);
                                  if (sourceTable) {
                                    currentNodeDeps.push({
                                      tableName: sourceTable.name,
                                      query: sourceTable.sqlQuery,
                                      isPython: sourceTable.isPython,
                                      pythonCode: sourceTable.pythonCode,
                                      connectorId: sourceTable.connectorId,
                                      pipelineDependencies: sourceTable.pipelineDependencies
                                    });
                                  }
                                }
                              }
                              console.log('[EMAIL DEBUG] Current node SQL deps:', currentNodeDeps.map(d => ({ name: d.tableName, isPython: d.isPython })));

                              selectedTables.push({
                                name: sqlResultName,
                                query: sqlQuery,
                                inBody,
                                asExcel,
                                pipelineDependencies: currentNodeDeps.length > 0 ? currentNodeDeps : undefined
                              });
                            }
                          }

                          // Build selectedPythonOutputs from user selections


                          // Extract chart names referenced in placeholders from email body
                          const placeholderChartMatches = bodyContent.match(/\{\{GRAFICO:([^}]+)\}\}/g) || [];
                          const placeholderChartNames = placeholderChartMatches.map(m => m.replace(/\{\{GRAFICO:|}\}/g, ''));

                          // Add current node Python output if selected OR referenced in placeholder
                          if (pythonResultName && pythonCode) {
                            const inBody = safeEmailAttachments.pythonOutputsInBody.includes(pythonResultName) || placeholderChartNames.includes(pythonResultName);
                            const asAttachment = safeEmailAttachments.pythonOutputsAsAttachment.includes(pythonResultName);
                            if (inBody || asAttachment) {
                              // Prepare dependencies for Python execution
                              // This includes BOTH ancestor tables AND the current node's SQL output (if any)
                              const dependencies: Array<{ tableName: string; connectorId?: string; query?: string; isPython?: boolean; pythonCode?: string; pipelineDependencies?: any[] }> = [];

                              // Add ancestor table dependencies from pythonSelectedPipelines
                              if (availableInputTables) {
                                pythonSelectedPipelines.forEach(pName => {
                                  const table = availableInputTables.find(t => t.name === pName);
                                  if (table) {
                                    dependencies.push({
                                      tableName: pName,
                                      connectorId: table.connectorId,
                                      query: table.sqlQuery,
                                      isPython: table.isPython,
                                      pythonCode: table.pythonCode,
                                      pipelineDependencies: table.pipelineDependencies
                                    });
                                  }
                                });
                              }

                              // CRITICAL: If the current node has BOTH SQL and Python output,
                              // the Python (chart) likely depends on the SQL output (table).
                              // Include the current node's SQL as a dependency with its full chain.
                              if (sqlResultName && sqlQuery) {
                                // Build the SQL's dependencies (same as we do for selectedTables)
                                const sqlDeps: Array<{ tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }> = [];
                                if (availableInputTables && selectedPipelines.length > 0) {
                                  for (const pName of selectedPipelines) {
                                    const sourceTable = availableInputTables.find(t => t.name === pName);
                                    if (sourceTable) {
                                      sqlDeps.push({
                                        tableName: sourceTable.name,
                                        query: sourceTable.sqlQuery,
                                        isPython: sourceTable.isPython,
                                        pythonCode: sourceTable.pythonCode,
                                        connectorId: sourceTable.connectorId
                                      });
                                    }
                                  }
                                }

                                // Add the current node's SQL output as a dependency for the Python chart
                                dependencies.push({
                                  tableName: sqlResultName,
                                  connectorId: sqlConnectorId || sqlExportTargetConnectorId,
                                  query: sqlQuery,
                                  isPython: false,
                                  pipelineDependencies: sqlDeps.length > 0 ? sqlDeps : undefined
                                });
                                console.log('[EMAIL DEBUG] Added current SQL as Python dep:', { sqlResultName, sqlDeps: sqlDeps.map(d => d.tableName) });
                              }

                              console.log('[EMAIL DEBUG] Python chart dependencies:', dependencies.map(d => ({ name: d.tableName, isPython: d.isPython })));

                              selectedPythonOutputs.push({
                                name: pythonResultName,
                                code: pythonCode,
                                outputType: pythonOutputType,
                                connectorId: pythonConnectorId !== 'none' ? pythonConnectorId : undefined,
                                inBody,
                                asAttachment,
                                dependencies: dependencies.length > 0 ? dependencies : undefined
                              });
                            }
                          }

                          console.log('[FRONTEND EMAIL DEBUG] selectedPythonOutputs:', selectedPythonOutputs);
                          console.log('[FRONTEND EMAIL DEBUG] pythonResultName:', pythonResultName, 'pythonCode length:', pythonCode?.length || 0);

                          if (selectedTables.length === 0 && selectedPythonOutputs.length === 0 && !emailConfig.body) {
                            toast({ variant: 'destructive', title: 'Nessun contenuto', description: 'Aggiungi del testo nel corpo o seleziona almeno una tabella/output Python.' });
                            setIsSendingTestEmail(false);
                            return;
                          }

                          // Infer SQL Connector ID if not explicitly set
                          // Priority: 1) current node's SQL connector, 2) sqlExportTargetConnectorId (DB dest), 3) ancestor tables
                          let effectiveSqlConnectorId = '';
                          console.log('[EMAIL DEBUG] sqlConnectorId from current node:', sqlConnectorId);
                          console.log('[EMAIL DEBUG] sqlExportTargetConnectorId (DB dest):', sqlExportTargetConnectorId);
                          console.log('[EMAIL DEBUG] sqlResultName from current node:', sqlResultName);
                          console.log('[EMAIL DEBUG] selectedTables:', selectedTables.map(t => ({ name: t.name })));
                          console.log('[EMAIL DEBUG] availableInputTables:', availableInputTables?.map(t => ({ name: t.name, connectorId: t.connectorId, isPython: t.isPython })));

                          if (selectedTables.length > 0) {
                            for (const t of selectedTables) {
                              console.log(`[EMAIL DEBUG] Looking for connector for table "${t.name}"...`);

                              // First, check if this is the CURRENT NODE's SQL result
                              if (t.name === sqlResultName) {
                                // Priority 1: Use sqlConnectorId (the SQL query execution connector)
                                if (sqlConnectorId) {
                                  effectiveSqlConnectorId = sqlConnectorId;
                                  console.log('[EMAIL DEBUG] Using CURRENT NODE sqlConnectorId:', effectiveSqlConnectorId, 'for table:', t.name);
                                  break;
                                }
                                // Priority 2: Use sqlExportTargetConnectorId (the Database Destinazione selector)
                                if (sqlExportTargetConnectorId) {
                                  effectiveSqlConnectorId = sqlExportTargetConnectorId;
                                  console.log('[EMAIL DEBUG] Using CURRENT NODE sqlExportTargetConnectorId (DB dest):', effectiveSqlConnectorId, 'for table:', t.name);
                                  break;
                                }
                              }

                              // Priority 3: Look in ancestor tables
                              if (availableInputTables) {
                                const sourceTable = availableInputTables.find(at => at.name === t.name);
                                console.log(`[EMAIL DEBUG] Found in ancestors for "${t.name}":`, sourceTable ? { name: sourceTable.name, connectorId: sourceTable.connectorId } : 'NOT FOUND');
                                if (sourceTable && sourceTable.connectorId) {
                                  effectiveSqlConnectorId = sourceTable.connectorId;
                                  console.log('[EMAIL DEBUG] Using ANCESTOR connector:', effectiveSqlConnectorId, 'from table:', t.name);
                                  break;
                                }
                              }
                            }
                          }
                          console.log('[EMAIL DEBUG] Final effectiveSqlConnectorId:', effectiveSqlConnectorId);

                          const result = await sendTestEmailWithDataAction({
                            connectorId: emailConfig.connectorId,
                            sqlConnectorId: effectiveSqlConnectorId,
                            to: emailConfig.to,
                            cc: emailConfig.cc,
                            bcc: emailConfig.bcc,
                            subject: emailConfig.subject,
                            bodyHtml: bodyContent,
                            selectedTables,
                            selectedPythonOutputs,
                            availableMedia: [...availableParentMedia, ...media],
                            availableLinks: [...availableParentLinks, ...links],
                            availableTriggers: [...availableParentTriggers, ...triggers],
                            mediaAttachments: safeEmailAttachments.mediaAsAttachment
                          });

                          if (result.success) {
                            toast({ title: 'Email di test inviata!', description: result.message });
                          } else {
                            toast({ variant: 'destructive', title: 'Errore invio', description: result.error });
                          }
                        } catch (e: any) {
                          toast({ variant: 'destructive', title: 'Errore', description: e.message });
                        } finally {
                          setIsSendingTestEmail(false);
                        }
                      }}
                    >
                      {isSendingTestEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Invia Email di Test
                    </Button>
                  </div>
                </CollapsibleSection>
              )}
            </div>

          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={componentIsSaving}>Annulla</Button>
            <Button onClick={handleSaveClick} disabled={!canSave}>
              {componentIsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva Modifiche
            </Button>
          </DialogFooter>
        </DialogContent >
      </Dialog >

      {/* Media Preview Dialog */}
      < Dialog open={!!previewingMedia
      } onOpenChange={(open) => !open && setPreviewingMedia(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Anteprima Media</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center bg-muted/50 rounded-md overflow-hidden">
            {previewingMedia?.type === 'image' && (
              <Image src={previewingMedia.url} alt="Anteprima" width={1000} height={800} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
            )}
            {previewingMedia?.type === 'video' && (
              <video src={previewingMedia.url} controls autoPlay className="w-full max-h-full" style={{ objectFit: 'contain' }} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewingMedia(null)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      <AlertDialog open={!!pendingTypeChange} onOpenChange={(open) => !open && setPendingTypeChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma modifica tipo</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTypeChange === 'decision'
                ? "Stai convertendo una Domanda in un Risultato. Il testo verrà preservato, ma tutte le opzioni e i nodi figli verranno eliminati. Questa azione non può essere annullata."
                : "Stai convertendo un Risultato in una Domanda. Il testo verrà preservato."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              // CRITICAL: Save the pendingTypeChange value BEFORE it gets cleared by onOpenChange
              // This fixes the race condition where the dialog's onOpenChange handler sets
              // pendingTypeChange to null before this onClick handler can use it
              const targetType = pendingTypeChange;

              console.log('🔴 PROCEDI CLICKED - targetType (saved):', targetType);
              console.log('🔴 Before: currentNodeType:', currentNodeType);
              console.log('🔴 decisionText:', decisionText);
              console.log('🔴 questionText:', questionText);

              if (targetType) {
                if (targetType === 'question' && decisionText) {
                  console.log('🟢 Copying decisionText to questionText');
                  setQuestionText(decisionText);
                } else if (targetType === 'decision' && questionText) {
                  console.log('🟢 Copying questionText to decisionText');
                  setDecisionText(questionText);
                }
                console.log('🟢 Setting currentNodeType to:', targetType);
                setCurrentNodeType(targetType);
              }
              // Clear pending state (dialog will close automatically via AlertDialogAction)
              setPendingTypeChange(null);
            }}>Procedi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

