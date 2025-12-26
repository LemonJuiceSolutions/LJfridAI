

'use client';

import { useEffect, useState } from 'react';
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
import { Loader2, Trash2, Eye, Video, Image as ImageIcon, Link as LinkIcon, Zap, Pencil, Check, X } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf, DecisionNode, MediaItem, LinkItem, TriggerItem } from '@/lib/types';
import { Input } from '../ui/input';
import _ from 'lodash';
import { useToast } from '@/hooks/use-toast';
import { uploadFile } from '@/lib/storage-client';
import Image from 'next/image';
import { executeTriggerAction } from '@/app/actions';
import { ScrollArea } from '../ui/scroll-area';

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
}: EditNodeDialogProps) {
  const { toast } = useToast();

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

  // State for inline editing links
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);

  // State for inline editing triggers
  const [editingTriggerIndex, setEditingTriggerIndex] = useState<number | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<TriggerItem | null>(null);

  // State for inline editing media names
  const [editingMediaName, setEditingMediaName] = useState<{ index: number, type: 'existing' | 'new', name: string } | null>(null);


  const componentIsSaving = isSaving || internalSaving;

  useEffect(() => {
    if (isOpen) {
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
      setEditingLinkIndex(null);
      setEditingLink(null);
      setEditingTriggerIndex(null);
      setEditingTrigger(null);
      setEditingMediaName(null);

    }
  }, [isOpen, initialNode, nodeType]);

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

      let newNodeData: any;
      if (nodeType === 'question' && 'question' in initialNode) {
        newNodeData = {
          ...initialNode,
          question: questionText,
          media: finalMedia.length > 0 ? finalMedia : undefined,
          links: links.length > 0 ? links : undefined,
          triggers: triggers.length > 0 ? triggers : undefined,
        };
      } else if (nodeType === 'question' && 'option' in initialNode) {
        newNodeData = { option: optionText };
      } else { // Decision node
        newNodeData = {
          ...initialNode,
          decision: decisionText,
          media: finalMedia.length > 0 ? finalMedia : undefined,
          links: links.length > 0 ? links : undefined,
          triggers: triggers.length > 0 ? triggers : undefined,
        };
      }

      onSave(nodePath, newNodeData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
      toast({
        variant: 'destructive',
        title: 'Upload Fallito',
        description: errorMessage,
      });
      setInternalSaving(false);
    }
  };

  let title = 'Modifica Nodo';
  let description = "Apporta le modifiche al nodo qui sotto. Fai clic su Salva quando hai finito.";

  if (nodeType === 'question' && 'question' in initialNode) {
    title = 'Modifica Domanda';
  } else if (nodeType === 'question' && 'option' in initialNode) {
    title = 'Modifica Nome Opzione (Locale)';
    description = "Stai modificando un'opzione che esiste solo in questo albero.";
  } else if (nodeType === 'decision') {
    title = 'Modifica Decisione';
  }

  const canSave = !componentIsSaving && (
    (nodeType === 'question' && 'question' in initialNode && questionText.trim() !== '') ||
    (nodeType === 'question' && 'option' in initialNode && optionText.trim() !== '') ||
    (nodeType === 'decision' && decisionText.trim() !== '')
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
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] -mx-6 px-6">
            <div className="grid gap-4 py-4">
              {nodeType === 'question' && 'question' in initialNode && (
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
              {nodeType === 'question' && 'option' in initialNode && (
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
              {nodeType === 'decision' && (
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
              {((nodeType === 'question' && 'question' in initialNode) || nodeType === 'decision') && (
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
    </>
  );
}
