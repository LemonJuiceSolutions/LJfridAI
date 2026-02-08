

// Updated: 2026-01-18 15:35 - Inline handler fix
'use client';

import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { useConnectors } from '@/hooks/use-connectors';
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
import { Play, Database, FileCode, Save, X, RotateCcw, Plus, Trash2, FileJson, ChevronRight, ChevronDown, RefreshCw, Check, Loader2, GitBranch, Search, Maximize2, Minimize2, ArrowUpRight, Copy, Terminal, Layout, List, AlignJustify, ArrowRight, ExternalLink, Archive, Upload, Image as ImageIcon, Link as LinkIcon, Zap, AlertCircle, Eye, Video, Pencil, Flag, Code, Table, Variable, BarChart3, Download, LineChart, Mail, Send, Paperclip, ArrowDownToLine, Info } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf, DecisionNode, MediaItem, LinkItem, TriggerItem, EmailActionConfig } from '@/lib/types';
import { Input } from '../ui/input';
import _ from 'lodash';
import { useToast } from '@/hooks/use-toast';
import { executeTriggerAction, generateSqlAction, executeSqlPreviewAction, fetchTableSchemaAction, generatePythonAction, executePythonPreviewAction, exportTableToSqlAction, fetchTableDataAction, executeEmailAction, getAuthenticatedUser, processDescriptionAction, rephraseQuestionAction, updateTreeNodeAction } from '@/app/actions';
import { sendEmailWithConnectorAction, sendTestEmailWithDataAction } from '@/app/actions/connectors';
import { executeAncestorChainAction, findAncestorsAction } from '@/app/actions/ancestors';
import { uploadFile } from '@/lib/storage-client';
import Image from 'next/image';
import { ScrollArea } from '../ui/scroll-area';
import { DataTable } from '../ui/data-table';
import { EmailBodyEditor, EmailBodyEditorRef } from './email-body-editor';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import { useOpenRouterSettings } from '@/hooks/use-openrouter';
import SmartWidgetRenderer from '@/components/widgets/builder/SmartWidgetRenderer';
import { AgentChat } from '@/components/agents/agent-chat';

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
      try {
        const savedState = localStorage.getItem(storageKey);
        if (savedState !== null) {
          setIsOpen(savedState === 'true');
        } else {
          // Default rule: open if has items, closed otherwise
          setIsOpen(count > 0);
        }
      } catch (e) {
        // Fallback to default if localStorage fails
        console.warn('[CollapsibleSection] Failed to load state from localStorage:', e);
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

// Helper functions for AgentChat integration
const getTableSchema = (selectedPipelines: string[], availableInputTables: any[]): Record<string, string[]> => {
  const schema: Record<string, string[]> = {};

  selectedPipelines.forEach(pipelineName => {
    const table = availableInputTables.find(t => t.name === pipelineName);
    if (table && table.pipelineDependencies) {
      table.pipelineDependencies.forEach((dep: any) => {
        if (dep.query) {
          // Extract columns from SQL query
          const columns = extractColumnsFromQuery(dep.query);
          schema[dep.tableName || pipelineName] = columns;
        }
      });
    }
  });

  return schema;
};

const getInputTables = (selectedPipelines: string[], availableInputTables: any[]): Record<string, any[]> => {
  const tables: Record<string, any[]> = {};

  selectedPipelines.forEach(pipelineName => {
    const table = availableInputTables.find(t => t.name === pipelineName);
    if (table && table.pipelineDependencies) {
      table.pipelineDependencies.forEach((dep: any) => {
        if (dep.query) {
          // Fetch sample data for table
          tables[dep.tableName || pipelineName] = table.data || [];
        }
      });
    }
  });

  return tables;
};

const extractColumnsFromQuery = (query: string): string[] => {
  // Simple regex to extract column names from SELECT clause
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    return selectMatch[1]
      .split(',')
      .map(col => col.trim().split(/\s+as\s+/i)[0].trim())
      .filter(col => col !== '*');
  }
  return [];
};

interface EditNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string, newNodeData: any) => void;
  onSavePreview?: (nodePath: string, previewData: any) => void;
  onRefreshTree?: () => void;
  initialNode: DecisionNode | DecisionLeaf | { question: string } | { option: string };
  nodeType: 'question' | 'decision';
  variableId?: string;
  nodePath: string;
  treeId: string;
  isSaving: boolean;
  availableInputTables?: { name: string, nodeName?: string, nodeId?: string, path?: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: 'table' | 'variable' | 'chart', pipelineDependencies?: { tableName: string; path?: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[], sqlExportTargetTableName?: string, sqlExportTargetConnectorId?: string, sqlExportSourceTables?: string[], writesToDatabase?: boolean }[];
  availableParentMedia?: MediaItem[];
  availableParentLinks?: LinkItem[];
  availableParentTriggers?: TriggerItem[];
}

type FileToUpload = {
  file: File;
  preview: string;
  name: string;
  type: 'image' | 'video';
}

type PipelineStatus = {
  name: string;
  type: 'python' | 'sql' | 'export';
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  executionTime?: number;
  message?: string;
};

