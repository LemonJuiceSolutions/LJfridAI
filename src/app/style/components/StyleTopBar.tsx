'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RotateCcw, Trash2, Bookmark, Lock, CheckCircle2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'corporate', label: 'Corporate' },
  { value: 'dark', label: 'Dark' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'colorful', label: 'Colorful' },
  { value: 'elegant', label: 'Elegante' },
  { value: 'editorial', label: 'Editoriale' },
  { value: 'finance', label: 'Finanza' },
  { value: 'custom', label: 'Custom' },
];

interface StyleTopBarProps {
  name: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onCategoryChange: (category: string) => void;
  onSaveNew: () => void;
  onUpdate: () => void;
  onReset: () => void;
  onDelete: () => void;
  activePresetId: string;
  isActiveStyle: boolean;
  onSetActive: () => void;
}

export default function StyleTopBar({
  name,
  description,
  category,
  isBuiltIn,
  isDirty,
  isSaving,
  onNameChange,
  onDescriptionChange,
  onCategoryChange,
  onSaveNew,
  onUpdate,
  onReset,
  onDelete,
  activePresetId,
  isActiveStyle,
  onSetActive,
}: StyleTopBarProps) {
  const isCustom = activePresetId.startsWith('custom_');

  return (
    <div className="flex items-center gap-3 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isBuiltIn ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            <Lock className="h-3 w-3" /> Built-in
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/15 px-2 py-0.5 rounded">
            <Bookmark className="h-3 w-3" /> Custom
          </span>
        )}
        {isActiveStyle && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 rounded">
            <CheckCircle2 className="h-3 w-3" /> Attivo
          </span>
        )}
        {isDirty && (
          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 rounded">
            Modificato
          </span>
        )}
      </div>

      {/* Name input */}
      <Input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        placeholder="Nome preset..."
        className="h-8 text-sm font-medium max-w-[200px]"
      />

      {/* Description input */}
      <Input
        value={description}
        onChange={e => onDescriptionChange(e.target.value)}
        placeholder="Descrizione..."
        className="h-8 text-xs flex-1 min-w-0"
      />

      {/* Category select */}
      <Select value={category} onValueChange={onCategoryChange}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map(c => (
            <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {!isActiveStyle && !isDirty && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSetActive}
            disabled={isSaving}
            className="h-8 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Imposta Attivo
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          disabled={!isDirty}
          className="h-8 text-xs gap-1"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>

        {isCustom && isDirty && (
          <Button
            variant="outline"
            size="sm"
            onClick={onUpdate}
            disabled={isSaving}
            className="h-8 text-xs gap-1"
          >
            <Save className="h-3.5 w-3.5" />
            Aggiorna
          </Button>
        )}

        <Button
          size="sm"
          onClick={onSaveNew}
          disabled={isSaving || !name.trim()}
          className="h-8 text-xs gap-1 bg-violet-600 hover:bg-violet-700 text-white"
        >
          <Save className="h-3.5 w-3.5" />
          Salva Nuovo
        </Button>

        {isCustom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isSaving}
            className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
