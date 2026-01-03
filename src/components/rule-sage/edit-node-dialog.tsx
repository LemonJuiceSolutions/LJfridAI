

'use client';

import { useEffect, useState, useRef } from 'react';
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
import { Loader2, Trash2, Eye, Video, Image as ImageIcon, Link as LinkIcon, Zap, Pencil, Check, X, Database, Bot, GitBranch, Flag, Code, Table, Variable, BarChart3, Play, Download, LineChart } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf, DecisionNode, MediaItem, LinkItem, TriggerItem } from '@/lib/types';
import { Input } from '../ui/input';
import _ from 'lodash';
import { useToast } from '@/hooks/use-toast';
import { executeTriggerAction, generateSqlAction, executeSqlPreviewAction, getConnectorsAction, fetchTableSchemaAction, generatePythonAction, executePythonPreviewAction } from '@/app/actions';
import { uploadFile } from '@/lib/storage-client';
import Image from 'next/image';
import { ScrollArea } from '../ui/scroll-area';
import { DataTable } from '../ui/data-table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';

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
    const savedState = localStorage.getItem(storageKey);
    if (savedState !== null) {
      setIsOpen(savedState === 'true');
    } else {
      // Default rule: open if has items, closed otherwise
      setIsOpen(count > 0);
    }
    setHasLoaded(true);
  }, [storageKey, count]);

  const toggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    localStorage.setItem(storageKey, String(newState));
  };

  if (!hasLoaded) return null; // Avoid hydration mismatch or flash

  return (
    <Collapsible open={isOpen} onOpenChange={toggle} className="border border-border/50 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50">
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
  availableInputTables?: { name: string, connectorId?: string, sqlQuery?: string, pipelineDependencies?: { tableName: string; query: string }[] }[];
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
}: EditNodeDialogProps) {
  const { toast } = useToast();

  // Local state for node type switching (Question <-> Decision)
  const [currentNodeType, setCurrentNodeType] = useState<'question' | 'decision'>(nodeType);
  const [pendingTypeChange, setPendingTypeChange] = useState<'question' | 'decision' | null>(null);

  // Helper to request type change with confirmation
  const requestTypeChange = (targetType: 'question' | 'decision') => {
    if (currentNodeType === targetType) return;

    // Always ask for confirmation as requested by user ("chiedimi conferma prima di procedere")
    // Use pendingTypeChange to trigger the dialog
    setPendingTypeChange(targetType);
  };

  const confirmTypeChange = () => {
    if (pendingTypeChange) {
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
  const [sqlPreviewData, setSqlPreviewData] = useState<any[] | null>(null);

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
    variables?: Record<string, any>;
    chartBase64?: string;
    chartHtml?: string;
    debugLogs?: string[];
  } | null>(null);
  const [pythonConnectorId, setPythonConnectorId] = useState<string>('');
  const [pythonSelectedPipelines, setPythonSelectedPipelines] = useState<string[]>([]);
  const [pythonDebugLogs, setPythonDebugLogs] = useState<string[]>([]);

  const isExecutingRef = useRef(false);

  // State for inline editing links
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

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
      setMedia(nodeMedia.map(m => ({ ...m, name: m.name || m.url.split('/').pop()?.split('?')[0] || "File" })));


      // Handle legacy string links and convert them to the new object format
      const normalizedLinks = ('links' in node && Array.isArray(node.links))
        ? node.links.map(link => {
          if (typeof link === 'string') {
            return { name: link, url: link }; // Legacy: use URL as name
          }
          return link;
        }).filter((l): l is LinkItem => l && (l as any).url)
        : [];
      setLinks(normalizedLinks);

      // Handle legacy string triggers and convert them
      const normalizedTriggers = ('triggers' in node && Array.isArray(node.triggers))
        ? node.triggers.map(trigger => {
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

      // Load Python Script Data
      setPythonCode((node as any).pythonCode || '');
      setPythonOutputType((node as any).pythonOutputType || 'table');
      setPythonResultName((node as any).pythonResultName || '');
      setPythonConnectorId((node as any).pythonConnectorId || '');
      setPythonSelectedPipelines((node as any).pythonSelectedPipelines || []);
      setPythonPreviewResult(null);

    }
  }, [isOpen, initialNode, nodeType, availableInputTables]);

  // Load Connectors
  useEffect(() => {
    if (isOpen) {
      const loadConnectors = async () => {
        // const { getConnectorsAction } = await import('@/app/actions'); // Refactored to static

        const res = await getConnectorsAction();
        if (res.data) {
          const sqls = res.data.filter((c: any) => c.type === 'SQL').map((c: any) => ({ id: c.id, name: c.name }));
          setSqlConnectors(sqls);
          // If no connector selected but we have some, maybe select first? No, explicit is better.
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

  const handleSaveClick = async () => {
    // Validation based on CURRENT node type
    if (currentNodeType === 'question' && !('option' in initialNode) && !questionText.trim()) {
      toast({ title: 'Il testo della domanda è obbligatorio', variant: 'destructive' });
      return;
    }
    if (currentNodeType === 'decision' && !decisionText.trim()) {
      toast({ title: 'Il testo della decisione è obbligatorio', variant: 'destructive' });
      return;
    }

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

      // Handle Node Type Logic
      if (currentNodeType === 'question') {
        // Ensure it has question structure
        // If converting from Decision, we need to add question and remove decision
        newNodeData.question = questionText;
        if ('decision' in newNodeData) delete newNodeData.decision;

        if (!newNodeData.options) newNodeData.options = {};

        // Keep other fields
        if (finalMedia.length > 0) newNodeData.media = finalMedia;
        else delete newNodeData.media;

        if (links.length > 0) newNodeData.links = links;
        else delete newNodeData.links;

        if (triggers.length > 0) newNodeData.triggers = triggers;
        else delete newNodeData.triggers;

        // SQL Data (Questions can have SQL generally, though usually Leaf has it? Actually prompts say questions can have dynamic data)
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

      } else if (currentNodeType === 'decision') {
        // Ensure it has Decision structure
        // If converting from Question, we remove question and OPTIONS (the destructive part)
        newNodeData.decision = decisionText;
        if ('question' in newNodeData) delete newNodeData.question;
        if ('options' in newNodeData) delete newNodeData.options;

        if (finalMedia.length > 0) newNodeData.media = finalMedia;
        else delete newNodeData.media;

        if (links.length > 0) newNodeData.links = links;
        else delete newNodeData.links;

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

      } else if ('option' in initialNode) {
        // Option node, no type switch allowed
        newNodeData = { option: optionText };
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
    description = "Modifica il testo dell'opzione di risposta.";
  } else if (currentNodeType === 'decision') {
    title = 'Modifica Risultato Finale';
    description = "Specifica il risultato finale o l'azione da intraprendere.";
  }

  const canSave = !componentIsSaving && (
    (currentNodeType === 'question' && !('option' in initialNode) && questionText.trim() !== '') ||
    (currentNodeType === 'question' && 'option' in initialNode && optionText.trim() !== '') ||
    (currentNodeType === 'decision' && decisionText.trim() !== '')
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
      <Dialog open={isOpen} onOpenChange={(open) => !open && !componentIsSaving && onClose()}>
        <DialogContent className="sm:max-w-[75vw] md:max-w-[75vw] lg:max-w-[75vw] !max-w-[75vw] w-[75vw]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div className='grid gap-1.5'>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
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
                                placeholder="Path/ID trigger..."
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
                    {media.map((item, index) => (
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
                        {sqlConnectors.map((c: any) => (
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
                        {availableInputTables.map(t => (
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

                  {/* Enhanced Chatbot UI for Generation */}
                  <div className="bg-muted/30 border rounded-lg overflow-hidden flex flex-col">
                    {/* Chat Header */}
                    <div className="bg-muted/50 p-2 px-3 border-b flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5" />
                        AI Data Assistant
                      </span>
                      {agentStatus && (
                        <div className="bg-background text-[10px] h-5 gap-1 flex items-center px-2 rounded-full border">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          {agentStatus.replace('...', '')}
                        </div>
                      )}
                    </div>

                    {/* Chat Body */}
                    <div className="p-4 min-h-[100px] flex flex-col gap-3">
                      {/* Intro */}
                      <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-primary" />
                        </div>
                        <div className="bg-white dark:bg-zinc-800 p-2.5 rounded-2xl rounded-tl-sm text-sm border shadow-sm max-w-[85%]">
                          <p>Ciao! Posso aiutarti a scrivere query SQL per i tuoi dati. Dimmi cosa ti serve estrarre.</p>
                        </div>
                      </div>

                      {/* Active Status */}
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

                    {/* Input Area */}
                    <div className="p-2 border-t bg-background flex gap-2">
                      <Input
                        placeholder="Descrivi cosa estrarre (es. 'Tutti i clienti attivi')"
                        className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent"
                        id="ai-prompt-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            // Trigger click on button
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
                          // Get API key and model from local storage
                          const apiKey = localStorage.getItem('openrouter_api_key') || '';
                          const model = localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-001';

                          if (!apiKey) {
                            toast({ variant: 'destructive', title: "Configurazione Mancante", description: "Imposta la chiave API nelle Impostazioni." });
                            return;
                          }

                          setAgentStatus("Analisi Schema in corso...");

                          // Fetch Schema with array args
                          fetchTableSchemaAction(
                            sqlConnectorId || '', // connectorId (string)
                            selectedPipelines.map(p => p.split(':')[1]) // tableNames (string[])
                          ).then((schemaRes) => {
                            let schemaContext = schemaRes.schemaContext;

                            // Continue even if schema error (maybe just no schema found)
                            if (schemaRes.error) {
                              console.warn("Schema fetch warning:", schemaRes.error);
                            }

                            setAgentStatus("Generazione Query SQL...");

                            // Generate SQL with correct args
                            generateSqlAction(
                              userPrompt, // userDescription
                              { apiKey, model }, // openRouterConfig
                              sqlConnectorId, // connectorId
                              schemaContext || undefined // schemaContextArgs
                            ).then((res) => {
                              if (res.sql) {
                                setSqlQuery(res.sql);
                                toast({ title: "SQL Generato!", description: "La query è stata scritta nell'editor." });
                              } else {
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

                  {/* SQL Editor & Preview */}
                  <div className="grid gap-2">
                    <Label>Query SQL</Label>
                    <Textarea
                      value={sqlQuery}
                      onChange={(e) => setSqlQuery(e.target.value)}
                      className="font-mono text-sm h-32"
                      placeholder="SELECT * FROM ..."
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!sqlQuery) {
                          toast({ variant: 'destructive', title: "Errore", description: "Inserisci una query SQL prima di eseguire l'anteprima." });
                          return;
                        }
                        setAgentStatus("Esecuzione Query...");

                        // Build Dependencies for Execution
                        let pipelineDeps: { tableName: string, query: string }[] = [];
                        if (availableInputTables && availableInputTables.length > 0) {
                          // Include ALL available tables as dependencies if they are referenced
                          // Or better, include active pipelines? 
                          // Current logic: Include EVERYTHING so user can query it? 
                          // Or better: Filter based on `selectedPipelines`? 
                          // Usually `availableInputTables` ARE the dependencies.
                          pipelineDeps = availableInputTables.map(table => ({
                            tableName: table.name,
                            query: table.sqlQuery || ''
                          })).filter(d => d.query !== '' && selectedPipelines.includes(d.tableName));

                          // If logic requires *all* previous nodes to be available regardless of selection (implicit context), 
                          // then we might need to change this. But assuming explicit selection is better.
                          // Actually the user screenshot shows they selected "HR1".
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

                  {/* Data Preview Table */}
                  {sqlPreviewData && (
                    <div className="border rounded-md overflow-hidden max-w-full">
                      <div className="flex justify-between items-center bg-muted/50 p-2 border-b">
                        <span className="font-semibold text-xs flex items-center gap-2">
                          <Database className="h-3 w-3" />
                          Risultati Anteprima
                        </span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSqlPreviewData(null)}><X className="h-3 w-3" /></Button>
                      </div>
                      <DataTable
                        data={sqlPreviewData}
                      />
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Label>Nome Tabella Risultato (Opzionale)</Label>
                    <Input
                      value={sqlResultName}
                      onChange={(e) => setSqlResultName(e.target.value)}
                      placeholder="Es. ClientiAttivi (per riutilizzo in altri nodi)"
                    />
                    <p className="text-[10px] text-muted-foreground">Dai un nome a questa tabella per usarla come input nei nodi successivi (JOIN).</p>
                  </div>

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
                        {sqlConnectors.map((c: any) => (
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
                        {availableInputTables.map(t => (
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

                  {/* AI Chatbot for Python Generation */}
                  <div className="bg-muted/30 border rounded-lg overflow-hidden flex flex-col">
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

                    <div className="p-4 min-h-[80px] flex flex-col gap-3">
                      <div className="flex gap-3">
                        <div className="h-8 w-8 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-yellow-600" />
                        </div>
                        <div className="bg-white dark:bg-zinc-800 p-2.5 rounded-2xl rounded-tl-sm text-sm border shadow-sm max-w-[85%]">
                          <p>Ciao! Posso generare script Python per {pythonOutputType === 'table' ? 'tabelle' : pythonOutputType === 'variable' ? 'variabili' : 'grafici'}. Dimmi cosa ti serve.</p>
                        </div>
                      </div>

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

                    <div className="p-2 border-t bg-background flex gap-2">
                      <Input
                        placeholder={`Descrivi ${pythonOutputType === 'table' ? 'la tabella' : pythonOutputType === 'variable' ? 'le variabili' : 'il grafico'} da generare...`}
                        className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent"
                        id="python-prompt-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            const btn = document.getElementById('python-send-btn');
                            if (btn) btn.click();
                          }
                        }}
                      />
                      <Button
                        id="python-send-btn"
                        size="sm"
                        className="gap-2 rounded-lg bg-yellow-600 hover:bg-yellow-700"
                        disabled={!!pythonAgentStatus}
                        onClick={() => {
                          const input = document.getElementById('python-prompt-input') as HTMLInputElement;
                          if (!input || !input.value) return;

                          const userPrompt = input.value;
                          const apiKey = localStorage.getItem('openrouter_api_key') || '';
                          const model = localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-001';

                          if (!apiKey) {
                            toast({ variant: 'destructive', title: "Configurazione Mancante", description: "Imposta la chiave API nelle Impostazioni." });
                            return;
                          }

                          setPythonAgentStatus("Generazione Codice Python...");

                          // Call generatePythonAction (to be created)
                          generatePythonAction(userPrompt, { apiKey, model }, pythonOutputType).then((res) => {
                            if (res.code) {
                              setPythonCode(res.code);
                              toast({ title: "Codice Generato!", description: "Lo script Python è stato inserito nell'editor." });
                            } else {
                              toast({ variant: 'destructive', title: "Errore AI", description: res.error || "Errore sconosciuto" });
                            }
                            setPythonAgentStatus(null);
                          });
                        }}
                      >
                        {pythonAgentStatus ? 'Elaborazione...' : 'Invia'}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Python Code Editor */}
                  <div className="grid gap-2">
                    <Label>Codice Python</Label>
                    <Textarea
                      value={pythonCode}
                      onChange={(e) => setPythonCode(e.target.value)}
                      className="font-mono text-sm h-40"
                      placeholder={`# ${pythonOutputType === 'table' ? 'Ritorna un DataFrame Pandas' : pythonOutputType === 'variable' ? 'Ritorna un dizionario di variabili' : 'Ritorna una figura Matplotlib/Plotly'}\n`}
                    />
                  </div>

                  {/* Preview Button */}

                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!pythonCode) {
                          toast({ variant: 'destructive', title: "Errore", description: "Inserisci del codice Python prima di eseguire l'anteprima." });
                          return;
                        }

                        // Reset visual state
                        setPythonAgentStatus("Recupero Dati in corso...");
                        setPythonProgressStep(1);
                        isExecutingRef.current = true;

                        // Simulate progress phases
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

                        // Prepara i dati di input e le dipendenze dai nodi selezionati
                        // Include pipelineDependencies for cascading SQL execution
                        const dependencies: { tableName: string; connectorId?: string; query?: string; pipelineDependencies?: { tableName: string; query: string }[] }[] = [];
                        if (availableInputTables) {
                          pythonSelectedPipelines.forEach(pName => {
                            const table = availableInputTables.find(t => t.name === pName);
                            if (table) {
                              dependencies.push({
                                tableName: pName,
                                connectorId: table.connectorId,
                                query: table.sqlQuery,
                                pipelineDependencies: table.pipelineDependencies // Pass ancestor queries
                              });
                            }
                          });
                        }

                        executePythonPreviewAction(pythonCode, pythonOutputType, {}, dependencies).then((res: any) => {
                          isExecutingRef.current = false;
                          setPythonAgentStatus(null);
                          setPythonProgressStep(0); // Reset on finish
                          if (res.success) {
                            setPythonPreviewResult({
                              type: pythonOutputType,
                              data: res.data,
                              variables: res.variables,
                              chartBase64: res.chartBase64,
                              chartHtml: res.chartHtml,
                              debugLogs: res.debugLogs
                            });
                            toast({ title: "Script Eseguito", description: "Anteprima pronta." });
                          } else {
                            toast({ variant: 'destructive', title: "Errore Python", description: res.error || "Errore sconosciuto" });
                          }
                        });
                      }}
                      disabled={!!pythonAgentStatus}
                    >
                      {pythonAgentStatus ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                      {pythonAgentStatus || "Esegui Anteprima"}
                    </Button>
                  </div>

                  {/* Visual Stepper "N Pallini" */}
                  {pythonAgentStatus && (
                    <div className="flex items-center justify-center gap-8 py-4 animate-in fade-in zoom-in-95 duration-300">
                      {/* Step 1: Dati */}
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pythonProgressStep >= 1 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pythonProgressStep > 1 ? <Check className="h-5 w-5" /> : <Database className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pythonProgressStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>Recupero Dati</span>
                      </div>

                      <div className={`h-0.5 w-16 transition-all ${pythonProgressStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />

                      {/* Step 2: Python */}
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pythonProgressStep >= 2 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          {pythonProgressStep > 2 ? <Check className="h-5 w-5" /> : <Code className="h-4 w-4" />}
                        </div>
                        <span className={`text-[10px] font-medium ${pythonProgressStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>Elaborazione</span>
                      </div>

                      <div className={`h-0.5 w-16 transition-all ${pythonProgressStep >= 3 ? 'bg-primary' : 'bg-muted'}`} />

                      {/* Step 3: Grafica */}
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all ${pythonProgressStep >= 3 ? 'border-primary bg-primary text-white' : 'border-muted text-muted-foreground'}`}>
                          <LineChart className="h-4 w-4" />
                        </div>
                        <span className={`text-[10px] font-medium ${pythonProgressStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>Rendering</span>
                      </div>
                    </div>
                  )}

                  {/* Preview Result */}
                  {pythonPreviewResult && (
                    <div className="border rounded-md overflow-hidden max-w-full">
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
                                const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pythonResultName || 'Chart Preview'}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; background-color: #f8fafc; }
    .chart-container { background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); padding: 20px; }
  </style>
</head>
<body>
  <div class="chart-container">
    ${pythonPreviewResult.chartHtml}
  </div>
</body>
</html>`;
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
                      {pythonPreviewResult.type === 'table' && pythonPreviewResult.data && (
                        <DataTable data={pythonPreviewResult.data} />
                      )}
                      {pythonPreviewResult.type === 'variable' && pythonPreviewResult.variables && (
                        <pre className="p-3 text-xs overflow-auto max-h-48">{JSON.stringify(pythonPreviewResult.variables, null, 2)}</pre>
                      )}
                      {pythonPreviewResult.type === 'chart' && (
                        <div className="bg-white dark:bg-zinc-950">
                          {pythonPreviewResult.chartHtml ? (
                            <div className="w-full h-[70vh] border-none overflow-auto">
                              <iframe
                                srcDoc={`
                                  <html>
                                    <head>
                                      <style>body { margin: 0; padding: 0; background: transparent; }</style>
                                    </head>
                                    <body>${pythonPreviewResult.chartHtml}</body>
                                  </html>
                                `}
                                className="w-full border-none"
                                style={{ minHeight: '100%', height: 'auto' }}
                                title="Interactive Chart"
                              />
                            </div>
                          ) : pythonPreviewResult.chartBase64 ? (
                            <img src={`data:image/png;base64,${pythonPreviewResult.chartBase64}`} alt="Chart Preview" className="max-w-full block mx-auto py-4" />
                          ) : (
                            <div className="p-8 text-center text-muted-foreground italic text-xs">Nessun grafico generato</div>
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

                  {/* Result Name */}
                  <div className="grid gap-2">
                    <Label>Nome Risultato (Opzionale)</Label>
                    <Input
                      value={pythonResultName}
                      onChange={(e) => setPythonResultName(e.target.value)}
                      placeholder="Es. DataAnalysis (per riutilizzo)"
                    />
                    <p className="text-[10px] text-muted-foreground">Dai un nome a questo risultato per usarlo in altri nodi.</p>
                  </div>

                </div>
              </CollapsibleSection>
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
                ? "Stai convertendo una Domanda in un Risultato. Tutte le opzioni e i nodi figli verranno eliminati. Questa azione non può essere annullata."
                : "Stai convertendo un Risultato in una Domanda. Il testo del risultato attuale verrà perso."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTypeChange}>Procedi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

