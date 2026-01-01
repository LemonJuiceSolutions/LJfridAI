

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
import { Loader2, Trash2, Eye, Video, Image as ImageIcon, Link as LinkIcon, Zap, Pencil, Check, X, Database, Bot, GitBranch, Flag } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf, DecisionNode, MediaItem, LinkItem, TriggerItem } from '@/lib/types';
import { Input } from '../ui/input';
import _ from 'lodash';
import { useToast } from '@/hooks/use-toast';
import { executeTriggerAction, generateSqlAction, executeSqlPreviewAction, getConnectorsAction, fetchTableSchemaAction } from '@/app/actions';
import { uploadFile } from '@/lib/storage-client';
import Image from 'next/image';
import { ScrollArea } from '../ui/scroll-area';
import { DataTable } from '../ui/data-table';

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
  availableInputTables?: { name: string, connectorId?: string, sqlQuery?: string }[];
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

        // Try to restore pipeline selection visual state
        if (query && availableInputTables.length > 0) {
          const foundPipelines: string[] = [];

          // scan query for table names
          availableInputTables.forEach(t => {
            // Simple check: does the query contain the table name?
            // We use a regex to ensure whole word match to avoid partial matches
            const regex = new RegExp(`\\b${t.name}\\b`, 'i');
            if (regex.test(query)) {
              foundPipelines.push(`pipeline:${t.name}:${t.connectorId || ''}`);

              // If we found a pipeline table and no connector is set, set it from the first one found
              if (t.connectorId && !connId) {
                setSqlConnectorId(t.connectorId);
              }
            }
          });

          if (foundPipelines.length > 0) {
            setSelectedPipelines(foundPipelines);
            console.log('[EDIT-DIALOG] Restored pipelines:', foundPipelines);
          } else {
            console.log('[EDIT-DIALOG] No pipeline tables found in query');
          }
        }
      }

      if (node && 'sqlResultName' in node) {
        setSqlResultName(node.sqlResultName || '');
      } else {
        setSqlResultName('');
      }

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
        } else {
          delete newNodeData.sqlQuery;
          delete newNodeData.sqlConnectorId;
          delete newNodeData.sqlResultName;
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
        } else {
          delete newNodeData.sqlQuery;
          delete newNodeData.sqlConnectorId;
          delete newNodeData.sqlResultName;
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
        <DialogContent className="sm:max-w-xl">
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

              {/* Links, Triggers and Media Section for Question and Decision (but NOT for options) */}
              {((currentNodeType === 'question' && !('option' in initialNode)) || currentNodeType === 'decision') && (
                <div className="space-y-4">
                  {/* --- Links Section --- */}
                  <div className="space-y-2 p-3 border border-primary/50 rounded-lg">
                    <Label className='flex items-center gap-2 text-primary font-semibold'>
                      <LinkIcon className='h-4 w-4' />
                      Links
                    </Label>
                    <div className='space-y-2'>
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
                          />
                          <Input
                            value={newLinkUrl}
                            onChange={e => setNewLinkUrl(e.target.value)}
                            placeholder="https://..."
                            disabled={componentIsSaving}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } }}
                          />
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddLink} disabled={componentIsSaving || !newLinkName.trim() || !newLinkUrl.trim()} className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary">Aggiungi</Button>
                      </div>
                    </div>
                  </div>

                  {/* --- Triggers Section --- */}
                  <div className="space-y-2 p-3 border border-primary/50 rounded-lg">
                    <Label className='flex items-center gap-2 text-primary font-semibold'>
                      <Zap className='h-4 w-4' />
                      Triggers
                    </Label>
                    <div className='space-y-2'>
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
                          />
                          <Input
                            value={newTriggerPath}
                            onChange={e => setNewTriggerPath(e.target.value)}
                            placeholder="Path/ID Trigger"
                            disabled={componentIsSaving}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTrigger(); } }}
                          />
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={handleAddTrigger} disabled={componentIsSaving || !newTriggerName.trim() || !newTriggerPath.trim()} className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary">Aggiungi</Button>
                      </div>
                    </div>
                  </div>

                  {/* --- Media Section --- */}
                  <div className="space-y-2 p-3 border border-primary/50 rounded-lg">
                    <Label className='flex items-center gap-2 text-primary font-semibold'>
                      <ImageIcon className='h-4 w-4' />
                      Media (Immagini/Video, &lt;10MB)
                    </Label>
                    <div className='space-y-2'>
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
                        <Label htmlFor="media-upload" className="w-full">
                          <Button asChild variant="outline" className="w-full text-primary border-primary/50 hover:bg-primary/10 hover:text-primary" disabled={componentIsSaving}>
                            <span>Scegli File</span>
                          </Button>
                          <Input id="media-upload" type="file" accept="image/*,video/*" onChange={handleFileChange} disabled={componentIsSaving} multiple className='hidden' />
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* --- SQL Query Section --- */}
                  <div className="space-y-2 p-3 border border-primary/50 rounded-lg min-w-0 w-full max-w-[80vw] sm:max-w-[530px] overflow-hidden">
                    <Label className='flex items-center gap-2 text-indigo-600 font-semibold'>
                      <Database className='h-4 w-4' />
                      Dati SQL (Anteprima & Pipeline)
                    </Label>
                    <div className="flex flex-col gap-3 min-w-0 w-full">
                      {/* Connector Selector */}
                      <div className="flex flex-col gap-2">
                        <Label className="text-xs text-muted-foreground">Database Principale</Label>
                        <Select
                          value={sqlConnectorId}
                          onValueChange={(val) => {
                            setSqlConnectorId(val);
                          }}
                          disabled={componentIsSaving}
                        >
                          <SelectTrigger className="h-8 w-full">
                            <SelectValue placeholder="Seleziona DB..." />
                          </SelectTrigger>
                          <SelectContent>
                            {sqlConnectors.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                            {sqlConnectors.length === 0 && <SelectItem value="_none" disabled>Nessun DB SQL Trovato</SelectItem>}
                          </SelectContent>
                        </Select>

                        {availableInputTables.length > 0 && (
                          <div className="flex flex-col gap-2 p-2 border rounded-md bg-muted/20">
                            <Label className="text-xs font-semibold text-muted-foreground">Tabelle Pipeline Disponibili (JOIN)</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {availableInputTables.map((t, idx) => {
                                const pipelineValue = `pipeline:${t.name}:${t.connectorId || ''}`;
                                const isSelected = selectedPipelines.includes(pipelineValue);
                                return (
                                  <div key={`pipe-${idx}`} className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      id={`pipe-${idx}`}
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        let newSelection = [...selectedPipelines];
                                        if (checked) {
                                          newSelection.push(pipelineValue);
                                          // If this is the first selected pipeline and no DB is set, set DB
                                          if (newSelection.length === 1 && !sqlConnectorId && t.connectorId) {
                                            setSqlConnectorId(t.connectorId);
                                          }
                                          // Auto-update query if empty
                                          if (!sqlQuery.trim()) {
                                            setSqlQuery(`SELECT * FROM ${t.name}`);
                                          } else if (checked) {
                                            // Append join template if query exists
                                            // setSqlQuery(prev => `${prev}\n-- JOIN ${t.name} ON ...`);
                                          }
                                        } else {
                                          newSelection = newSelection.filter(v => v !== pipelineValue);
                                        }
                                        setSelectedPipelines(newSelection);
                                      }}
                                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <label htmlFor={`pipe-${idx}`} className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                                      {t.name}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="Descrivi cosa estrarre (es. 'Tutti i clienti attivi')"
                          className="flex-1 text-sm bg-background/50"
                          id="sql-prompt-input" // adding ID for easy access if needed
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={!sqlConnectorId && selectedPipelines.length === 0}
                          onClick={async () => {
                            const input = document.getElementById('sql-prompt-input') as HTMLInputElement;
                            let desc = input?.value;
                            if (!desc) {
                              toast({ title: 'Inserisci una descrizione', variant: 'destructive' });
                              return;
                            }

                            // Get connectorId from pipeline if not set directly
                            let effectiveConnectorId = sqlConnectorId;
                            // If no DB selected but pipelines are led, try to use first pipeline's DB
                            if (!effectiveConnectorId && selectedPipelines.length > 0) {
                              // Take the first one
                              const firstPipe = selectedPipelines[0];
                              const [_, tableName] = firstPipe.split(':');
                              const sourceTable = availableInputTables.find(t => t.name === tableName);
                              if (sourceTable?.connectorId) {
                                effectiveConnectorId = sourceTable.connectorId;
                                setSqlConnectorId(effectiveConnectorId);
                              }
                            }

                            if (!effectiveConnectorId) {
                              toast({ title: 'Seleziona un Database o una Pipeline', variant: 'destructive' });
                              return;
                            }

                            // Append context about available pipeline tables to the prompt
                            if (selectedPipelines.length > 0) {
                              const selectedTableNames = selectedPipelines.map(p => p.split(':')[1]).join(', ');
                              desc = `${desc}. Usa queste tabelle pipeline disponibili per fare JOIN se necessario: ${selectedTableNames}`;
                            }

                            // Extract table names from selected pipelines for schema context
                            let formattedTables: string[] = [];
                            if (selectedPipelines.length > 0) {
                              formattedTables = selectedPipelines.map(p => {
                                // p is "pipeline:TableName:ConnectorId"
                                const parts = p.split(':');
                                return parts[1];
                              });
                            }

                            setInternalSaving(true);
                            setAgentStatus("🕵️ Analisi Schema...");

                            try {
                              const apiKey = localStorage.getItem('openrouter_api_key');
                              const model = localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-001';

                              // Step 1: Fetch Schema
                              let schemaContext: string | undefined = undefined;
                              if (selectedPipelines.length > 0) {
                                const tableNames = selectedPipelines.map(p => p.split(':')[1]);
                                const schemaRes = await fetchTableSchemaAction(effectiveConnectorId, tableNames);

                                if (schemaRes.schemaContext) {
                                  schemaContext = schemaRes.schemaContext;
                                } else if (schemaRes.error) {
                                  console.warn("Schema fetch error:", schemaRes.error);
                                  // toast({ title: 'Info', description: 'Schema non disponibile, procedo...', variant: 'default' });
                                }
                              }

                              // Step 2: Generate SQL
                              setAgentStatus("🧠 Generazione Query...");

                              const res = await generateSqlAction(desc, apiKey ? { apiKey, model } : undefined, effectiveConnectorId, schemaContext);
                              console.log('[GEN-SQL] Response:', res);

                              if (res.sql) {
                                setSqlQuery(res.sql);
                                toast({ title: 'Query Generata!', description: 'Controlla la console per i dettagli' });
                              } else {
                                toast({ title: 'Errore generazione', description: res.error || 'Unknown', variant: 'destructive' });
                              }
                            } catch (e) {
                              console.error(e);
                              toast({ title: 'Errore', variant: 'destructive' });
                            } finally {
                              setInternalSaving(false);
                              setAgentStatus(null);
                            }
                          }}
                        >
                          <Bot className="mr-2 h-3 w-3" />
                          Genera SQL
                        </Button>
                      </div>

                      <Textarea
                        value={sqlQuery}
                        onChange={(e) => setSqlQuery(e.target.value)}
                        placeholder="SELECT * FROM ..."
                        className="font-mono text-xs h-24 bg-background/80"
                      />

                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Nome Tabella di Output (Opzionale)</Label>
                        <Input
                          placeholder="Es. ClientiAttivi"
                          value={sqlResultName}
                          onChange={(e) => setSqlResultName(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Dai un nome a questa tabella per usarla come input in altre query successive.</p>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs border-indigo-200"
                          disabled={!sqlConnectorId && selectedPipelines.length === 0}
                          onClick={async () => {
                            if (!sqlQuery.trim()) return;

                            // Get connectorId from pipeline if not set directly
                            let effectiveConnectorId = sqlConnectorId;
                            // If no DB selected but pipelines are led, try to use first pipeline's DB
                            if (!effectiveConnectorId && selectedPipelines.length > 0) {
                              // Take the first one
                              const firstPipe = selectedPipelines[0];
                              const [_, tableName] = firstPipe.split(':');
                              const sourceTable = availableInputTables.find(t => t.name === tableName);
                              if (sourceTable?.connectorId) {
                                effectiveConnectorId = sourceTable.connectorId;
                                setSqlConnectorId(effectiveConnectorId);
                              }
                            }

                            if (!effectiveConnectorId) {
                              toast({ title: 'Seleziona un Database', variant: 'destructive' });
                              return;
                            }
                            setInternalSaving(true);
                            try {
                              // Build Pipeline Dependencies
                              let pipelineDeps: { tableName: string, query: string }[] = [];

                              if (selectedPipelines.length > 0) {
                                selectedPipelines.forEach(pipeStr => {
                                  const [_, tableName] = pipeStr.split(':');
                                  const sourceTable = availableInputTables.find(t => t.name === tableName);

                                  if (sourceTable && sourceTable.sqlQuery) {
                                    pipelineDeps.push({
                                      tableName: sourceTable.name,
                                      query: sourceTable.sqlQuery
                                    });
                                  }
                                });
                                console.log("Pipeline Dependencies:", pipelineDeps);
                              }

                              // Execute with dependencies (backend handles sequential execution)
                              const res = await executeSqlPreviewAction(
                                sqlQuery,
                                effectiveConnectorId,
                                pipelineDeps.length > 0 ? pipelineDeps : undefined
                              );

                              if (res.data) {
                                setSqlPreviewData(res.data);
                              } else {
                                toast({ title: 'Errore esecuzione', description: res.error || 'Errore', variant: 'destructive' });
                              }
                            } catch (e) {
                              toast({ title: 'Errore critico', variant: 'destructive' });
                            } finally {
                              setInternalSaving(false);
                            }
                          }}
                        >
                          Esegui Anteprima
                        </Button>
                      </div>

                      {sqlPreviewData && (
                        <div className="mt-2 text-xs border rounded-md overflow-hidden bg-background w-full max-w-full grid grid-cols-1">
                          <div className="flex justify-between items-center bg-muted/50 p-2 border-b">
                            <span className="font-semibold text-xs flex items-center gap-2">
                              <Database className="h-3 w-3" />
                              Risultati Anteprima
                            </span>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSqlPreviewData(null)}><X className="h-3 w-3" /></Button>
                          </div>
                          <div className="bg-background w-full">
                            <DataTable data={sqlPreviewData} className="w-full" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
        </DialogContent>
      </Dialog>

      {/* Media Preview Dialog */}
      <Dialog open={!!previewingMedia} onOpenChange={(open) => !open && setPreviewingMedia(null)}>
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
      </Dialog>

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
