'use client';

import React from 'react';
import {
  Database, ArrowDown, Filter, GitMerge, Calculator, BarChart3,
  Table, FileCode2, ArrowRight, AlertTriangle, Zap, SortAsc,
  Layers, FileOutput, Variable, Code, Shuffle, Eye,
  ArrowDownToLine, ChevronRight, Play, Loader2, X,
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
  previewQuery?: string;
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

export interface StepPreview {
  loading: boolean;
  error?: string;
  columns?: string[];
  rows?: Record<string, any>[];
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
    <div className="flex flex-col items-center py-1 print:py-0.5">
      <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/40 to-muted-foreground/20 print:h-2" />
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted border border-border print:w-4 print:h-4">
        <ArrowDown className="h-3 w-3 text-muted-foreground print:h-2 print:w-2" />
      </div>
      {label && <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>}
      <div className="w-px h-4 bg-gradient-to-b from-muted-foreground/20 to-muted-foreground/40 print:h-2" />
    </div>
  );
}

// ─── Mini Data Table ─────────────────────────────────────────────────────────

function MiniDataTable({ columns, rows }: { columns: string[]; rows: Record<string, any>[] }) {
  return (
    <div className="mt-2 rounded-lg border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/60">
              {columns.map((col, i) => (
                <th key={i} className="px-2 py-1.5 text-left font-semibold text-muted-foreground border-b border-border/40 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={cn("border-b border-border/20 last:border-0", ri % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                {columns.map((col, ci) => (
                  <td key={ci} className="px-2 py-1 text-foreground/80 font-mono whitespace-nowrap max-w-[200px] truncate">
                    {row[col] === null ? <span className="text-muted-foreground italic">NULL</span> : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-2 py-1 bg-muted/30 border-t border-border/30 text-[10px] text-muted-foreground">
        Anteprima: {rows.length} righe
      </div>
    </div>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ source, preview, onPreview }: {
  source: AlgoSource;
  preview?: StepPreview;
  onPreview?: (sourceName: string) => void;
}) {
  const Icon = getSourceIcon(source.type);
  const isDbSource = source.type.toLowerCase().includes('sql') || source.type.toLowerCase().includes('database');
  const showPreview = preview && !preview.loading && preview.columns && preview.rows;
  const showPreviewError = preview && !preview.loading && preview.error;

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
        {/* Preview button for DB sources */}
        {isDbSource && onPreview && (
          <button
            onClick={() => onPreview(source.name)}
            disabled={preview?.loading}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all print:hidden",
              "bg-background/70 border border-border/50 hover:border-border hover:shadow-sm",
              "text-muted-foreground hover:text-foreground",
              preview?.loading && "opacity-60 cursor-wait"
            )}
            title="Anteprima dati (5 righe)"
          >
            {preview?.loading ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : showPreview ? (
              <X className="h-2.5 w-2.5" />
            ) : (
              <Play className="h-2.5 w-2.5" />
            )}
            {showPreview ? 'Chiudi' : 'Anteprima'}
          </button>
        )}
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

      {/* Preview loading */}
      {preview?.loading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Caricamento anteprima...
        </div>
      )}

      {/* Preview error */}
      {showPreviewError && (
        <div className="mt-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {preview.error}
        </div>
      )}

      {/* Preview data table */}
      {showPreview && preview.columns && preview.rows && (
        <MiniDataTable columns={preview.columns} rows={preview.rows} />
      )}
    </div>
  );
}

// ─── Step Card ───────────────────────────────────────────────────────────────

function StepCard({ step, index, preview, onPreview }: {
  step: AlgoStep;
  index: number;
  preview?: StepPreview;
  onPreview?: (stepIndex: number, query: string) => void;
}) {
  const config = getActionConfig(step.action);
  const Icon = config.icon;
  const hasPreviewQuery = !!step.previewQuery;
  const showPreview = preview && !preview.loading && preview.columns && preview.rows;
  const showPreviewError = preview && !preview.loading && preview.error;

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
            {/* Preview button */}
            {hasPreviewQuery && onPreview && (
              <button
                onClick={() => onPreview(index, step.previewQuery!)}
                disabled={preview?.loading}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all print:hidden",
                  "bg-background/70 border border-border/50 hover:border-border hover:shadow-sm",
                  "text-muted-foreground hover:text-foreground",
                  preview?.loading && "opacity-60 cursor-wait"
                )}
                title="Anteprima dati (5 righe)"
              >
                {preview?.loading ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : showPreview ? (
                  <X className="h-2.5 w-2.5" />
                ) : (
                  <Play className="h-2.5 w-2.5" />
                )}
                {showPreview ? 'Chiudi' : 'Anteprima'}
              </button>
            )}
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{step.description}</p>
          {step.detail && (
            <p className="text-xs text-muted-foreground mt-1 font-mono bg-background/50 rounded px-2 py-1 border border-border/50">
              {step.detail}
            </p>
          )}

          {/* Preview loading */}
          {preview?.loading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Caricamento anteprima...
            </div>
          )}

          {/* Preview error */}
          {showPreviewError && (
            <div className="mt-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {preview.error}
            </div>
          )}

          {/* Preview data table */}
          {showPreview && preview.columns && preview.rows && (
            <MiniDataTable columns={preview.columns} rows={preview.rows} />
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

interface AlgorithmSchemaViewProps {
  schema: AlgoSchema;
  stepPreviews?: Record<number, StepPreview>;
  sourcePreviews?: Record<string, StepPreview>;
  onPreviewStep?: (stepIndex: number, query: string) => void;
  onPreviewSource?: (sourceName: string) => void;
}

export default function AlgorithmSchemaView({ schema, stepPreviews, sourcePreviews, onPreviewStep, onPreviewSource }: AlgorithmSchemaViewProps) {
  return (
    <div className="flex flex-col gap-0 py-2 algo-schema-print">
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
            <SourceCard
              key={i}
              source={src}
              preview={sourcePreviews?.[src.name]}
              onPreview={onPreviewSource}
            />
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
              <StepCard
                step={step}
                index={i}
                preview={stepPreviews?.[i]}
                onPreview={onPreviewStep}
              />
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
