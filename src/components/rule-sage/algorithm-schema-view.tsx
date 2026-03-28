'use client';

import React from 'react';
import {
  Database, ArrowDown, Filter, GitMerge, Calculator, BarChart3,
  Table, FileCode2, ArrowRight, AlertTriangle, Zap, SortAsc,
  Layers, FileOutput, Variable, Code, Shuffle, Eye,
  ArrowDownToLine, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AlgoSource {
  name: string;
  type: string;       // "Database SQL", "DataFrame Pandas", "File CSV", "Pipeline", etc.
  columns?: string[];
}

export interface AlgoStep {
  action: string;     // JOIN, FILTER, AGGREGATE, CALCULATE, SORT, PIVOT, MERGE, TRANSFORM, FORMAT, EXPORT, READ
  description: string;
  detail?: string;
}

export interface AlgoOutput {
  type: string;       // "Tabella", "Grafico", "Variabile", "HTML"
  columns?: string[];
  description?: string;
}

export interface AlgoSchema {
  sources: AlgoSource[];
  steps: AlgoStep[];
  output: AlgoOutput;
  notes?: string[];
}

// ─── Action config ───────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  READ:        { icon: Database,      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950/40',    border: 'border-blue-200 dark:border-blue-800' },
  JOIN:        { icon: GitMerge,      color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-800' },
  FILTER:      { icon: Filter,        color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/40',  border: 'border-amber-200 dark:border-amber-800' },
  AGGREGATE:   { icon: Layers,        color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-950/40',  border: 'border-green-200 dark:border-green-800' },
  CALCULATE:   { icon: Calculator,    color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-50 dark:bg-cyan-950/40',    border: 'border-cyan-200 dark:border-cyan-800' },
  SORT:        { icon: SortAsc,       color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-800' },
  PIVOT:       { icon: Shuffle,       color: 'text-pink-600 dark:text-pink-400',    bg: 'bg-pink-50 dark:bg-pink-950/40',    border: 'border-pink-200 dark:border-pink-800' },
  MERGE:       { icon: GitMerge,      color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800' },
  TRANSFORM:   { icon: Zap,           color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800' },
  FORMAT:      { icon: FileCode2,     color: 'text-teal-600 dark:text-teal-400',    bg: 'bg-teal-50 dark:bg-teal-950/40',    border: 'border-teal-200 dark:border-teal-800' },
  EXPORT:      { icon: FileOutput,    color: 'text-rose-600 dark:text-rose-400',    bg: 'bg-rose-50 dark:bg-rose-950/40',    border: 'border-rose-200 dark:border-rose-800' },
};

const SOURCE_TYPE_ICON: Record<string, React.ElementType> = {
  'database': Database,
  'sql': Database,
  'dataframe': Table,
  'pandas': Table,
  'file': FileCode2,
  'csv': FileCode2,
  'pipeline': ArrowDownToLine,
  'api': Code,
  'variable': Variable,
};

const OUTPUT_TYPE_ICON: Record<string, React.ElementType> = {
  'tabella': Table,
  'table': Table,
  'grafico': BarChart3,
  'chart': BarChart3,
  'variabile': Variable,
  'variable': Variable,
  'html': FileCode2,
};

function getSourceIcon(type: string) {
  const lower = type.toLowerCase();
  for (const [key, Icon] of Object.entries(SOURCE_TYPE_ICON)) {
    if (lower.includes(key)) return Icon;
  }
  return Database;
}

function getOutputIcon(type: string) {
  const lower = type.toLowerCase();
  for (const [key, Icon] of Object.entries(OUTPUT_TYPE_ICON)) {
    if (lower.includes(key)) return Icon;
  }
  return Eye;
}

function getActionConfig(action: string) {
  const upper = action.toUpperCase().replace(/[^A-Z]/g, '');
  for (const [key, config] of Object.entries(ACTION_CONFIG)) {
    if (upper.includes(key)) return config;
  }
  return ACTION_CONFIG.TRANSFORM;
}

// ─── Connector ───────────────────────────────────────────────────────────────

function FlowConnector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/40 to-muted-foreground/20" />
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted border border-border">
        <ArrowDown className="h-3 w-3 text-muted-foreground" />
      </div>
      {label && <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>}
      <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/20 to-muted-foreground/40" />
    </div>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ source }: { source: AlgoSource }) {
  const Icon = getSourceIcon(source.type);
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">{source.name}</p>
          <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 uppercase tracking-wider">{source.type}</p>
        </div>
      </div>
      {source.columns && source.columns.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {source.columns.slice(0, 8).map((col, i) => (
            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-100/80 dark:bg-blue-800/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50">
              {col}
            </span>
          ))}
          {source.columns.length > 8 && (
            <span className="text-[10px] text-blue-500 self-center">+{source.columns.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step Card ───────────────────────────────────────────────────────────────

function StepCard({ step, index }: { step: AlgoStep; index: number }) {
  const config = getActionConfig(step.action);
  const Icon = config.icon;
  return (
    <div className={cn(
      "relative rounded-xl border p-3 shadow-sm hover:shadow-md transition-all",
      config.bg, config.border
    )}>
      <div className="flex items-start gap-3">
        {/* Step number + icon */}
        <div className="flex flex-col items-center gap-1">
          <div className={cn(
            "flex items-center justify-center w-9 h-9 rounded-xl border shadow-sm",
            config.bg, config.border
          )}>
            <Icon className={cn("h-4.5 w-4.5", config.color)} />
          </div>
          <span className={cn("text-[10px] font-bold", config.color)}>{index + 1}</span>
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn("text-[10px] font-bold uppercase tracking-widest", config.color)}>
              {step.action}
            </span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{step.description}</p>
          {step.detail && (
            <p className="text-xs text-muted-foreground mt-1 font-mono bg-background/50 rounded px-2 py-1 border border-border/50">
              {step.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Output Card ─────────────────────────────────────────────────────────────

function OutputCard({ output }: { output: AlgoOutput }) {
  const Icon = getOutputIcon(output.type);
  return (
    <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 shadow-sm">
          <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Output Finale</p>
          <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wider">{output.type}</p>
        </div>
      </div>
      {output.description && (
        <p className="text-sm text-emerald-800 dark:text-emerald-200 mb-2">{output.description}</p>
      )}
      {output.columns && output.columns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {output.columns.map((col, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-100/80 dark:bg-emerald-800/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-700/50">
              <ChevronRight className="h-2.5 w-2.5" />
              {col}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Notes ───────────────────────────────────────────────────────────────────

function NotesSection({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 mt-1">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Note</span>
      </div>
      <ul className="space-y-1">
        {notes.map((note, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
            <span className="text-amber-400 mt-0.5">&#8226;</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AlgorithmSchemaView({ schema }: { schema: AlgoSchema }) {
  return (
    <div className="flex flex-col gap-0 py-2">
      {/* SECTION: Sources */}
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/50">
            <Database className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Sorgenti Dati</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-blue-200 dark:from-blue-800 to-transparent" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {schema.sources.map((src, i) => (
            <SourceCard key={i} source={src} />
          ))}
        </div>
      </div>

      <FlowConnector />

      {/* SECTION: Steps */}
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 dark:bg-purple-900/50">
            <ArrowRight className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">Trasformazioni</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-purple-200 dark:from-purple-800 to-transparent" />
        </div>
        <div className="flex flex-col gap-0">
          {schema.steps.map((step, i) => (
            <React.Fragment key={i}>
              <StepCard step={step} index={i} />
              {i < schema.steps.length - 1 && <FlowConnector />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <FlowConnector />

      {/* SECTION: Output */}
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 dark:bg-emerald-900/50">
            <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Output</h3>
          <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 dark:from-emerald-800 to-transparent" />
        </div>
        <OutputCard output={schema.output} />
      </div>

      {/* SECTION: Notes */}
      {schema.notes && schema.notes.length > 0 && (
        <>
          <FlowConnector />
          <NotesSection notes={schema.notes} />
        </>
      )}
    </div>
  );
}