export default function EditNodeDialog({
  isOpen,
  onClose,
  onSave,
  onSavePreview,
  onRefreshTree,
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

  const [sqlPreviewData, setSqlPreviewData] = useState<any[] | null>(null);
  const [sqlPreviewTimestamp, setSqlPreviewTimestamp] = useState<number | null>(null);
  const [sqlChatHistory, setSqlChatHistory] = useState<{ role: 'user' | 'assistant', content: string, timestamp?: number }[]>([]);

  // Use connectors hook with caching for better performance
  const { sqlConnectors, dataConnectors, smtpConnectors, refreshConnectors } = useConnectors();

  // Python State
  // Pipeline Execution State
  const [executionPipeline, setExecutionPipeline] = useState<PipelineStatus[]>([]);
  const [isPipelineExecuting, setIsPipelineExecuting] = useState(false);

  const [pythonCode, setPythonCode] = useState('');

  const [pythonOutputType, setPythonOutputType] = useState<'table' | 'variable' | 'chart'>('table');
  const [pythonResultName, setPythonResultName] = useState('');
  const [pipelineAgentStatus, setPipelineAgentStatus] = useState<string | null>(null);
  const [pipelineProgressStep, setPipelineProgressStep] = useState<number>(0); // 0=none, 1=dati, 2=python, 3=rendering
  const [hasPythonCodeChanged, setHasPythonCodeChanged] = useState(false);
  const [pythonPreviewResult, setPythonPreviewResult] = useState<{
    type: 'table' | 'variable' | 'chart';
    data?: any[];
    columns?: string[];
    variables?: Record<string, any>;
    chartBase64?: string;
    chartHtml?: string;
    rechartsConfig?: any;
    rechartsData?: any[];
    debugLogs?: string[];
    timestamp?: number;
  } | null>(null);
  const [pythonConnectorId, setPythonConnectorId] = useState<string>('');
  const [pythonSelectedPipelines, setPythonSelectedPipelines] = useState<string[]>([]);
  const [pythonDebugLogs, setPythonDebugLogs] = useState<string[]>([]);
  const [pythonChatHistory, setPythonChatHistory] = useState<{ role: 'user' | 'assistant', content: string, timestamp?: number, preview?: { type: 'table' | 'variable' | 'chart', data?: any[], columns?: string[], variables?: Record<string, any>, chartBase64?: string, chartHtml?: string, rechartsConfig?: any, rechartsData?: any[] } }[]>([]);
  const [pythonPreviewExpanded, setPythonPreviewExpanded] = useState(true);
  const [pythonPreviewFullHeight, setPythonPreviewFullHeight] = useState(false);

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
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  // Safe accessors for email attachments (prevent undefined errors)
  const safeEmailAttachments = {
    tablesInBody: emailConfig.attachments?.tablesInBody || [],
    tablesAsExcel: emailConfig.attachments?.tablesAsExcel || [],
    pythonOutputsInBody: emailConfig.attachments?.pythonOutputsInBody || [],
    pythonOutputsAsAttachment: emailConfig.attachments?.pythonOutputsAsAttachment || [],
    mediaAsAttachment: emailConfig.attachments?.mediaAsAttachment || [],
  };





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
      // Load saved SQL preview data if available, otherwise set to null
      const savedSqlPreviewData = (node as any).sqlPreviewData;
      const savedSqlPreviewTimestamp = (node as any).sqlPreviewTimestamp;
      console.log('[DEBUG] Caricamento SQL anteprima salvata:', { nodePath, hasPreviewData: !!savedSqlPreviewData, hasTimestamp: !!savedSqlPreviewTimestamp, timestampValue: savedSqlPreviewTimestamp });
      if (savedSqlPreviewData) {
        setSqlPreviewData(savedSqlPreviewData);
        setSqlPreviewTimestamp(savedSqlPreviewTimestamp || null);
      } else {
        setSqlPreviewData(null);
        setSqlPreviewTimestamp(null);
      }
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
      // Load saved preview data if available, otherwise set to null
      const savedPreviewData = (node as any).pythonPreviewResult;
      console.log('[DEBUG] Caricamento Python anteprima salvata:', { nodePath, hasPreviewData: !!savedPreviewData, hasTimestamp: !!savedPreviewData?.timestamp, timestampValue: savedPreviewData?.timestamp });
      if (savedPreviewData) {
        setPythonPreviewResult({
          type: savedPreviewData.type,
          data: savedPreviewData.data,
          variables: savedPreviewData.variables,
          chartBase64: savedPreviewData.chartBase64,
          chartHtml: savedPreviewData.chartHtml,
          rechartsConfig: savedPreviewData.rechartsConfig,
          rechartsData: savedPreviewData.rechartsData,
          debugLogs: savedPreviewData.debugLogs,
          timestamp: savedPreviewData.timestamp
        });
        // Auto-expand preview and set full height for charts if saved data exists
        setPythonPreviewExpanded(true);
        setPythonPreviewFullHeight(savedPreviewData.type === 'chart');
      } else {
        setPythonPreviewResult(null);
        setPythonPreviewFullHeight(false);
      }

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



    }
  }, [isOpen, initialNode, nodeType, availableInputTables]);

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

  // Memoized handler for Python chat submissions
  const handlePythonSubmit = useCallback(async (userPrompt: string) => {
    const apiKey = openRouterApiKey || '';
    const model = openRouterModel || 'google/gemini-2.0-flash-001';

    if (!apiKey) {
      toast({ variant: 'destructive', title: "Configurazione Mancante", description: "Imposta la chiave API nelle Impostazioni." });
      return;
    }

    const newHistory = [...pythonChatHistory, { role: 'user' as const, content: userPrompt, timestamp: Date.now() }];
    setPythonChatHistory(newHistory);
    setPipelineAgentStatus("Analisi contesto...");

    // 1. GATHER CONTEXT
    const context: {
      availableTables: { name: string; columns?: string[]; isDataFrame?: boolean }[];
      currentCode?: string;
    } = {
      availableTables: [],
      currentCode: pythonCode
    };

    const tablesToFetchByConnector: Record<string, string[]> = {};

    for (const pName of pythonSelectedPipelines) {
      // Logic for SQL Result (Local)
      if (pName === 'Risultato SQL' || (sqlResultName && pName === sqlResultName)) {
        if (sqlPreviewData && sqlPreviewData.length > 0) {
          const cols = Object.keys(sqlPreviewData[0]);
          context.availableTables.push({
            name: pName,
            columns: cols,
            isDataFrame: true
          });
        } else {
          context.availableTables.push({ name: pName, isDataFrame: true });
        }
        continue;
      }

      // Logic for Input Tables
      const inputTable = availableInputTables?.find(t => t.name === pName);
      if (inputTable) {
        if (!inputTable.isPython && inputTable.connectorId) {
          if (!tablesToFetchByConnector[inputTable.connectorId]) {
            tablesToFetchByConnector[inputTable.connectorId] = [];
          }
          tablesToFetchByConnector[inputTable.connectorId].push(inputTable.name);
        } else {
          // Python or unknown structure
          context.availableTables.push({ name: pName, isDataFrame: true });
        }
      }
    }

    // Fetch schemas in parallel
    if (Object.keys(tablesToFetchByConnector).length > 0) {
      const schemaPromises = Object.entries(tablesToFetchByConnector).map(async ([connId, tables]) => {
        try {
          const res = await fetchTableSchemaAction(connId, tables);
          if (res.tables) {
            Object.entries(res.tables).forEach(([tableName, columnsWithTypes]) => {
              context.availableTables.push({
                name: tableName,
                columns: columnsWithTypes,
                isDataFrame: true
              });
            });
          }
        } catch (err: any) {
          console.error(`[PIPELINE ERROR] Error fetching schema for context:`, err);
          // Log specific details to help debugging "createConsoleError" traces
          console.error('Error Details:', {
            message: err?.message,
            stack: err?.stack,
            name: err?.name,
            digest: err?.digest // Next.js specific error digest
          });
        }
      });
      await Promise.all(schemaPromises);
    }

    setPipelineAgentStatus("Generazione Codice Python...");

    const performGeneration = async (currentHistory: any[], retryCount = 0) => {
      try {
        const response = await generatePythonAction(
          userPrompt,
          { apiKey, model },
          pythonOutputType,
          pythonSelectedPipelines,
          currentHistory,
          context // Pass context!
        );

        if (response.code) {
          setPipelineAgentStatus(retryCount > 0 ? `Correzione in corso (Tentativo ${retryCount}/3)...` : "Esecuzione Anteprima Automatica...");

          const previewRes = await executePythonPreviewAction(
            response.code,
            pythonOutputType,
            {},
            pythonSelectedPipelines.map(pName => {
              const dep = availableInputTables?.find(t => t.name === pName);
              // Fallback query if missing for SQL tables (e.g. raw tables)
              let finalQuery = dep?.sqlQuery;
              if (!finalQuery && !dep?.isPython) {
                // Use TOP 1000 and brackets for MSSQL safety
                finalQuery = `SELECT TOP 1000 * FROM [${dep?.name}]`;
              }

              return {
                tableName: dep?.name || '',
                query: finalQuery,
                isPython: dep?.isPython,
                pythonCode: dep?.pythonCode,
                connectorId: dep?.connectorId,
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
              rechartsConfig: previewRes.rechartsConfig,
              rechartsData: previewRes.rechartsData,
              debugLogs: previewRes.debugLogs,
              timestamp: Date.now()
            });
            setHasPythonCodeChanged(true);

            // DEBUG AID: If data is empty, show logs to help user/AI debug
            if (!previewRes.data || previewRes.data.length === 0) {
              const lastLogs = previewRes.debugLogs?.slice(-5).join('\n') || "No logs";
              toast({
                variant: "default",
                title: "Nessun dato (Debug Info)",
                description: <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4 overflow-auto text-xs text-white">{lastLogs}</pre>,
                duration: 10000
              });
            }

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

    performGeneration(newHistory, 0).finally(() => setPipelineAgentStatus(null));
  }, [openRouterApiKey, openRouterModel, pythonChatHistory, pythonOutputType, pythonSelectedPipelines, pythonConnectorId, availableInputTables, toast, pythonCode, sqlResultName, sqlPreviewData]);

  // --- REUSABLE PIPELINE EXECUTION LOGIC ---
  const executeFullPipeline = async (
    targetAction: 'preview' | 'export' | 'email',
    onSuccess?: (pipelineResults?: Record<string, any>, report?: any[]) => Promise<void>
  ) => {
    if (isExecutingRef.current) return;
    setIsPipelineExecuting(true);
    isExecutingRef.current = true;
    setPipelineAgentStatus("Analisi Pipeline dei Padri...");
    setPipelineProgressStep(0);

    try {
      // 0. Use availableInputTables as the source of truth for execution
      // This ensures the pipeline matches exactly what is shown in "Risorse Disponibili"
      const potentialAncestors = availableInputTables || [];

      // Helper to recursively collect all unique ancestors
      const collectAncestors = (nodes: any[], visited = new Map<string, any>()) => {
        nodes.forEach(node => {
          // Process dependencies first (DFS) so they appear earlier in the list
          if (node.pipelineDependencies && node.pipelineDependencies.length > 0) {
            collectAncestors(node.pipelineDependencies, visited);
          }

          const nameOrTable = node.name || node.tableName;
          // Use path as the primary key if available, fallback to nodeId + name for uniqueness
          const key = node.path ? `${node.path}_${nameOrTable}` : (node.nodeId ? `${node.nodeId}_${nameOrTable}` : nameOrTable);
          if (!visited.has(key)) {
            visited.set(key, {
              id: node.nodeId,
              path: node.path, // Persist path
              name: nameOrTable,
              isPython: node.isPython,
              pythonCode: node.pythonCode,
              pythonOutputType: (node as any).pythonOutputType,
              sqlQuery: (node as any).sqlQuery || (node as any).query,
              connectorId: node.connectorId,
              pipelineDependencies: node.pipelineDependencies,
              nodeName: node.nodeName,
              writesToDatabase: node.writesToDatabase,
              sqlExportTargetTableName: node.sqlExportTargetTableName,
              sqlExportTargetConnectorId: node.sqlExportTargetConnectorId,
              sqlExportSourceTables: node.sqlExportSourceTables,
            });
          }
        });
        return visited;
      };

      const uniqueNodesMap = collectAncestors(potentialAncestors);

      const ancestors = Array.from(uniqueNodesMap.values());
      console.log('[PIPELINE] Resolved FULL execution list (flattened):', ancestors);

      // 1. Flatten into Execution Steps (Visual + Logic)
      interface ExecutionStep {
        id: string;
        type: 'execution' | 'write' | 'final';
        ancestor?: any; // The node being executed or written
        label: string;
        pipelineType: 'python' | 'sql' | 'export';
        // For 'write' steps, we need to know where to get data from
        sourceAncestorName?: string;
      }

      const steps: ExecutionStep[] = [];
      const executionReport: any[] = [];

      // Add Ancestor Steps
      ancestors.forEach((t: any) => {
        // Step A: Execution (Preview)
        const execLabel = t.nodeName ? `${t.nodeName} > ${t.name}` : t.name;
        steps.push({
          id: `${t.path || t.name}_exec`,
          type: 'execution',
          ancestor: t,
          label: execLabel,
          pipelineType: t.isPython ? 'python' : 'sql'
        });

        // Step B: Write (Export) - Only if configured
        if (t.writesToDatabase) {
          const writeLabel = t.nodeName
            ? `${t.nodeName} > 💾 Write ${t.sqlExportTargetTableName || 'DB'}`
            : `💾 Write ${t.sqlExportTargetTableName || 'DB'}`;
          steps.push({
            id: `${t.path || t.name}_write`,
            type: 'write',
            ancestor: t, // We still reference the ancestor config
            label: writeLabel,
            pipelineType: 'export',
            sourceAncestorName: t.name
          });
        }
      });

      // Add Final Step
      if (targetAction === 'preview') {
        steps.push({
          id: 'final_preview',
          type: 'final',
          label: pythonResultName || "Script Corrente",
          pipelineType: 'python'
        });
      } else if (targetAction === 'export') {
        steps.push({
          id: 'final_export',
          type: 'final',
          label: `💾 Salva ${sqlExportTargetTableName}`,
          pipelineType: 'export'
        });
      } else if (targetAction === 'email') {
        steps.push({
          id: 'final_email',
          type: 'final',
          label: `✉️ Invia Email`,
          pipelineType: 'export'
        });
      } else if (targetAction === 'preview' && !pythonCode) {
        // Special case for SQL Preview as final step
        steps.push({
          id: 'final_sql_preview',
          type: 'final',
          label: sqlResultName || "Anteprima SQL",
          pipelineType: 'sql'
        });
      }

      // 2. Initialize UI from Steps
      const initialPipeline: PipelineStatus[] = steps.map(s => ({
        name: s.label,
        type: s.pipelineType,
        status: 'pending'
      }));

      setExecutionPipeline(initialPipeline);
      setPipelineProgressStep(1);

      // Collect results to pass to final action
      const ancestorResults: Record<string, any> = {};

      // 3. Execute Steps Sequentially
      for (const step of steps) {
        if (!isExecutingRef.current) break;

        // SKIP FINAL STEP IN LOOP (Handled separately below)
        if (step.type === 'final') continue;

        // Set status to running
        setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'running' } : p));
        const startTime = Date.now();

        let success = false;
        let error: string | null = null;

        try {
          if (step.type === 'execution' && step.ancestor) {
            const ancestor = step.ancestor;
            // --- EXISTING EXECUTION LOGIC (Python/SQL) ---
            if (ancestor.isPython && ancestor.pythonCode) {
              // Python Execution
              // Build inputData from accumulated ancestorResults
              const inputData: Record<string, any[]> = {};
              console.log(`[BUTTON DEBUG] Building inputData for ${ancestor.name}. ancestorResults keys: ${Object.keys(ancestorResults).join(', ')}`);
              for (const [key, val] of Object.entries(ancestorResults)) {
                const valType = val === null ? 'null' : (Array.isArray(val) ? 'array' : typeof val);
                const hasData = val && typeof val === 'object' && 'data' in val;
                const dataIsArray = hasData && Array.isArray((val as any).data);
                console.log(`[BUTTON DEBUG]   Key '${key}': valType=${valType}, hasData=${hasData}, dataIsArray=${dataIsArray}`);

                if (Array.isArray(val)) {
                  inputData[key] = val;
                  console.log(`[BUTTON DEBUG]     -> Added as array (${val.length} items)`);
                } else if (val && val.data && Array.isArray(val.data)) {
                  inputData[key] = val.data;
                  console.log(`[BUTTON DEBUG]     -> Extracted .data array (${val.data.length} items)`);
                } else {
                  console.log(`[BUTTON DEBUG]     -> SKIPPED (not array and data not array)`);
                }
              }
              console.log(`[BUTTON DEBUG] Final inputData for ${ancestor.name}: ${Object.keys(inputData).join(', ')}`);

              const res = await executePythonPreviewAction(
                ancestor.pythonCode,
                ancestor.pythonOutputType || 'table',
                inputData, // Pass accumulated ancestor data
                (Array.isArray(ancestor.pipelineDependencies) ? ancestor.pipelineDependencies : []).map((d: any) => ({
                  tableName: d.tableName,
                  query: d.query,
                  isPython: d.isPython,
                  pythonCode: d.pythonCode,
                  connectorId: d.connectorId,
                  pipelineDependencies: (d as any).pipelineDependencies
                })),
                ancestor.connectorId
              );
              console.log(`[BUTTON DEBUG] Result for ${ancestor.name}: success=${res.success}, hasData=${!!res.data}, dataIsArray=${Array.isArray(res.data)}, dataLength=${res.data?.length || 'N/A'}, hasVariables=${!!res.variables}`);
              if (res.success) {
                success = true;
                ancestorResults[ancestor.name] = {
                  data: res.data,
                  chartBase64: res.chartBase64,
                  chartHtml: res.chartHtml,
                  rechartsConfig: res.rechartsConfig,
                  rechartsData: res.rechartsData,
                  variables: res.variables
                };
              } else {
                error = res.error || null;
              }
            } else if (ancestor.sqlQuery) {
              // SQL Execution
              const deps = Array.isArray(ancestor.pipelineDependencies) ? ancestor.pipelineDependencies : [];
              const inputTablesWithDeps = deps.map((t: any) => {
                const resultObj = ancestorResults[t.tableName];
                const preCalcData = resultObj ? resultObj.data : undefined;
                // SAFEGUARD: Payload size check
                const MAX_PAYLOAD_BYTES = 250 * 1024;
                let shouldPassData = false;
                let payloadSize = 0;
                if (preCalcData && Array.isArray(preCalcData)) {
                  try {
                    const dataStr = JSON.stringify(preCalcData);
                    payloadSize = dataStr.length;
                    if (payloadSize <= MAX_PAYLOAD_BYTES) shouldPassData = true;
                  } catch (e) { }
                }

                return {
                  tableName: t.tableName,
                  query: t.query,
                  isPython: t.isPython,
                  pythonCode: t.pythonCode,
                  connectorId: t.connectorId,
                  pipelineDependencies: t.pipelineDependencies,
                  data: shouldPassData ? preCalcData : undefined
                };
              });

              const res = await executeSqlPreviewAction(
                ancestor.sqlQuery,
                ancestor.connectorId || '',
                inputTablesWithDeps
              );
              if (res.data) {
                success = true;
                ancestorResults[ancestor.name] = { data: res.data };
              } else {
                error = res.error || null;
              }
            } else {
              success = true; // Unknown type
            }
          } else if (step.type === 'write' && step.ancestor) {
            // --- EXPLICIT WRITE STEP ---
            const ancestor = step.ancestor;
            // Get data from PREVIOUS step results
            const sourceData = ancestorResults[ancestor.name]?.data;

            if (sourceData) {
              const targetConnectorId = ancestor.sqlExportTargetConnectorId || ancestor.connectorId;
              const targetTableName = ancestor.sqlExportTargetTableName;

              if (targetConnectorId && targetTableName) {
                try {
                  const writeRes = await exportTableToSqlAction(
                    targetConnectorId,
                    targetTableName,
                    sourceData,
                    true
                  );
                  if (!writeRes.success) {
                    error = `Write failed: ${writeRes.error}`;
                    success = false;
                  } else {
                    success = true;
                  }
                } catch (e: any) {
                  error = `Write ex: ${e.message}`;
                  success = false;
                }
              } else {
                console.warn(`[PIPELINE] Missing Write config for ${step.label}`);
                success = true; // Skip if config missing, don't fail pipeline?
              }
            } else {
              error = "No source data found for write operation";
              success = false;
            }
          }

          if (success) {
            executionReport.push({
              name: step.label,
              type: step.type === 'execution' && step.ancestor?.isPython ? 'Python' : 'SQL',
              status: 'success',
              timestamp: new Date().toISOString()
            });
            setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'success', executionTime: Date.now() - startTime } : p));
          } else {
            executionReport.push({
              name: step.label,
              type: step.type === 'execution' && step.ancestor?.isPython ? 'Python' : 'SQL',
              status: 'error',
              error: error || 'Errore sconosciuto',
              timestamp: new Date().toISOString()
            });
            setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'error', message: error || 'Errore sconosciuto' } : p));
            setPipelineAgentStatus(null);
            setIsPipelineExecuting(false);
            isExecutingRef.current = false;
            return;
          }
        } catch (e: any) {
          executionReport.push({
            name: step.label,
            type: step.type === 'execution' && step.ancestor?.isPython ? 'Python' : 'SQL',
            status: 'error',
            error: e.message,
            timestamp: new Date().toISOString()
          });
          setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'error', message: e.message } : p));
          setPipelineAgentStatus(null);
          setIsPipelineExecuting(false);
          isExecutingRef.current = false;
          return;
        }
      }

      // 3.5. PERSIST ANCESTOR PREVIEWS (single DB write + refresh in-memory tree)
      if (treeId && Object.keys(ancestorResults).length > 0) {
        try {
          const ancestorPreviews: Array<{ nodeId: string; isPython: boolean; pythonOutputType?: string; result: any }> = [];
          for (const step of steps) {
            if (step.type !== 'execution' || !step.ancestor) continue;
            const ancestor = step.ancestor;
            const resultData = ancestorResults[ancestor.name];
            if (!resultData) continue;
            const nodeId = ancestor.id || ancestor.nodeId;
            if (!nodeId) continue;
            ancestorPreviews.push({
              nodeId,
              isPython: !!ancestor.isPython,
              pythonOutputType: ancestor.pythonOutputType,
              result: resultData
            });
          }
          if (ancestorPreviews.length > 0) {
            const { saveAncestorPreviewsBatchAction } = await import('@/app/actions/scheduler');
            await saveAncestorPreviewsBatchAction(treeId, ancestorPreviews);
            // Refresh the in-memory tree to reflect DB changes
            if (onRefreshTree) onRefreshTree();
          }
        } catch (err) {
          console.warn('[PIPELINE] Error saving ancestor previews:', err);
        }
      }

      // 4. Execute Final Action (Current Node)
      const finalStepLabel = steps.find(s => s.type === 'final')?.label;
      if (finalStepLabel) {
        setPipelineProgressStep(2);
        setExecutionPipeline(prev => prev.map(p => p.name === finalStepLabel ? { ...p, status: 'running' } : p));
        const startTime = Date.now();
        try {
          if (onSuccess) await onSuccess(ancestorResults, executionReport);
          setExecutionPipeline(prev => prev.map(p => p.name === finalStepLabel ? { ...p, status: 'success', executionTime: Date.now() - startTime } : p));
        } catch (e: any) {
          setExecutionPipeline(prev => prev.map(p => p.name === finalStepLabel ? { ...p, status: 'error', message: e.message } : p));
          throw e;
        }
      }

      setPipelineProgressStep(3);
    } catch (e: any) {
      console.error("Pipeline Error:", e);
      toast({ variant: 'destructive', title: "Errore Pipeline", description: e.message });
    } finally {
      setIsPipelineExecuting(false);
      isExecutingRef.current = false;
      setPipelineAgentStatus(null);
      setPipelineProgressStep(0);
    }
  };


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

      // Preserve preview data when saving node
      // This ensures that SQL and Python previews are not lost when user saves the node
      if ((initialNode as any).sqlPreviewData) {
        newNodeData.sqlPreviewData = (initialNode as any).sqlPreviewData;
      }
      if ((initialNode as any).sqlPreviewTimestamp) {
        newNodeData.sqlPreviewTimestamp = (initialNode as any).sqlPreviewTimestamp;
      }
      if ((initialNode as any).pythonPreviewResult) {
        newNodeData.pythonPreviewResult = (initialNode as any).pythonPreviewResult;
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
                      <div className="flex flex-col gap-2 flex-1">
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
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all duration-200"
                          onClick={() => {
                            if (!sqlQuery) {
                              toast({ variant: 'destructive', title: "Errore", description: "Inserisci una query SQL prima di eseguire l'anteprima." });
                              return;
                            }

                            // Execute full pipeline for SQL preview (Ancestors -> Current)
                            // This ensures all parent nodes (SQL/Python) are executed first
                            executeFullPipeline('preview', async (ancestorResults) => {
                              console.log('[SQL EXEC] Pipeline finished. Results:', Object.keys(ancestorResults || {}));

                              // Execute the current SQL query with pre-calculated results from ancestors
                              const deps = (availableInputTables || []).filter(t => {
                                // Filter logic: Include if selected OR referenced in SQL (FROM/JOIN)
                                const upperQuery = sqlQuery.toUpperCase();
                                const upperName = t.name.toUpperCase();
                                return selectedPipelines.includes(t.name) ||
                                  upperQuery.includes(`FROM ${upperName}`) ||
                                  upperQuery.includes(`JOIN ${upperName}`) ||
                                  upperQuery.includes(`[${upperName}]`); // Handle bracketed names
                              }).map(t => {
                                const resultObj = ancestorResults?.[t.name];
                                const preCalcData = resultObj ? resultObj.data : undefined;

                                // Log usage of pre-calculated data
                                if (preCalcData) {
                                  console.log(`[SQL EXEC] Using pre-calculated data for ${t.name} (${Array.isArray(preCalcData) ? preCalcData.length : 'N/A'} rows)`);
                                }

                                // SAFEGUARD: Payload size check for client-server transfer
                                const MAX_PAYLOAD_BYTES = 500 * 1024; // Increased limit to 500KB
                                let shouldPassData = false;
                                if (preCalcData && Array.isArray(preCalcData)) {
                                  try {
                                    if (JSON.stringify(preCalcData).length <= MAX_PAYLOAD_BYTES) shouldPassData = true;
                                  } catch (e) { }
                                }

                                return {
                                  tableName: t.name,
                                  query: t.sqlQuery,
                                  isPython: t.isPython,
                                  pythonCode: t.pythonCode,
                                  connectorId: t.connectorId,
                                  pipelineDependencies: t.pipelineDependencies,
                                  data: shouldPassData ? preCalcData : undefined
                                };
                              });

                              console.log('[SQL EXEC] Executing final query with deps:', deps.length);
                              const res = await executeSqlPreviewAction(sqlQuery, sqlConnectorId, deps);

                              if (res.data) {
                                setSqlPreviewData(res.data);
                                setSqlPreviewTimestamp(Date.now());

                                // Persist preview to DB/Tree
                                if (onSavePreview && nodePath) {
                                  onSavePreview(nodePath, { sqlPreviewData: res.data, sqlPreviewTimestamp: Date.now() });
                                }

                                toast({
                                  title: "Anteprima Aggiornata",
                                  description: `Query eseguita con successo (${res.data.length} righe). Pipeline completata.`
                                });
                              } else {
                                throw new Error(res.error || "Errore sconosciuto durante l'esecuzione SQL");
                              }
                            });
                          }}
                          disabled={!!pipelineAgentStatus}
                        >
                          {pipelineAgentStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                          Esegui Pipeline SQL
                        </Button>

                      </div>
                    </div>

                    {/* RIGHT COLUMN: AI Agent */}
                    <div className="order-1 lg:order-2 h-[500px]">
                      <AgentChat
                        nodeId={nodePath}
                        agentType="sql"
                        script={sqlQuery}
                        tableSchema={getTableSchema(selectedPipelines, availableInputTables)}
                        inputTables={getInputTables(selectedPipelines, availableInputTables)}
                        onScriptUpdate={(newScript) => {
                          setSqlQuery(newScript);
                          toast({ title: "Query Aggiornata", description: "L'editor SQL è stato aggiornato." });
                        }}
                      />
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

                      {/* Timestamp Display - Always Visible */}
                      {sqlPreviewTimestamp && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800">
                          <span className="font-medium">Ultimo aggiornamento:</span> {new Date(sqlPreviewTimestamp).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })}
                        </div>
                      )}

                      <div className="max-h-[200px] overflow-auto">
                        <DataTable data={sqlPreviewData} />
                      </div>
                    </div>
                  )}

                  {/* Pipeline Execution Visualization (for SQL) */}
                  {executionPipeline.length > 0 && !pythonCode && (
                    <div className="mt-4 border rounded-md overflow-hidden bg-muted/20 animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* Header */}
                      <div className="p-2 px-3 bg-muted/40 border-b flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5" />
                          Pipeline di Esecuzione (Anteprima)
                        </h4>
                        {isPipelineExecuting && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>

                      {/* Steps List */}
                      <div className="max-h-[200px] overflow-y-auto">
                        {executionPipeline.map((step, idx) => (
                          <div key={idx} className={`flex items-center justify-between p-2 px-3 border-b last:border-0 text-xs text-foreground ${step.status === 'running' ? 'bg-background shadow-sm' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className="w-4 flex justify-center">
                                {step.status === 'pending' && <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />}
                                {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                {step.status === 'success' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                {step.status === 'error' && <X className="h-3.5 w-3.5 text-red-600" />}
                                {step.status === 'skipped' && <div className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                              </span>
                              <div className="flex flex-col">
                                <span className={step.status === 'running' ? 'font-medium text-primary' : ''}>
                                  {step.name}
                                  {step.type === 'export' && <Upload className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                                </span>
                                {step.message && <span className={`text-[10px] ${step.status === 'error' ? 'text-red-500' : step.status === 'skipped' ? 'text-yellow-600' : 'text-muted-foreground'}`}>{step.message}</span>}
                              </div>
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted uppercase tracking-wider scale-90 origin-left">{step.type}</span>
                            </div>
                            {step.executionTime && <span className="text-[10px] text-muted-foreground font-mono">{step.executionTime}ms</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual Stepper - shown during SQL execution */}
                  {pipelineAgentStatus && !pythonCode && (
                    <div className="flex items-center justify-center gap-8 py-4 mt-4 animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pipelineProgressStep >= 1 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pipelineProgressStep > 1 ? <Check className="h-5 w-5" /> : <Database className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pipelineProgressStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>Recupero Dati</span>
                      </div>
                      <div className={`h-0.5 w-16 transition-all ${pipelineProgressStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pipelineProgressStep >= 2 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          <Eye className="h-4 w-4" />
                        </div>
                        <span className={`text-[10px] font-medium ${pipelineProgressStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>Anteprima SQL</span>
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
                      <div className="flex flex-col gap-2 flex-1">
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

                        <div className="flex gap-2 relative z-20">
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              // Use reusable pipeline execution
                              executeFullPipeline('preview', async () => {
                                // Build dependencies
                                const dependencies: { tableName: string; connectorId?: string; query?: string; isPython?: boolean; pythonCode?: string; pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[] }[] = [];
                                if (availableInputTables) {
                                  pythonSelectedPipelines.forEach(pName => {
                                    const table = availableInputTables.find(t => t.name === pName);
                                    if (table) {
                                      let finalQuery = table.sqlQuery;
                                      if (!finalQuery && !table.isPython) {
                                        finalQuery = `SELECT TOP 1000 * FROM [${table.name}]`;
                                      }
                                      dependencies.push({
                                        tableName: pName,
                                        connectorId: table.connectorId,
                                        query: finalQuery,
                                        isPython: table.isPython,
                                        pythonCode: table.pythonCode,
                                        pipelineDependencies: table.pipelineDependencies
                                      });
                                    }
                                  });
                                }

                                const res = await executePythonPreviewAction(pythonCode, pythonOutputType, {}, dependencies, pythonConnectorId);

                                if (res.success) {
                                  setPythonPreviewResult({
                                    type: pythonOutputType,
                                    data: res.data,
                                    variables: res.variables,
                                    chartBase64: res.chartBase64,
                                    chartHtml: res.chartHtml,
                                    rechartsConfig: res.rechartsConfig,
                                    rechartsData: res.rechartsData,
                                    debugLogs: res.debugLogs,
                                    timestamp: Date.now()
                                  });
                                  setPythonPreviewExpanded(true);
                                  setPythonPreviewFullHeight(true);

                                  if (onSavePreview && nodePath) {
                                    const previewData = {
                                      type: pythonOutputType,
                                      data: res.data,
                                      variables: res.variables,
                                      chartBase64: res.chartBase64,
                                      chartHtml: res.chartHtml,
                                      rechartsConfig: res.rechartsConfig,
                                      rechartsData: res.rechartsData,
                                      debugLogs: res.debugLogs,
                                      timestamp: Date.now()
                                    };
                                    onSavePreview(nodePath, previewData);
                                  }
                                } else {
                                  throw new Error(res.error || "Errore sconosciuto durante l'esecuzione dello script");
                                }
                              });
                            }}
                            disabled={!!pipelineAgentStatus}
                          >
                            {pipelineAgentStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                            Esegui Anteprima
                          </Button>

                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: AI Agent */}
                    <div className="order-1 lg:order-2 h-[500px]">
                      <AgentChat
                        nodeId={nodePath}
                        agentType="python"
                        script={pythonCode}
                        tableSchema={getTableSchema(pythonSelectedPipelines, availableInputTables)}
                        inputTables={getInputTables(pythonSelectedPipelines, availableInputTables)}
                        onScriptUpdate={(newScript) => {
                          setPythonCode(newScript);
                          toast({ title: "Codice Aggiornato", description: "Lo script Python è stato aggiornato." });
                        }}
                      />
                    </div>
                  </div>

                  {/* Pipeline Execution Visualization */}
                  {executionPipeline.length > 0 && (
                    <div className="mt-4 border rounded-md overflow-hidden bg-muted/20 animate-in fade-in slide-in-from-top-2 duration-300">
                      {/* Header */}
                      <div className="p-2 px-3 bg-muted/40 border-b flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5" />
                          Pipeline di Esecuzione
                        </h4>
                        {isPipelineExecuting && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                      </div>

                      {/* Steps List */}
                      <div className="max-h-[200px] overflow-y-auto">
                        {executionPipeline.map((step, idx) => (
                          <div key={idx} className={`flex items-center justify-between p-2 px-3 border-b last:border-0 text-xs text-foreground ${step.status === 'running' ? 'bg-background shadow-sm' : ''}`}>
                            <div className="flex items-center gap-3">
                              <span className="w-4 flex justify-center">
                                {step.status === 'pending' && <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />}
                                {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                {step.status === 'success' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                {step.status === 'error' && <X className="h-3.5 w-3.5 text-red-600" />}
                                {step.status === 'skipped' && <div className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                              </span>
                              <div className="flex flex-col">
                                <span className={step.status === 'running' ? 'font-medium text-primary' : ''}>
                                  {step.name}
                                  {step.type === 'export' && <Upload className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                                </span>
                                {step.message && <span className={`text-[10px] ${step.status === 'error' ? 'text-red-500' : step.status === 'skipped' ? 'text-yellow-600' : 'text-muted-foreground'}`}>{step.message}</span>}
                              </div>
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted uppercase tracking-wider scale-90 origin-left">{step.type}</span>
                            </div>
                            {step.executionTime && <span className="text-[10px] text-muted-foreground font-mono">{step.executionTime}ms</span>}
                          </div>
                        ))}
                      </div>

                      {/* DEBUGGING: Ancestor Export Configs (Only visible when expanded or key pressed? For now visible) */}
                      <div className="p-2 bg-slate-100 dark:bg-slate-900 border-t text-[10px] font-mono text-muted-foreground">
                        <div className="font-bold mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> DEBUG: Stato Export Nodi</div>
                        {availableInputTables?.map(t => {
                          const hasConfig = t.sqlExportTargetTableName && t.sqlExportTargetConnectorId;
                          const isMe = t.sqlExportSourceTables?.includes(t.name);
                          return (
                            <div key={t.name} className={`mb-1 p-1 rounded ${hasConfig ? (isMe ? 'bg-green-100 dark:bg-green-900/20 text-green-700' : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700') : 'text-slate-400'}`}>
                              <strong>{t.name}</strong>:
                              {hasConfig ? (
                                <>
                                  To: {t.sqlExportTargetTableName} (Conn: {t.sqlExportTargetConnectorId?.substring(0, 6)}...)
                                  Sources: [{t.sqlExportSourceTables?.join(', ')}]
                                  {isMe ? ' ✅ READY' : ' ⚠️ NAME MISMATCH'}
                                </>
                              ) : ' No Export Configured'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Visual Stepper - shown during execution */}
                  {pipelineAgentStatus && (
                    <div className="flex items-center justify-center gap-8 py-4 mt-4 animate-in fade-in zoom-in-95 duration-300">
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pipelineProgressStep >= 1 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pipelineProgressStep > 1 ? <Check className="h-5 w-5" /> : <Database className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pipelineProgressStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>Recupero Dati</span>
                      </div>
                      <div className={`h-0.5 w-16 transition-all ${pipelineProgressStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pipelineProgressStep >= 2 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pipelineProgressStep > 2 ? <Check className="h-5 w-5" /> : <Code className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pipelineProgressStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>Elaborazione</span>
                      </div>
                      <div className={`h-0.5 w-16 transition-all ${pipelineProgressStep >= 3 ? 'bg-primary' : 'bg-muted'}`} />
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pipelineProgressStep >= 3 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          <LineChart className="h-4 w-4" />
                        </div>
                        <span className={`text-[10px] font-medium ${pipelineProgressStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>Rendering</span>
                      </div>
                    </div>
                  )}

                  {/* Preview Result - BELOW the two columns, max 200px */}
                  {/* DEBUG LOGS VIEWER */}
                  {pythonPreviewResult?.debugLogs && pythonPreviewResult.debugLogs.length > 0 && (
                    <div className="mt-4 p-4 border rounded-lg bg-slate-950 text-xs font-mono text-green-400 overflow-auto max-h-60">
                      <div className="font-bold text-white mb-2 pb-2 border-b border-slate-800">Server-Side Debug Logs:</div>
                      {pythonPreviewResult.debugLogs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap">{log}</div>
                      ))}
                    </div>
                  )}

                  {pythonPreviewResult && (
                    <div className="mt-4 border rounded-md overflow-hidden bg-white dark:bg-zinc-950 relative min-h-[40px]">
                      <div className="flex justify-between items-center bg-muted/50 p-2 border-b">
                        <span className="font-semibold text-xs flex items-center gap-2">
                          <Code className="h-3 w-3" />
                          Risultato Python ({pythonPreviewResult.type})
                        </span>
                        <div className="flex items-center gap-1">
                          {/* Toggle Expand/Collapse */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            title={pythonPreviewExpanded ? "Comprimi" : "Espandi"}
                            onClick={() => setPythonPreviewExpanded(!pythonPreviewExpanded)}
                          >
                            {pythonPreviewExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>

                          {/* Toggle Full Height (only if expanded and chart) */}
                          {pythonPreviewExpanded && pythonPreviewResult.type === 'chart' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title={pythonPreviewFullHeight ? "Riduci Altezza" : "Tutta Estesa"}
                              onClick={() => setPythonPreviewFullHeight(!pythonPreviewFullHeight)}
                            >
                              {pythonPreviewFullHeight ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                            </Button>
                          )}

                          {pythonPreviewExpanded && pythonPreviewResult.type === 'chart' && pythonPreviewResult.chartHtml && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] gap-1 px-2 font-bold ml-1"
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
                          <Button size="icon" variant="ghost" className="h-6 w-6 ml-1" onClick={() => setPythonPreviewResult(null)}><X className="h-3 w-3" /></Button>
                        </div>
                      </div>

                      {/* Timestamp Display */}
                      {pythonPreviewResult.timestamp && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800">
                          <span className="font-medium">Ultimo aggiornamento:</span> {new Date(pythonPreviewResult.timestamp).toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'short' })}
                        </div>
                      )}

                      {pythonPreviewExpanded && (
                        <div className="transition-all duration-300">
                          {pythonPreviewResult.type === 'table' && pythonPreviewResult.data && (
                            <DataTable data={pythonPreviewResult.data} columns={pythonPreviewResult.columns} />
                          )}
                          {pythonPreviewResult.type === 'variable' && pythonPreviewResult.variables && (
                            <pre className="p-3 text-xs">{JSON.stringify(pythonPreviewResult.variables, null, 2)}</pre>
                          )}
                          {pythonPreviewResult.type === 'chart' && (
                            <div key={pythonPreviewFullHeight ? 'full' : 'mini'} className={`bg-white dark:bg-zinc-950 ${pythonPreviewFullHeight ? 'min-h-[500px]' : 'overflow-y-auto custom-scrollbar'}`} style={{ height: pythonPreviewFullHeight ? 'auto' : '400px' }}>
                              {pythonPreviewResult.rechartsConfig && pythonPreviewResult.rechartsData ? (
                                <div className="w-full p-4" style={{ height: pythonPreviewFullHeight ? '650px' : '100%' }}>
                                  <SmartWidgetRenderer
                                    data={pythonPreviewResult.rechartsData}
                                    config={pythonPreviewResult.rechartsConfig}
                                    onRefresh={() => { }}
                                    isRefreshing={false}
                                  />
                                </div>
                              ) : pythonPreviewResult.chartHtml ? (
                                <iframe
                                  srcDoc={`<html><head><style>body { margin: 0; padding: 0; background: transparent; overflow: hidden; }</style></head><body>${pythonPreviewResult.chartHtml}<script>window.onload = function() { const height = document.body.scrollHeight; window.parent.postMessage({ height: height, id: 'python-preview-iframe' }, '*'); };</script></body></html>`}
                                  className="w-full border-none"
                                  title="Interactive Chart"
                                  onLoad={(e) => {
                                    // Auto-resize iframe to fit content
                                    const iframe = e.target as HTMLIFrameElement;
                                    if (iframe.contentWindow) {
                                      setTimeout(() => {
                                        try {
                                          // Try to get height from body
                                          const height = iframe.contentWindow?.document.body.scrollHeight;
                                          if (height && height > 100) {
                                            iframe.style.height = (height + 20) + 'px';
                                          } else {
                                            iframe.style.height = '600px'; // Fallback minimum
                                          }
                                        } catch (err) {
                                          // Cross-origin fallback
                                          iframe.style.height = '600px';
                                        }
                                      }, 500);
                                    }
                                  }}
                                  style={{ height: '600px', minHeight: '100%' }}
                                />
                              ) : pythonPreviewResult.chartBase64 ? (
                                <img src={`data:image/png;base64,${pythonPreviewResult.chartBase64}`} alt="Chart Preview" className="block mx-auto w-full h-auto" />
                              ) : (
                                <div className="p-8 text-center text-muted-foreground italic text-xs">Nessun grafico generato</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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

                    {/* Pipeline Execution Visualization */}
                    {executionPipeline.length > 0 && (
                      <div className="mb-4 border rounded-md overflow-hidden bg-muted/20 animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* Header */}
                        <div className="p-2 px-3 bg-muted/40 border-b flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                            <GitBranch className="h-3.5 w-3.5" />
                            Pipeline di Esecuzione
                          </h4>
                          {isPipelineExecuting && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        </div>

                        {/* Steps List */}
                        <div className="max-h-[200px] overflow-y-auto">
                          {executionPipeline.map((step, idx) => (
                            <div key={idx} className={`flex items-center justify-between p-2 px-3 border-b last:border-0 text-xs text-foreground ${step.status === 'running' ? 'bg-background shadow-sm' : ''}`}>
                              <div className="flex items-center gap-3">
                                <span className="w-4 flex justify-center">
                                  {step.status === 'pending' && <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />}
                                  {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                  {step.status === 'success' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                  {step.status === 'error' && <X className="h-3.5 w-3.5 text-red-600" />}
                                  {step.status === 'skipped' && <div className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                                </span>
                                <div className="flex flex-col">
                                  <span className={step.status === 'running' ? 'font-medium text-primary' : ''}>
                                    {step.name}
                                    {step.type === 'export' && <Upload className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                                  </span>
                                  {step.message && <span className={`text-[10px] ${step.status === 'error' ? 'text-red-500' : step.status === 'skipped' ? 'text-yellow-600' : 'text-muted-foreground'}`}>{step.message}</span>}
                                </div>
                                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted uppercase tracking-wider scale-90 origin-left">{step.type}</span>
                              </div>
                              {step.executionTime && <span className="text-[10px] text-muted-foreground font-mono">{step.executionTime}ms</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Execute Button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={sqlExportStatus === 'running' || sqlExportSourceTables.length === 0 || !sqlExportTargetConnectorId || !sqlExportTargetTableName}
                      onClick={async () => {
                        executeFullPipeline('export', async () => {
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
                                    (ancestorTable.pipelineDependencies || []).map(d => ({
                                      tableName: d.tableName,
                                      query: d.query,
                                      isPython: d.isPython,
                                      pythonCode: d.pythonCode,
                                      connectorId: d.connectorId,
                                      pipelineDependencies: (d as any).pipelineDependencies
                                    })),
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
                              throw new Error(result.error || 'Errore durante esportazione');
                            }
                          } catch (e: any) {
                            setSqlExportStatus('error');
                            setSqlExportError(e.message || 'Errore durante l\'esportazione');
                            throw e;
                          }
                        });
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
              {emailConfig.enabled && (
                <CollapsibleSection
                  title="Invio Email"
                  count={1}
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
                          availableCharts={[
                            ...(pythonResultName && pythonOutputType === 'chart' ? [{ name: pythonResultName }] : []),
                            ...(availableInputTables?.filter(t => t.pythonOutputType === 'chart').map(t => ({ name: t.name })) || [])
                          ]}
                          availableVariables={[
                            ...(pythonResultName && pythonOutputType === 'variable' ? [{ name: pythonResultName }] : []),
                            ...(availableInputTables?.filter(t => t.pythonOutputType === 'variable').map(t => ({ name: t.name })) || [])
                          ]}
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
                                    <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-0.5">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 text-[10px] px-1.5 flex-shrink-0"
                                        onClick={() => editorRef.current?.insertPlaceholder('TABELLA', table.name)}
                                      >
                                        <Download className="h-3 w-3 mr-1" /> Inserisci
                                      </Button>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <label className="flex items-center gap-1 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={safeEmailAttachments.tablesInBody.includes(table.name)}
                                            onChange={(e) => {
                                              setEmailConfig(prev => ({
                                                ...prev,
                                                attachments: {
                                                  ...prev.attachments,
                                                  tablesInBody: e.target.checked
                                                    ? [...prev.attachments.tablesInBody, table.name]
                                                    : prev.attachments.tablesInBody.filter(t => t !== table.name)
                                                }
                                              }));
                                            }}
                                            className="rounded w-3 w-3"
                                          />
                                          <span className="text-muted-foreground text-[10px]">In Corpo</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
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
                                            className="rounded w-3 w-3"
                                          />
                                          <span className="text-muted-foreground text-[10px]">Excel</span>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {sqlResultName && (
                                  <div className="bg-background border rounded p-2 text-xs hover:border-primary/50 transition-colors border-l-4 border-l-primary/30">
                                    <div className="font-medium mb-1.5 truncate" title={sqlResultName}>Output: {sqlResultName}</div>
                                    <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-0.5">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 text-[10px] px-1.5 flex-shrink-0"
                                        onClick={() => editorRef.current?.insertPlaceholder('TABELLA', sqlResultName)}
                                      >
                                        <Download className="h-3 w-3 mr-1" /> Inserisci
                                      </Button>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <label className="flex items-center gap-1 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={safeEmailAttachments.tablesInBody.includes(sqlResultName)}
                                            onChange={(e) => {
                                              setEmailConfig(prev => ({
                                                ...prev,
                                                attachments: {
                                                  ...prev.attachments,
                                                  tablesInBody: e.target.checked
                                                    ? [...prev.attachments.tablesInBody, sqlResultName]
                                                    : prev.attachments.tablesInBody.filter(t => t !== sqlResultName)
                                                }
                                              }));
                                            }}
                                            className="rounded w-3 w-3"
                                          />
                                          <span className="text-muted-foreground text-[10px]">In Corpo</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
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
                                            className="rounded w-3 w-3"
                                          />
                                          <span className="text-muted-foreground text-[10px]">Excel</span>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Python Outputs */}
                          {/* Python Outputs (Current + Ancestors) */}
                          {(() => {
                            const allPythonOutputs = [
                              ...(pythonResultName && pythonCode ? [{
                                name: pythonResultName,
                                type: pythonOutputType,
                                isCurrent: true
                              }] : []),
                              ...(availableInputTables || [])
                                .filter(t => t.isPython && t.pythonCode && t.name !== pythonResultName)
                                .map(t => ({
                                  name: t.name,
                                  type: t.pythonOutputType || 'table', // Fallback to table if unknown, but visual-tree should provide it
                                  isCurrent: false
                                }))
                            ];

                            if (allPythonOutputs.length === 0) return null;

                            return (
                              <div className="space-y-2 pt-2 border-t">
                                <p className="text-xs font-semibold flex items-center gap-1.5 text-purple-600">
                                  <Code className="h-3.5 w-3.5" /> Output Python
                                </p>
                                {allPythonOutputs.map((output, idx) => (
                                  <div key={`${output.name}-${idx}`} className="bg-background border rounded p-2 text-xs hover:border-purple-300 transition-colors border-l-4 border-l-purple-500/30 mb-1.5 last:mb-0">
                                    <div className="font-medium mb-1.5 truncate" title={output.name}>
                                      {output.name} <span className="opacity-70 text-[10px]">({output.type} {output.isCurrent ? '- Corrente' : '- Collegato'})</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-0.5">
                                      {output.type === 'chart' && (
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          className="h-6 text-[10px] px-1.5 flex-shrink-0"
                                          onClick={() => editorRef.current?.insertPlaceholder('GRAFICO', output.name)}
                                        >
                                          <BarChart3 className="h-3 w-3 mr-1" /> Grafico
                                        </Button>
                                      )}
                                      {output.type === 'table' && (
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          className="h-6 text-[10px] px-1.5 flex-shrink-0"
                                          onClick={() => editorRef.current?.insertPlaceholder('TABELLA', output.name)}
                                        >
                                          <Download className="h-3 w-3 mr-1" /> Tabella
                                        </Button>
                                      )}
                                      {output.type === 'variable' && (
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          className="h-6 text-[10px] px-1.5 flex-shrink-0"
                                          onClick={() => editorRef.current?.insertPlaceholder('VARIABILE', output.name)}
                                        >
                                          <Code className="h-3 w-3 mr-1" /> Variabile
                                        </Button>
                                      )}
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <label className="flex items-center gap-1 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={safeEmailAttachments.pythonOutputsInBody.includes(output.name)}
                                            onChange={(e) => {
                                              setEmailConfig(prev => ({
                                                ...prev,
                                                attachments: {
                                                  ...prev.attachments,
                                                  pythonOutputsInBody: e.target.checked
                                                    ? [...prev.attachments.pythonOutputsInBody, output.name]
                                                    : prev.attachments.pythonOutputsInBody.filter(t => t !== output.name)
                                                }
                                              }));
                                            }}
                                            className="rounded w-3 w-3"
                                          />
                                          <span className="text-muted-foreground text-[10px]">In Corpo</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer bg-muted/50 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            checked={safeEmailAttachments.pythonOutputsAsAttachment.includes(output.name)}
                                            onChange={(e) => {
                                              setEmailConfig(prev => ({
                                                ...prev,
                                                attachments: {
                                                  ...prev.attachments,
                                                  pythonOutputsAsAttachment: e.target.checked
                                                    ? [...prev.attachments.pythonOutputsAsAttachment, output.name]
                                                    : prev.attachments.pythonOutputsAsAttachment.filter(t => t !== output.name)
                                                }
                                              }));
                                            }}
                                            className="rounded w-3 w-3"
                                          />
                                          <span className="text-muted-foreground text-[10px]">Allega</span>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

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

                    {/* Pipeline Execution Visualization */}
                    {executionPipeline.length > 0 && (
                      <div className="mb-4 border rounded-md overflow-hidden bg-muted/20 animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* Header */}
                        <div className="p-2 px-3 bg-muted/40 border-b flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                            <GitBranch className="h-3.5 w-3.5" />
                            Pipeline di Esecuzione
                          </h4>
                          {isPipelineExecuting && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        </div>

                        {/* Steps List */}
                        <div className="max-h-[200px] overflow-y-auto">
                          {executionPipeline.map((step, idx) => (
                            <div key={idx} className={`flex items-center justify-between p-2 px-3 border-b last:border-0 text-xs text-foreground ${step.status === 'running' ? 'bg-background shadow-sm' : ''}`}>
                              <div className="flex items-center gap-3">
                                <span className="w-4 flex justify-center">
                                  {step.status === 'pending' && <div className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />}
                                  {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                                  {step.status === 'success' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                  {step.status === 'error' && <X className="h-3.5 w-3.5 text-red-600" />}
                                  {step.status === 'skipped' && <div className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                                </span>
                                <div className="flex flex-col">
                                  <span className={step.status === 'running' ? 'font-medium text-primary' : ''}>
                                    {step.name}
                                    {step.type === 'export' && <Upload className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                                  </span>
                                  {step.message && <span className={`text-[10px] ${step.status === 'error' ? 'text-red-500' : step.status === 'skipped' ? 'text-yellow-600' : 'text-muted-foreground'}`}>{step.message}</span>}
                                </div>
                                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted uppercase tracking-wider scale-90 origin-left">{step.type}</span>
                              </div>
                              {step.executionTime && <span className="text-[10px] text-muted-foreground font-mono">{step.executionTime}ms</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Test Email Button */}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        disabled={!emailConfig.connectorId || !emailConfig.to || !emailConfig.subject || isSendingTestEmail}
                        onClick={async () => {
                          executeFullPipeline('email', async (ancestorResults, executionReport) => {
                            setIsSendingTestEmail(true);
                            try {
                              // Build selectedTables from user selections
                              const selectedTables: Array<{ name: string; displayName?: string; query: string; inBody: boolean; asExcel: boolean; pipelineDependencies?: Array<{ tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }> }> = [];

                              // Build selectedPythonOutputs from user selections
                              const selectedPythonOutputs: Array<{
                                name: string;
                                displayName?: string;
                                code: string;
                                outputType: 'table' | 'variable' | 'chart';
                                connectorId?: string;
                                inBody: boolean;
                                asAttachment: boolean;
                                dependencies?: Array<{ tableName: string; connectorId?: string; query?: string; pipelineDependencies?: any[] }>;
                              }> = [];

                              // Extract names referenced in placeholders from email body
                              const bodyContent = emailConfig.body || '';
                              const placeholderTableNames = (bodyContent.match(/\{\{TABELLA:([^}]+)\}\}/g) || []).map(m => m.replace(/\{\{TABELLA:|}\}/g, ''));
                              const placeholderChartNames = (bodyContent.match(/\{\{GRAFICO:([^}]+)\}\}/g) || []).map(m => m.replace(/\{\{GRAFICO:|}\}/g, ''));
                              const placeholderVarNames = (bodyContent.match(/\{\{VARIABILE:([^}]+)\}\}/g) || []).map(m => m.replace(/\{\{VARIABILE:|}\}/g, ''));

                              // All referenced names for Python selection
                              const allReferencedPythonNames = [...placeholderTableNames, ...placeholderChartNames, ...placeholderVarNames];

                              // 1. Process SQL Results (Ancestors)
                              if (availableInputTables && availableInputTables.length > 0) {
                                for (const table of availableInputTables) {
                                  if (table.isPython) continue; // Skip Python, handled in potentialPythonOutputs loop

                                  const inBody = safeEmailAttachments.tablesInBody.includes(table.name) || placeholderTableNames.includes(table.name);
                                  const asExcel = safeEmailAttachments.tablesAsExcel.includes(table.name);

                                  if (inBody || asExcel) {
                                    selectedTables.push({
                                      name: table.name,
                                      displayName: table.nodeName ? `${table.nodeName} > ${table.name}` : table.name,
                                      query: table.sqlQuery || `SELECT * FROM ${table.name}`,
                                      inBody,
                                      asExcel,
                                      pipelineDependencies: table.pipelineDependencies
                                    });
                                  }
                                }
                              }

                              // 2. Process SQL Result (Current Node)
                              if (sqlResultName && sqlQuery) {
                                const inBody = safeEmailAttachments.tablesInBody.includes(sqlResultName) || placeholderTableNames.includes(sqlResultName);
                                const asExcel = safeEmailAttachments.tablesAsExcel.includes(sqlResultName);
                                if (inBody || asExcel) {
                                  // Build pipelineDependencies from selectedPipelines
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

                                  selectedTables.push({
                                    name: sqlResultName,
                                    displayName: (questionText?.trim() || decisionText?.trim()) ? `${questionText?.trim() || decisionText?.trim()} > ${sqlResultName}` : sqlResultName,
                                    query: sqlQuery,
                                    inBody,
                                    asExcel,
                                    pipelineDependencies: currentNodeDeps.length > 0 ? currentNodeDeps : undefined
                                  });
                                }
                              }

                              // 3. Process Python Outputs
                              // Helper to build dependencies for a Python execution
                              const buildDependencies = (sourceName: string, isCurrentNode: boolean = false, overrideDeps?: any[]) => {
                                if (!isCurrentNode) return overrideDeps || [];

                                const dependencies: Array<{ tableName: string; connectorId?: string; query?: string; isPython?: boolean; pythonCode?: string; pipelineDependencies?: any[] }> = [];
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
                                return dependencies;
                              };

                              // Combined list of ALL potential outputs (Current + Ancestors)
                              const allPotentialOutputs = [
                                ...(pythonResultName && pythonCode ? [{
                                  name: pythonResultName,
                                  code: pythonCode,
                                  outputType: pythonOutputType,
                                  connectorId: pythonConnectorId,
                                  isCurrent: true,
                                  dependenciesOverride: null as any
                                }] : []),
                                ...(availableInputTables || [])
                                  .filter(t => t.isPython && t.pythonCode && t.name !== pythonResultName)
                                  .map(t => ({
                                    name: t.name,
                                    nodeName: t.nodeName,
                                    code: t.pythonCode!,
                                    outputType: t.pythonOutputType || 'table',
                                    connectorId: t.connectorId,
                                    isCurrent: false,
                                    dependenciesOverride: t.pipelineDependencies
                                  }))
                              ];

                              // Iterate over all potential outputs and add if selected or placed in body
                              for (const output of allPotentialOutputs) {
                                const inBody = safeEmailAttachments.pythonOutputsInBody.includes(output.name) || allReferencedPythonNames.includes(output.name);
                                const asAttachment = safeEmailAttachments.pythonOutputsAsAttachment.includes(output.name);

                                if (inBody || asAttachment) {
                                  let dependencies = output.dependenciesOverride || [];

                                  if (output.isCurrent) {
                                    // Re-calculate dependencies for current node to ensure latest state
                                    dependencies = buildDependencies(output.name, true);

                                    // Add current node's SQL result as dependency if exists
                                    if (sqlResultName && sqlQuery) {
                                      // Build SQL deps
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

                                      dependencies.push({
                                        tableName: sqlResultName,
                                        connectorId: sqlConnectorId || sqlExportTargetConnectorId,
                                        query: sqlQuery,
                                        isPython: false,
                                        pipelineDependencies: sqlDeps.length > 0 ? sqlDeps : undefined
                                      });
                                    }
                                  }

                                  selectedPythonOutputs.push({
                                    name: output.name,
                                    displayName: output.isCurrent ?
                                      ((questionText?.trim() || decisionText?.trim()) ? `${questionText?.trim() || decisionText?.trim()} > ${output.name}` : output.name) :
                                      ('nodeName' in output && output.nodeName ? `${output.nodeName} > ${output.name}` : output.name),
                                    code: output.code,
                                    outputType: output.outputType as any,
                                    connectorId: output.connectorId,
                                    inBody,
                                    asAttachment,
                                    dependencies: dependencies.length > 0 ? dependencies : undefined
                                  });
                                }
                              }


                              // Infer SQL Connector ID if not explicitly set
                              // Priority: 1) current node's SQL connector, 2) sqlExportTargetConnectorId (DB dest), 3) ancestor tables
                              let effectiveSqlConnectorId = '';

                              if (selectedTables.length > 0) {
                                for (const t of selectedTables) {
                                  // First, check if this is the CURRENT NODE's SQL result
                                  if (t.name === sqlResultName) {
                                    // Priority 1: Use sqlConnectorId (the SQL query execution connector)
                                    if (sqlConnectorId) {
                                      effectiveSqlConnectorId = sqlConnectorId;
                                      break;
                                    }
                                    // Priority 2: Use sqlExportTargetConnectorId (the Database Destinazione selector)
                                    if (sqlExportTargetConnectorId) {
                                      effectiveSqlConnectorId = sqlExportTargetConnectorId;
                                      break;
                                    }
                                  }

                                  // Priority 3: Look in ancestor tables
                                  if (availableInputTables) {
                                    const sourceTable = availableInputTables.find(at => at.name === t.name);
                                    if (sourceTable && sourceTable.connectorId) {
                                      effectiveSqlConnectorId = sourceTable.connectorId;
                                      break;
                                    }
                                  }
                                }
                              }

                              const res = await sendTestEmailWithDataAction({
                                connectorId: emailConfig.connectorId!,
                                sqlConnectorId: effectiveSqlConnectorId || sqlConnectorId || sqlExportTargetConnectorId || '',
                                to: emailConfig.to,
                                cc: emailConfig.cc,
                                bcc: emailConfig.bcc,
                                subject: emailConfig.subject,
                                bodyHtml: bodyContent,
                                selectedTables,
                                selectedPythonOutputs,
                                availableMedia: [...(availableParentMedia || []), ...media],
                                availableLinks: [...(availableParentLinks || []), ...links],
                                availableTriggers: availableParentTriggers,
                                mediaAttachments: emailConfig.attachments?.mediaAsAttachment || [],
                                preCalculatedResults: ancestorResults,
                                pipelineReport: executionReport
                              });

                              if (res.success) {
                                toast({
                                  title: "Email Inviata",
                                  description: "L'email di test è stata inviata con successo.",
                                });
                              } else {
                                toast({
                                  variant: 'destructive',
                                  title: "Errore Invio Email",
                                  description: res.error,
                                });
                                throw new Error(res.error);
                              }
                            } catch (e: any) {
                              toast({
                                variant: 'destructive',
                                title: "Errore",
                                description: e.message,
                              });
                              throw e;
                            } finally {
                              setIsSendingTestEmail(false);
                            }
                          });
                        }}
                      >
                        {isSendingTestEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Invia Email di Test
                      </Button>

                    </div>
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
