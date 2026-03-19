'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
    getDatabaseMapAction,
    getCachedDatabaseMapAction,
    generateDescriptionBatchAction,
    updateTableDescriptionAction,
    updateColumnDescriptionAction,
    inferRelationshipsAIAction,
    inferRelationshipsFromDataAction,
    fetchTablePreviewAction,
} from '../actions/database-map';
import { getAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import type { DatabaseMap, TableInfo, ColumnInfo, RelationshipInfo } from '@/lib/database-map-types';
import {
    Loader2, Search, RefreshCw, Sparkles, ChevronRight, ChevronDown,
    Key, ArrowRight, Database, Pencil, Check, X, GitFork, Table2, Link2, Network,
    ScanSearch, Eye, Zap, Timer, PlayCircle, DollarSign, Gift, CheckCircle2,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchOpenRouterModelsAction } from '../actions';
import { DatabaseERDiagram } from './database-er-diagram';

interface DatabaseMapDialogProps {
    connectorId: string;
    connectorName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ─── Inline editable description ────────────────────────────────────────────
function EditableDescription({
    value,
    placeholder,
    onSave,
}: {
    value: string | null;
    placeholder: string;
    onSave: (val: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(value || '');
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setText(value || ''); }, [value]);
    useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

    const handleSave = async () => {
        setSaving(true);
        await onSave(text);
        setSaving(false);
        setEditing(false);
    };

    if (editing) {
        return (
            <div className="flex items-center gap-1 mt-0.5">
                <Input
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
                    className="h-6 text-[11px] px-1.5 flex-1"
                    placeholder={placeholder}
                    disabled={saving}
                />
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditing(false)}>
                    <X className="h-3 w-3 text-red-500" />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5 mt-0.5 group/desc">
            {value ? (
                <span className="text-xs text-foreground/80 leading-snug">{value}</span>
            ) : (
                <span className="text-xs text-muted-foreground/40 italic">Nessuna descrizione</span>
            )}
            <button
                onClick={() => setEditing(true)}
                className="opacity-0 group-hover/desc:opacity-100 transition-opacity shrink-0"
            >
                <Pencil className="h-3 w-3 text-muted-foreground hover:text-primary" />
            </button>
        </div>
    );
}

// ─── Expandable Reason ───────────────────────────────────────────────────────
function ExpandableReason({ reason }: { reason: string }) {
    const [expanded, setExpanded] = useState(false);
    const isLong = reason.length > 120;

    return (
        <div className="text-[9px] text-muted-foreground/70 pl-4 mt-0.5 italic leading-tight">
            <span className={expanded ? '' : 'line-clamp-2'}>
                {reason}
            </span>
            {isLong && (
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="text-indigo-500 hover:text-indigo-600 ml-1 not-italic font-medium"
                >
                    {expanded ? 'mostra meno' : 'mostra tutto'}
                </button>
            )}
        </div>
    );
}

// ─── Confidence Badge ────────────────────────────────────────────────────────
function ConfidenceBadge({ confidence, method, reason }: { confidence?: number; method?: string; reason?: string }) {
    if (confidence === undefined) return null;
    const methodLabels: Record<string, string> = {
        'formal_fk': 'FK',
        'name_pattern': 'nome',
        'prefix_suffix': 'prefisso',
        'view_sp': 'VIEW/SP',
        'ai_schema': 'AI',
        'data_analysis': 'dati',
    };
    const label = method ? methodLabels[method] || method : '';
    let colorClass = '';
    if (confidence >= 90) colorClass = 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200';
    else if (confidence >= 70) colorClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200';
    else if (confidence >= 50) colorClass = 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200';
    else colorClass = 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200';

    const tooltip = reason
        ? `${confidence}% (${label || method || 'N/A'})\n${reason}`
        : `${confidence}% (${label || method || 'N/A'})`;

    return (
        <Badge className={`text-[8px] h-3.5 px-1 cursor-help ${colorClass}`} title={tooltip}>
            {confidence}%{label ? ` ${label}` : ''}
        </Badge>
    );
}

// ─── Relationships Map View ─────────────────────────────────────────────────
function RelationshipsMapView({
    map,
    onScrollToTable,
}: {
    map: DatabaseMap;
    onScrollToTable: (fullName: string) => void;
}) {
    // Build a grouped structure: for each table, show outgoing and incoming FK
    const tableConnections = useMemo(() => {
        const connMap = new Map<string, {
            table: TableInfo;
            out: RelationshipInfo[];
            in: RelationshipInfo[];
        }>();

        for (const t of map.tables) {
            if (t.foreignKeysOut.length > 0 || t.foreignKeysIn.length > 0) {
                connMap.set(t.fullName, {
                    table: t,
                    out: t.foreignKeysOut,
                    in: t.foreignKeysIn,
                });
            }
        }
        return connMap;
    }, [map]);

    // Unique table-to-table connections for the summary diagram
    const uniqueLinks = useMemo(() => {
        const linkSet = new Map<string, { source: string; target: string; columns: string[]; hasInferred: boolean; minConfidence?: number; methods: Set<string>; reasons: string[] }>();
        for (const rel of map.relationships) {
            const sourceFullName = `${rel.sourceSchema}.${rel.sourceTable}`;
            const targetFullName = `${rel.targetSchema}.${rel.targetTable}`;
            const key = `${sourceFullName}→${targetFullName}`;
            const existing = linkSet.get(key);
            if (existing) {
                existing.columns.push(`${rel.sourceColumn} → ${rel.targetColumn}`);
                if (rel.inferred) existing.hasInferred = true;
                if (rel.confidence !== undefined) {
                    existing.minConfidence = existing.minConfidence !== undefined
                        ? Math.min(existing.minConfidence, rel.confidence)
                        : rel.confidence;
                }
                if (rel.inferenceMethod) existing.methods.add(rel.inferenceMethod);
                if (rel.reason) existing.reasons.push(rel.reason);
            } else {
                const methods = new Set<string>();
                if (rel.inferenceMethod) methods.add(rel.inferenceMethod);
                linkSet.set(key, {
                    source: sourceFullName,
                    target: targetFullName,
                    columns: [`${rel.sourceColumn} → ${rel.targetColumn}`],
                    hasInferred: !!rel.inferred,
                    minConfidence: rel.confidence,
                    methods,
                    reasons: rel.reason ? [rel.reason] : [],
                });
            }
        }
        return Array.from(linkSet.values());
    }, [map]);

    if (map.relationships.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
                <Link2 className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nessuna relazione FK trovata nel database</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 p-3">
            {/* Summary: all unique table→table links */}
            <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <GitFork className="h-3.5 w-3.5" />
                    Connessioni tra Tabelle ({uniqueLinks.length})
                </h3>
                <div className="grid gap-1.5">
                    {uniqueLinks.map((link, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                            <button
                                className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={() => onScrollToTable(link.source)}
                            >
                                {link.source}
                            </button>
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <div className="h-px w-4 bg-muted-foreground/40" />
                                <ArrowRight className="h-3 w-3" />
                                <div className="h-px w-4 bg-muted-foreground/40" />
                            </div>
                            <button
                                className="font-mono text-xs font-medium text-green-600 dark:text-green-400 hover:underline"
                                onClick={() => onScrollToTable(link.target)}
                            >
                                {link.target}
                            </button>
                            <div className="flex-1" />
                            <div className="flex flex-wrap gap-1 items-center">
                                {link.minConfidence !== undefined && (
                                    <ConfidenceBadge
                                        confidence={link.minConfidence}
                                        method={link.methods.size === 1 ? Array.from(link.methods)[0] : undefined}
                                        reason={link.reasons.length > 0 ? link.reasons.join(' | ') : undefined}
                                    />
                                )}
                                {link.columns.map((col, j) => (
                                    <Badge key={j} variant="outline" className="text-[9px] h-4 px-1.5 font-mono">
                                        {col}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Per-table detailed connections */}
            <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5" />
                    Dettaglio per Tabella
                </h3>
                <div className="grid gap-1">
                    {Array.from(tableConnections.entries()).map(([fullName, conn]) => (
                        <Collapsible key={fullName}>
                            <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 rounded-lg transition-colors text-left">
                                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 group-data-[state=open]:rotate-90 transition-transform" />
                                <span className="font-mono text-xs font-medium">{fullName}</span>
                                <div className="flex-1" />
                                {conn.out.length > 0 && (
                                    <Badge className="text-[9px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        {conn.out.length} uscita
                                    </Badge>
                                )}
                                {conn.in.length > 0 && (
                                    <Badge className="text-[9px] h-4 px-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                        {conn.in.length} entrata
                                    </Badge>
                                )}
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="ml-7 mr-3 mb-2 space-y-1.5">
                                    {conn.out.length > 0 && (
                                        <div className="space-y-0.5">
                                            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Riferisce a:</span>
                                            {conn.out.map((fk, i) => (
                                                <div key={i}>
                                                    <div className="flex items-center gap-1.5 text-[10px] pl-2">
                                                        <span className="font-mono text-muted-foreground">{fk.sourceColumn}</span>
                                                        <ArrowRight className="h-2.5 w-2.5 text-blue-500" />
                                                        <button
                                                            className="font-mono text-blue-600 hover:underline"
                                                            onClick={() => onScrollToTable(`${fk.targetSchema}.${fk.targetTable}`)}
                                                        >
                                                            {fk.targetSchema}.{fk.targetTable}
                                                        </button>
                                                        <span className="text-muted-foreground">({fk.targetColumn})</span>
                                                    </div>
                                                    {fk.reason && <ExpandableReason reason={fk.reason} />}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {conn.in.length > 0 && (
                                        <div className="space-y-0.5">
                                            <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Referenziata da:</span>
                                            {conn.in.map((fk, i) => (
                                                <div key={i}>
                                                    <div className="flex items-center gap-1.5 text-[10px] pl-2">
                                                        <button
                                                            className="font-mono text-green-600 hover:underline"
                                                            onClick={() => onScrollToTable(`${fk.sourceSchema}.${fk.sourceTable}`)}
                                                        >
                                                            {fk.sourceSchema}.{fk.sourceTable}
                                                        </button>
                                                        <span className="text-muted-foreground">({fk.sourceColumn})</span>
                                                        <ArrowRight className="h-2.5 w-2.5 text-green-500" />
                                                        <span className="font-mono text-muted-foreground">{fk.targetColumn}</span>
                                                    </div>
                                                    {fk.reason && <ExpandableReason reason={fk.reason} />}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Table Card ─────────────────────────────────────────────────────────────
function TableCard({
    table,
    connectorId,
    onScrollToTable,
    isNewRel,
}: {
    table: TableInfo;
    connectorId: string;
    onScrollToTable: (fullName: string) => void;
    isNewRel?: (fk: RelationshipInfo) => boolean;
}) {
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState<{ rows: Record<string, unknown>[]; columns: string[] } | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const previewLoadedRef = useRef(false);
    const { toast } = useToast();

    // Auto-load 10 rows when card is expanded
    useEffect(() => {
        if (open && !previewLoadedRef.current && !preview && !loadingPreview) {
            previewLoadedRef.current = true;
            setLoadingPreview(true);
            fetchTablePreviewAction(connectorId, table.schema, table.name, 10).then(res => {
                setLoadingPreview(false);
                if (res.rows && res.columns) {
                    setPreview({ rows: res.rows, columns: res.columns });
                }
            });
        }
    }, [open]);

    const handleSaveTableDesc = async (desc: string) => {
        const res = await updateTableDescriptionAction(connectorId, table.fullName, desc);
        if (res.error) toast({ variant: 'destructive', title: 'Errore', description: res.error });
    };

    const handleSaveColDesc = async (colName: string, desc: string) => {
        const res = await updateColumnDescriptionAction(connectorId, table.fullName, colName, desc);
        if (res.error) toast({ variant: 'destructive', title: 'Errore', description: res.error });
    };

    const effectiveDesc = table.userDescription || table.description;
    const hasFKs = table.foreignKeysOut.length > 0 || table.foreignKeysIn.length > 0;

    return (
        <Collapsible open={open} onOpenChange={setOpen} id={`table-${table.fullName}`}>
            <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-lg transition-colors text-left">
                {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <Database className="h-3.5 w-3.5 shrink-0 text-violet-500" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{table.name}</span>
                        <span className="text-[10px] text-muted-foreground">{table.schema}</span>
                    </div>
                    {/* Show description in collapsed state too */}
                    {effectiveDesc && !open && (
                        <div className="text-[11px] text-foreground/70 leading-snug mt-0.5 max-w-[450px] line-clamp-2">
                            <Sparkles className="h-3 w-3 text-violet-400 inline mr-1 -mt-0.5" />
                            {effectiveDesc}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {hasFKs && (
                        <Badge className="text-[9px] h-4 px-1 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200">
                            <Link2 className="h-2.5 w-2.5 mr-0.5" />
                            {table.foreignKeysOut.length + table.foreignKeysIn.length}
                        </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                        {table.rowCount.toLocaleString('it-IT')} righe
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                        {table.columns.length} col
                    </Badge>
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
                <div className="ml-8 mr-3 mb-3 space-y-2">
                    {/* Table description */}
                    <div className="flex items-start gap-2 bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/40 rounded-md px-3 py-2">
                        <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-medium text-violet-600 dark:text-violet-400 mb-0.5">Descrizione tabella</div>
                            <EditableDescription
                                value={effectiveDesc}
                                placeholder="Descrivi questa tabella..."
                                onSave={handleSaveTableDesc}
                            />
                        </div>
                    </div>

                    {/* Columns */}
                    <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="bg-muted/50 border-b">
                                    <th className="text-left px-2 py-1 font-medium">Colonna</th>
                                    <th className="text-left px-2 py-1 font-medium">Tipo</th>
                                    <th className="text-left px-2 py-1 font-medium">Info</th>
                                    <th className="text-left px-2 py-1 font-medium">Descrizione</th>
                                </tr>
                            </thead>
                            <tbody>
                                {table.columns.map(col => {
                                    const colEffectiveDesc = col.userDescription || col.description;
                                    return (
                                        <tr key={col.name} className="border-b last:border-b-0 hover:bg-muted/30">
                                            <td className="px-2 py-1 font-mono whitespace-nowrap">
                                                {col.name}
                                            </td>
                                            <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                                                {col.dataType}{col.maxLength && col.maxLength > 0 ? `(${col.maxLength})` : ''}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap">
                                                <div className="flex items-center gap-1">
                                                    {col.isPrimaryKey && (
                                                        <Badge className="h-4 px-1 text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200">
                                                            <Key className="h-2.5 w-2.5 mr-0.5" />PK
                                                        </Badge>
                                                    )}
                                                    {col.isForeignKey && col.foreignKeyTarget && (
                                                        <Badge
                                                            className="h-4 px-1 text-[9px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 cursor-pointer hover:bg-blue-200"
                                                            onClick={() => onScrollToTable(`${col.foreignKeyTarget!.schema}.${col.foreignKeyTarget!.table}`)}
                                                        >
                                                            <ArrowRight className="h-2.5 w-2.5 mr-0.5" />
                                                            {col.foreignKeyTarget.table}
                                                        </Badge>
                                                    )}
                                                    {col.isNullable && (
                                                        <Badge variant="outline" className="h-4 px-1 text-[9px] text-muted-foreground">
                                                            NULL
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 max-w-[250px]">
                                                <EditableDescription
                                                    value={colEffectiveDesc}
                                                    placeholder="Descrizione..."
                                                    onSave={(desc) => handleSaveColDesc(col.name, desc)}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Data preview (auto-loaded) */}
                    <div className="border rounded-md overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/30">
                            <Eye className="h-3 w-3" />
                            Anteprima dati (ultime 10 righe)
                            {loadingPreview && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                        </div>
                        {preview && preview.rows.length > 0 && (
                            <div className="border-t overflow-x-auto">
                                <table className="w-full text-[10px]">
                                    <thead>
                                        <tr className="bg-muted/40 border-b">
                                            {preview.columns.map(col => (
                                                <th key={col} className="text-left px-2 py-1 font-medium font-mono whitespace-nowrap">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.rows.map((row, ri) => (
                                            <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/30">
                                                {preview.columns.map(col => (
                                                    <td key={col} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate text-muted-foreground">
                                                        {row[col] == null ? <span className="italic text-muted-foreground/40">NULL</span> : String(row[col])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {preview && preview.rows.length === 0 && (
                            <div className="border-t px-3 py-2 text-[10px] text-muted-foreground/60 italic">
                                Tabella vuota
                            </div>
                        )}
                    </div>

                    {/* FK relationships */}
                    {hasFKs && (
                        <div className="text-[10px] space-y-1.5 pt-1 border rounded-md p-2 bg-muted/20">
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground mb-1">
                                <Link2 className="h-3 w-3" /> Relazioni
                            </div>
                            {table.foreignKeysOut.length > 0 && (
                                <div className="space-y-1">
                                    <span className="font-medium text-blue-600 dark:text-blue-400">FK Uscita:</span>
                                    {table.foreignKeysOut.map((fk, i) => (
                                        <div key={i}>
                                            <div className="flex items-center gap-1.5 pl-2">
                                                <span className="font-mono">{fk.sourceColumn}</span>
                                                <ArrowRight className="h-2.5 w-2.5 text-blue-500" />
                                                <button
                                                    className="text-blue-600 hover:underline font-mono"
                                                    onClick={() => onScrollToTable(`${fk.targetSchema}.${fk.targetTable}`)}
                                                >
                                                    {fk.targetTable}.{fk.targetColumn}
                                                </button>
                                                <ConfidenceBadge confidence={fk.confidence} method={fk.inferenceMethod} reason={fk.reason} />
                                                {isNewRel?.(fk) && (
                                                    <Badge className="text-[7px] h-3 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 animate-pulse">
                                                        NUOVO
                                                    </Badge>
                                                )}
                                            </div>
                                            {fk.reason && <ExpandableReason reason={fk.reason} />}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {table.foreignKeysIn.length > 0 && (
                                <div className="space-y-1">
                                    <span className="font-medium text-green-600 dark:text-green-400">FK Entrata:</span>
                                    {table.foreignKeysIn.map((fk, i) => (
                                        <div key={i}>
                                            <div className="flex items-center gap-1.5 pl-2">
                                                <button
                                                    className="text-green-600 hover:underline font-mono"
                                                    onClick={() => onScrollToTable(`${fk.sourceSchema}.${fk.sourceTable}`)}
                                                >
                                                    {fk.sourceTable}.{fk.sourceColumn}
                                                </button>
                                                <ArrowRight className="h-2.5 w-2.5 text-green-500" />
                                                <span className="font-mono">{fk.targetColumn}</span>
                                                <ConfidenceBadge confidence={fk.confidence} method={fk.inferenceMethod} reason={fk.reason} />
                                                {isNewRel?.(fk) && (
                                                    <Badge className="text-[7px] h-3 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 animate-pulse">
                                                        NUOVO
                                                    </Badge>
                                                )}
                                            </div>
                                            {fk.reason && <ExpandableReason reason={fk.reason} />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

// ─── Main Dialog ────────────────────────────────────────────────────────────
export function DatabaseMapDialog({ connectorId, connectorName, open, onOpenChange }: DatabaseMapDialogProps) {
    const { toast } = useToast();
    const [map, setMap] = useState<DatabaseMap | null>(null);
    const [loading, setLoading] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | null>(null);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('diagram');
    const scrollRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef(false);

    // Load cached map only on first open or connector change
    const prevConnectorRef = useRef(connectorId);
    useEffect(() => {
        if (open) {
            // Reload only if no map yet or connector changed
            if (!map || prevConnectorRef.current !== connectorId) {
                prevConnectorRef.current = connectorId;
                setMap(null);
                loadCached();
            }
        }
    }, [open, connectorId]);

    // Load AI provider setting on mount
    useEffect(() => {
        getAiProviderAction().then(res => {
            if (res.provider) setAiProvider(res.provider);
            if (res.claudeCliModel) setClaudeCliModel(res.claudeCliModel);
        });
    }, []);

    const loadCached = async () => {
        setLoading(true);
        const res = await getCachedDatabaseMapAction(connectorId);
        if (res.data) {
            setMap(res.data);
        }
        setLoading(false);
    };

    const handleScan = async () => {
        setLoading(true);
        startTimer();
        const res = await getDatabaseMapAction(connectorId);
        stopTimer();
        if (res.error) {
            toast({ variant: 'destructive', title: 'Errore Scansione', description: res.error });
        } else if (res.data) {
            setMap(res.data);
            toast({ title: 'Mappa generata', description: `${res.data.summary.totalTables} tabelle trovate` });
        }
        setLoading(false);
    };

    const handleGenerateAI = async (mode: 'all' | 'missing') => {
        setGeneratingAI(true);
        setAiProgress({ current: 0, total: 0 });
        cancelRef.current = false;
        startTimer();

        const MAX_RETRIES = 5;
        let retryRound = 0;
        let lastError: string | undefined;

        while (retryRound <= MAX_RETRIES) {
            if (cancelRef.current) break;

            let batchIdx = 0;
            let roundFailed = 0;
            let roundProcessed = 0;

            // For 'all' mode first round processes everything; subsequent retries use 'missing'
            const effectiveMode = (mode === 'all' && retryRound === 0) ? 'all' : 'missing';

            while (true) {
                if (cancelRef.current) break;

                const res = await generateDescriptionBatchAction(connectorId, effectiveMode, batchIdx, aiProvider === 'claude-cli' ? claudeCliModel : (aiMode === 'paid' ? selectedModel : undefined), aiProvider);
                if (res.usage) {
                    setSessionCost(prev => ({ tokens: prev.tokens + res.usage!.totalTokens, costUsd: prev.costUsd + res.usage!.costUsd }));
                }

                if (res.error && res.done) {
                    lastError = res.error;
                    roundFailed = -1;
                    break;
                }

                roundProcessed += res.batchProcessed;
                if (res.failedTables) roundFailed += res.failedTables;
                const globalProcessed = (res.totalTables - res.totalToProcess) + roundProcessed;
                setAiProgress({ current: globalProcessed, total: res.totalTables });

                if (res.done || batchIdx % 8 === 0) {
                    const cached = await getCachedDatabaseMapAction(connectorId);
                    if (cached.data) setMap(cached.data);
                }

                if (res.done) break;
                batchIdx++;
            }

            // Fatal error or cancelled
            if (roundFailed === -1 || cancelRef.current) break;

            // All done
            if (roundFailed === 0) break;

            // Retry failed tables
            retryRound++;
            if (retryRound > MAX_RETRIES) {
                toast({ variant: 'destructive', title: 'Descrizioni incomplete', description: `Ancora ${roundFailed} tabelle senza descrizione dopo ${MAX_RETRIES} tentativi.` });
                break;
            }
            console.log(`[handleGenerateAI] Retry round ${retryRound}: ${roundFailed} tables failed, retrying...`);
            await new Promise(r => setTimeout(r, 2000));
        }

        // Final refresh
        const finalCached = await getCachedDatabaseMapAction(connectorId);
        if (finalCached.data) setMap(finalCached.data);

        stopTimer();

        if (lastError) {
            toast({ variant: 'destructive', title: 'Errore AI', description: lastError });
        } else if (!cancelRef.current) {
            toast({ title: 'Descrizioni completate' });
        }

        setGeneratingAI(false);
        setAiProgress(null);
    };

    const handleCancelAI = () => {
        cancelRef.current = true;
    };

    const [inferringRels, setInferringRels] = useState(false);
    const [inferProgress, setInferProgress] = useState<{ current: number; total: number; found: number } | null>(null);
    const [dataSampling, setDataSampling] = useState(false);
    const [dataProgress, setDataProgress] = useState<{ phase: string; progress: string; found: number; percent: number } | null>(null);
    const [newRelKeys, setNewRelKeys] = useState<Set<string>>(new Set());
    const [fullAnalysisRunning, setFullAnalysisRunning] = useState(false);
    const [fullAnalysisStep, setFullAnalysisStep] = useState<string | null>(null);

    // AI provider (from settings)
    const [aiProvider, setAiProvider] = useState<AiProvider>('openrouter');
    const [claudeCliModel, setClaudeCliModel] = useState('claude-sonnet-4-6');

    // AI model selection: 'free' (auto-rotate best free models) or 'paid' (user-selected) — OpenRouter only
    const [aiMode, setAiMode] = useState<'free' | 'paid'>('free');
    const [selectedModel, setSelectedModel] = useState('');
    const [allModelsMap, setAllModelsMap] = useState<any[]>([]);
    const [isModelsLoadingMap, setIsModelsLoadingMap] = useState(false);
    const [modelSearchMap, setModelSearchMap] = useState('');
    const [isModelDialogOpenMap, setIsModelDialogOpenMap] = useState(false);

    // ─── Session cost tracking (USD → EUR) ──────────────────────────────────
    const USD_TO_EUR = 0.92;
    const [sessionCost, setSessionCost] = useState({ tokens: 0, costUsd: 0 });

    // Load models when model dialog opens
    useEffect(() => {
        if (isModelDialogOpenMap && allModelsMap.length === 0) {
            setIsModelsLoadingMap(true);
            fetchOpenRouterModelsAction().then(result => {
                if (result.data) {
                    // Sort by price ascending (cheapest first)
                    const sorted = [...result.data].sort((a, b) => {
                        const pa = parseFloat(a.pricing?.prompt || '0');
                        const pb = parseFloat(b.pricing?.prompt || '0');
                        return pa - pb;
                    });
                    setAllModelsMap(sorted);
                }
                setIsModelsLoadingMap(false);
            });
        }
    }, [isModelDialogOpenMap, allModelsMap.length]);

    const filteredModelsMap = allModelsMap.filter(m =>
        m.name.toLowerCase().includes(modelSearchMap.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearchMap.toLowerCase())
    );

    // ─── Elapsed time timer ──────────────────────────────────────────────────
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startTimer = useCallback(() => {
        setElapsedSeconds(0);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);
    }, []);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const formatElapsed = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const handleInferRelationshipsAI = async () => {
        setInferringRels(true);
        setInferProgress({ current: 0, total: 0, found: 0 });
        cancelRef.current = false;
        startTimer();

        let batchIdx = 0;
        let totalFound = 0;
        let lastError: string | undefined;

        while (true) {
            if (cancelRef.current) break;

            const res = await inferRelationshipsAIAction(connectorId, batchIdx, aiProvider === 'claude-cli' ? claudeCliModel : (aiMode === 'paid' ? selectedModel : undefined), aiProvider);
            if (res.usage) {
                setSessionCost(prev => ({ tokens: prev.tokens + res.usage!.totalTokens, costUsd: prev.costUsd + res.usage!.costUsd }));
            }

            if (res.error && res.done) {
                lastError = res.error;
                break;
            }

            totalFound += res.newRelationships;
            setInferProgress({ current: res.totalProcessed, total: res.totalTables, found: totalFound });

            // Refresh map only every 10 batches or when done (avoid round-trips on every iteration)
            if (res.done || batchIdx % 10 === 0) {
                const cached = await getCachedDatabaseMapAction(connectorId);
                if (cached.data) setMap(cached.data);
            }

            if (res.done) break;
            batchIdx++;
        }

        stopTimer();

        if (lastError) {
            toast({ variant: 'destructive', title: 'Errore AI', description: lastError });
        } else if (!cancelRef.current) {
            toast({ title: 'Inferenza completata', description: `${totalFound} nuove relazioni trovate` });
        }

        setInferringRels(false);
        setInferProgress(null);
    };

    const handleDeepDataAnalysis = async () => {
        setDataSampling(true);
        setDataProgress({ phase: 'fingerprinting', progress: 'Avvio analisi...', found: 0, percent: 0 });
        cancelRef.current = false;
        startTimer();

        // Snapshot existing relationships for "NUOVO" badge detection
        const preExistingKeys = new Set(
            (map?.relationships || []).map(r =>
                `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase()
            )
        );

        let batchIdx = 0;
        let totalFound = 0;
        let lastError: string | undefined;
        let tablesAnalyzed = 0;
        let candidatesEvaluated = 0;

        while (true) {
            if (cancelRef.current) break;

            const res = await inferRelationshipsFromDataAction(connectorId, batchIdx);

            if (res.error) {
                lastError = res.error;
                if (res.done) break;
            }

            totalFound += res.newRelationships;
            if (res.totalTables) tablesAnalyzed = res.totalTables;
            if (res.totalCandidates) candidatesEvaluated = res.totalCandidates;
            setDataProgress({ phase: res.phase, progress: res.progress, found: totalFound, percent: res.progressPercent ?? 0 });

            // Refresh map only every 10 batches or when done (avoid round-trips on every iteration)
            if (res.done || batchIdx % 10 === 0) {
                const cached = await getCachedDatabaseMapAction(connectorId);
                if (cached.data) {
                    setMap(cached.data);
                    // Detect new relationships for "NUOVO" badge
                    if (res.done || res.newRelationships > 0) {
                        const newKeys = new Set<string>();
                        for (const r of cached.data.relationships) {
                            const key = `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase();
                            if (!preExistingKeys.has(key)) newKeys.add(key);
                        }
                        if (newKeys.size > 0) setNewRelKeys(newKeys);
                    }
                }
            }

            if (res.done) break;
            batchIdx++;
        }

        if (lastError) {
            toast({ variant: 'destructive', title: 'Errore Analisi Dati', description: lastError });
        } else if (!cancelRef.current) {
            toast({
                title: 'Analisi completata',
                description: `${totalFound} relazioni scoperte (${tablesAnalyzed} tabelle, ${candidatesEvaluated} candidati valutati)`,
            });
        }

        stopTimer();

        // Show final state briefly before clearing
        if (!cancelRef.current && !lastError) {
            setDataProgress({
                phase: 'done',
                progress: `Completata: ${totalFound} relazioni (${tablesAnalyzed} tabelle, ${candidatesEvaluated} candidati)`,
                found: totalFound,
                percent: 100,
            });
            setTimeout(() => {
                setDataSampling(false);
                setDataProgress(null);
            }, 3000);
        } else {
            setDataSampling(false);
            setDataProgress(null);
        }
    };

    // ─── Unified "Analisi Completa": scan → descriptions → relations → deep data ───
    const handleFullAnalysis = async () => {
        setFullAnalysisRunning(true);
        cancelRef.current = false;
        startTimer();

        // Step 1: Scan DB
        setFullAnalysisStep('Scansione database...');
        setLoading(true);
        const scanRes = await getDatabaseMapAction(connectorId);
        setLoading(false);
        if (scanRes.error) {
            toast({ variant: 'destructive', title: 'Errore Scansione', description: scanRes.error });
            stopTimer(); setFullAnalysisRunning(false);
            setFullAnalysisStep(null);
            return;
        }
        if (scanRes.data) setMap(scanRes.data);
        if (cancelRef.current) { stopTimer(); setFullAnalysisRunning(false); setFullAnalysisStep(null); return; }

        // Step 2: AI descriptions (missing only) — retry until all done
        setFullAnalysisStep('Generazione descrizioni AI...');
        setGeneratingAI(true);
        setAiProgress({ current: 0, total: 0 });
        {
            const MAX_RETRIES = 5; // max retry rounds for failed tables
            let retryRound = 0;
            let globalProcessed = 0;

            while (retryRound <= MAX_RETRIES) {
                if (cancelRef.current) break;

                let batchIdx = 0;
                let roundFailed = 0;
                let roundProcessed = 0;
                let roundTotal = 0;

                while (true) {
                    if (cancelRef.current) break;
                    const res = await generateDescriptionBatchAction(connectorId, 'missing', batchIdx, aiProvider === 'claude-cli' ? claudeCliModel : (aiMode === 'paid' ? selectedModel : undefined), aiProvider);
                    if (res.usage) {
                        setSessionCost(prev => ({ tokens: prev.tokens + res.usage!.totalTokens, costUsd: prev.costUsd + res.usage!.costUsd }));
                    }
                    if (res.error && res.done) {
                        // Fatal error (no API key, no map, etc.) — abort entirely
                        toast({ variant: 'destructive', title: 'Errore Descrizioni AI', description: res.error });
                        roundFailed = -1; // signal to break outer loop
                        break;
                    }
                    roundProcessed += res.batchProcessed;
                    roundTotal = res.totalToProcess;
                    if (res.failedTables) roundFailed += res.failedTables;
                    globalProcessed = (res.totalTables - roundTotal) + roundProcessed; // described so far
                    setAiProgress({ current: globalProcessed, total: res.totalTables });
                    if (retryRound > 0) {
                        setFullAnalysisStep(`Generazione descrizioni AI... (retry ${retryRound}/${MAX_RETRIES})`);
                    }
                    if (res.done || batchIdx % 8 === 0) {
                        const cached = await getCachedDatabaseMapAction(connectorId);
                        if (cached.data) setMap(cached.data);
                    }
                    if (res.done) break;
                    batchIdx++;
                }

                // Fatal error or cancelled — stop
                if (roundFailed === -1 || cancelRef.current) break;

                // All done — no missing tables left
                if (roundFailed === 0) break;

                // There are still failed tables — retry with 'missing' mode
                console.log(`[DB-MAP] Description retry round ${retryRound + 1}: ${roundFailed} tables failed, retrying...`);
                retryRound++;

                if (retryRound > MAX_RETRIES) {
                    toast({ variant: 'destructive', title: 'Descrizioni incomplete', description: `Ancora ${roundFailed} tabelle senza descrizione dopo ${MAX_RETRIES} tentativi.` });
                    break;
                }

                // Small delay before retry to let rate limits reset
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        setGeneratingAI(false);
        setAiProgress(null);
        if (cancelRef.current) { stopTimer(); setFullAnalysisRunning(false); setFullAnalysisStep(null); return; }

        // Step 3: Infer relationships AI
        setFullAnalysisStep('Scoperta relazioni AI...');
        setInferringRels(true);
        setInferProgress({ current: 0, total: 0, found: 0 });
        {
            let batchIdx = 0;
            let totalFound = 0;
            while (true) {
                if (cancelRef.current) break;
                const res = await inferRelationshipsAIAction(connectorId, batchIdx, aiProvider === 'claude-cli' ? claudeCliModel : (aiMode === 'paid' ? selectedModel : undefined), aiProvider);
                if (res.usage) {
                    setSessionCost(prev => ({ tokens: prev.tokens + res.usage!.totalTokens, costUsd: prev.costUsd + res.usage!.costUsd }));
                }
                if (res.error && res.done) break;
                totalFound += res.newRelationships;
                setInferProgress({ current: res.totalProcessed, total: res.totalTables, found: totalFound });
                // Refresh map only every 5 batches or when done
                if (res.done || batchIdx % 10 === 0) {
                    const cached = await getCachedDatabaseMapAction(connectorId);
                    if (cached.data) setMap(cached.data);
                }
                if (res.done) break;
                batchIdx++;
            }
        }
        setInferringRels(false);
        setInferProgress(null);
        if (cancelRef.current) { stopTimer(); setFullAnalysisRunning(false); setFullAnalysisStep(null); return; }

        // Step 4: Deep data analysis
        setFullAnalysisStep('Analisi profonda dati...');
        setDataSampling(true);
        setDataProgress({ phase: 'fingerprinting', progress: 'Avvio analisi dati...', found: 0, percent: 0 });

        const preExistingKeys = new Set(
            ((await getCachedDatabaseMapAction(connectorId)).data?.relationships || []).map(r =>
                `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase()
            )
        );
        {
            let batchIdx = 0;
            let totalFound = 0;
            let tablesAnalyzed = 0;
            let candidatesEvaluated = 0;
            while (true) {
                if (cancelRef.current) break;
                const res = await inferRelationshipsFromDataAction(connectorId, batchIdx);
                if (res.error && res.done) break;
                totalFound += res.newRelationships;
                if (res.totalTables) tablesAnalyzed = res.totalTables;
                if (res.totalCandidates) candidatesEvaluated = res.totalCandidates;
                setDataProgress({ phase: res.phase, progress: res.progress, found: totalFound, percent: res.progressPercent ?? 0 });
                // Refresh map only every 5 batches or when done
                if (res.done || batchIdx % 10 === 0) {
                    const cached = await getCachedDatabaseMapAction(connectorId);
                    if (cached.data) {
                        setMap(cached.data);
                        if (res.done || res.newRelationships > 0) {
                            const newKeys = new Set<string>();
                            for (const r of cached.data.relationships) {
                                const key = `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase();
                                if (!preExistingKeys.has(key)) newKeys.add(key);
                            }
                            if (newKeys.size > 0) setNewRelKeys(newKeys);
                        }
                    }
                }
                if (res.done) break;
                batchIdx++;
            }
        }

        stopTimer();

        if (!cancelRef.current) {
            setDataProgress({ phase: 'done', progress: 'Analisi completa!', found: 0, percent: 100 });
            toast({ title: 'Analisi completa', description: 'Scansione, descrizioni, relazioni e analisi dati completate.' });
            setTimeout(() => { setDataSampling(false); setDataProgress(null); }, 3000);
        } else {
            setDataSampling(false);
            setDataProgress(null);
        }

        setFullAnalysisRunning(false);
        setFullAnalysisStep(null);
    };

    // ─── "Completa Mappatura" – resumes from where it left off ───────────────
    const handleResumeAnalysis = async () => {
        if (!map) {
            // No map at all → run full analysis
            handleFullAnalysis();
            return;
        }

        setFullAnalysisRunning(true);
        cancelRef.current = false;
        startTimer();

        // Determine what's already done
        const totalTables = map.summary.totalTables;
        const descDone = map.tables.filter(t => t.userDescription || t.description).length;
        const hasRelationships = map.summary.totalRelationships > 0;

        // Step 1: Skip scan – map already exists

        // Step 2: AI descriptions (missing only) – skip if all have descriptions
        if (descDone < totalTables) {
            setFullAnalysisStep('Completamento descrizioni AI...');
            setGeneratingAI(true);
            setAiProgress({ current: 0, total: 0 });
            {
                let batchIdx = 0;
                let totalProcessed = 0;
                while (true) {
                    if (cancelRef.current) break;
                    const res = await generateDescriptionBatchAction(connectorId, 'missing', batchIdx, aiProvider === 'claude-cli' ? claudeCliModel : (aiMode === 'paid' ? selectedModel : undefined), aiProvider);
                    if (res.usage) {
                        setSessionCost(prev => ({ tokens: prev.tokens + res.usage!.totalTokens, costUsd: prev.costUsd + res.usage!.costUsd }));
                    }
                    if (res.error && res.done) break;
                    totalProcessed += res.batchProcessed;
                    setAiProgress({ current: totalProcessed, total: res.totalToProcess });
                    if (res.done || batchIdx % 8 === 0) {
                        const cached = await getCachedDatabaseMapAction(connectorId);
                        if (cached.data) setMap(cached.data);
                    }
                    if (res.done) break;
                    batchIdx++;
                }
            }
            setGeneratingAI(false);
            setAiProgress(null);
            if (cancelRef.current) { stopTimer(); setFullAnalysisRunning(false); setFullAnalysisStep(null); return; }
        }

        // Step 3: Infer relationships AI
        setFullAnalysisStep('Scoperta relazioni AI...');
        setInferringRels(true);
        setInferProgress({ current: 0, total: 0, found: 0 });
        {
            let batchIdx = 0;
            let totalFound = 0;
            while (true) {
                if (cancelRef.current) break;
                const res = await inferRelationshipsAIAction(connectorId, batchIdx, aiProvider === 'claude-cli' ? claudeCliModel : (aiMode === 'paid' ? selectedModel : undefined), aiProvider);
                if (res.usage) {
                    setSessionCost(prev => ({ tokens: prev.tokens + res.usage!.totalTokens, costUsd: prev.costUsd + res.usage!.costUsd }));
                }
                if (res.error && res.done) break;
                totalFound += res.newRelationships;
                setInferProgress({ current: res.totalProcessed, total: res.totalTables, found: totalFound });
                // Refresh map only every 5 batches or when done
                if (res.done || batchIdx % 10 === 0) {
                    const cached = await getCachedDatabaseMapAction(connectorId);
                    if (cached.data) setMap(cached.data);
                }
                if (res.done) break;
                batchIdx++;
            }
        }
        setInferringRels(false);
        setInferProgress(null);
        if (cancelRef.current) { stopTimer(); setFullAnalysisRunning(false); setFullAnalysisStep(null); return; }

        // Step 4: Deep data analysis
        setFullAnalysisStep('Analisi profonda dati...');
        setDataSampling(true);
        setDataProgress({ phase: 'fingerprinting', progress: 'Avvio analisi dati...', found: 0, percent: 0 });

        const preExistingKeys = new Set(
            ((await getCachedDatabaseMapAction(connectorId)).data?.relationships || []).map(r =>
                `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase()
            )
        );
        {
            let batchIdx = 0;
            let totalFound = 0;
            let tablesAnalyzed = 0;
            let candidatesEvaluated = 0;
            while (true) {
                if (cancelRef.current) break;
                const res = await inferRelationshipsFromDataAction(connectorId, batchIdx);
                if (res.error && res.done) break;
                totalFound += res.newRelationships;
                if (res.totalTables) tablesAnalyzed = res.totalTables;
                if (res.totalCandidates) candidatesEvaluated = res.totalCandidates;
                setDataProgress({ phase: res.phase, progress: res.progress, found: totalFound, percent: res.progressPercent ?? 0 });
                // Refresh map only every 5 batches or when done
                if (res.done || batchIdx % 10 === 0) {
                    const cached = await getCachedDatabaseMapAction(connectorId);
                    if (cached.data) {
                        setMap(cached.data);
                        if (res.done || res.newRelationships > 0) {
                            const newKeys = new Set<string>();
                            for (const r of cached.data.relationships) {
                                const key = `${r.sourceSchema}.${r.sourceTable}.${r.sourceColumn}->${r.targetSchema}.${r.targetTable}.${r.targetColumn}`.toLowerCase();
                                if (!preExistingKeys.has(key)) newKeys.add(key);
                            }
                            if (newKeys.size > 0) setNewRelKeys(newKeys);
                        }
                    }
                }
                if (res.done) break;
                batchIdx++;
            }
        }

        stopTimer();

        if (!cancelRef.current) {
            setDataProgress({ phase: 'done', progress: 'Analisi completa!', found: 0, percent: 100 });
            toast({ title: 'Mappatura completata', description: 'Descrizioni, relazioni e analisi dati completate.' });
            setTimeout(() => { setDataSampling(false); setDataProgress(null); }, 3000);
        } else {
            setDataSampling(false);
            setDataProgress(null);
        }

        setFullAnalysisRunning(false);
        setFullAnalysisStep(null);
    };

    const handleScrollToTable = useCallback((fullName: string) => {
        // Switch to tables tab first
        setActiveTab('tables');
        // Wait for tab render, then scroll
        setTimeout(() => {
            const el = document.getElementById(`table-${fullName}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('ring-2', 'ring-violet-400', 'rounded-lg');
                setTimeout(() => el.classList.remove('ring-2', 'ring-violet-400', 'rounded-lg'), 2000);
            }
        }, 100);
    }, []);

    const isNewRel = useCallback((fk: RelationshipInfo) => {
        const key = `${fk.sourceSchema}.${fk.sourceTable}.${fk.sourceColumn}->${fk.targetSchema}.${fk.targetTable}.${fk.targetColumn}`.toLowerCase();
        return newRelKeys.has(key);
    }, [newRelKeys]);

    // Filter tables
    const searchLower = search.toLowerCase();
    const filteredTables = map?.tables.filter(t => {
        if (!search) return true;
        if (t.name.toLowerCase().includes(searchLower)) return true;
        if (t.fullName.toLowerCase().includes(searchLower)) return true;
        if (t.description?.toLowerCase().includes(searchLower)) return true;
        if (t.userDescription?.toLowerCase().includes(searchLower)) return true;
        if (t.columns.some(c =>
            c.name.toLowerCase().includes(searchLower) ||
            c.description?.toLowerCase().includes(searchLower) ||
            c.userDescription?.toLowerCase().includes(searchLower)
        )) return true;
        return false;
    }) || [];

    // Count tables with descriptions
    const tablesWithDesc = map?.tables.filter(t => t.userDescription || t.description).length || 0;
    const colsWithDesc = map?.tables.reduce((sum, t) =>
        sum + t.columns.filter(c => c.userDescription || c.description).length, 0) || 0;

    const timeAgo = (iso: string) => {
        const diff = Date.now() - new Date(iso).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'adesso';
        if (mins < 60) return `${mins}m fa`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h fa`;
        const days = Math.floor(hrs / 24);
        return `${days}g fa`;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[95vw] md:max-w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm">
                        <Database className="h-4 w-4 text-violet-500" />
                        Mappa Database: {connectorName}
                    </DialogTitle>
                    <DialogDescription className="text-[11px]">
                        {map ? (
                            <>DB: {map.databaseName} &bull; Aggiornata: {timeAgo(map.generatedAt)}
                                {map.descriptionsGeneratedAt && (
                                    <> &bull; Descrizioni AI: {timeAgo(map.descriptionsGeneratedAt)}</>
                                )}
                            </>
                        ) : (
                            'Scansiona il database per generare la mappa strutturale'
                        )}
                    </DialogDescription>
                </DialogHeader>

                {/* Actions bar */}
                <div className="px-4 py-2 border-b shrink-0 space-y-2">
                    {/* Row 1: Stats badges */}
                    {map && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{map.summary.totalTables} Tabelle</Badge>
                            <Badge variant="secondary" className="text-[10px]">{map.summary.totalColumns} Colonne</Badge>
                            <Badge variant="secondary" className="text-[10px]">
                                <Link2 className="h-2.5 w-2.5 mr-0.5" />
                                {map.summary.totalRelationships} Relazioni
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                {tablesWithDesc}/{map.summary.totalTables} descr. tabelle
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                                {colsWithDesc}/{map.summary.totalColumns} descr. colonne
                            </Badge>
                        </div>
                    )}
                    {/* Row 2: AI Model selector + Action buttons + progress */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* AI Mode Toggle: Free / Paid (OpenRouter only) */}
                        {aiProvider === 'openrouter' && !fullAnalysisRunning && !generatingAI && !inferringRels && !dataSampling && (
                            <div className="flex items-center gap-1 border rounded-md h-7 px-1">
                                <button
                                    onClick={() => setAiMode('free')}
                                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                        aiMode === 'free' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <Gift className="h-2.5 w-2.5" />
                                    Free
                                </button>
                                <button
                                    onClick={() => setAiMode('paid')}
                                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                        aiMode === 'paid' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    <DollarSign className="h-2.5 w-2.5" />
                                    Paid
                                </button>
                            </div>
                        )}

                        {/* Claude CLI model selector */}
                        {aiProvider === 'claude-cli' && !fullAnalysisRunning && !generatingAI && !inferringRels && !dataSampling && (
                            <div className="flex items-center gap-1.5">
                                <Badge variant="secondary" className="text-[10px] h-6 px-2 bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                    Claude CLI
                                </Badge>
                                <select
                                    className="h-7 text-[10px] rounded-md border bg-background px-1.5"
                                    value={claudeCliModel}
                                    onChange={(e) => setClaudeCliModel(e.target.value)}
                                >
                                    <optgroup label="Latest">
                                        <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                                        <option value="claude-opus-4-6">Opus 4.6</option>
                                        <option value="claude-haiku-4-5">Haiku 4.5</option>
                                    </optgroup>
                                    <optgroup label="Alias">
                                        <option value="sonnet">sonnet (latest)</option>
                                        <option value="opus">opus (latest)</option>
                                        <option value="haiku">haiku (latest)</option>
                                    </optgroup>
                                </select>
                            </div>
                        )}

                        {/* OpenRouter Paid model selector - opens Dialog with Table */}
                        {aiProvider === 'openrouter' && aiMode === 'paid' && !fullAnalysisRunning && !generatingAI && !inferringRels && !dataSampling && (
                            <Dialog open={isModelDialogOpenMap} onOpenChange={setIsModelDialogOpenMap}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] max-w-[220px] justify-between font-normal"
                                    onClick={() => setIsModelDialogOpenMap(true)}
                                >
                                    <span className="truncate">
                                        {selectedModel
                                            ? (allModelsMap.find(m => m.id === selectedModel)?.name || selectedModel.split('/').pop())
                                            : 'Seleziona modello...'}
                                    </span>
                                    <span className="text-muted-foreground ml-1 text-[9px] shrink-0">Cambia</span>
                                </Button>
                                <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                                    <DialogHeader>
                                        <DialogTitle className="text-sm">Seleziona Modello AI per Mappatura DB</DialogTitle>
                                    </DialogHeader>
                                    <div className="flex items-center border rounded-md px-2 py-1.5 my-1 bg-muted/30">
                                        <Search className="mr-1.5 h-3 w-3 opacity-50" />
                                        <Input
                                            placeholder="Cerca modello..."
                                            value={modelSearchMap}
                                            onChange={e => setModelSearchMap(e.target.value)}
                                            className="border-0 focus-visible:ring-0 bg-transparent h-7 text-xs"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex-1 overflow-auto border rounded-md">
                                        {isModelsLoadingMap ? (
                                            <div className="flex items-center justify-center h-40">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                <span className="ml-2 text-xs text-muted-foreground">Caricamento modelli...</span>
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                                                    <TableRow>
                                                        <TableHead className="text-[10px]">Nome</TableHead>
                                                        <TableHead className="text-[10px]">ID</TableHead>
                                                        <TableHead className="text-[10px]">Context</TableHead>
                                                        <TableHead className="text-[10px]">Input ($/1M)</TableHead>
                                                        <TableHead className="text-[10px]">Output ($/1M)</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {filteredModelsMap.map((m) => {
                                                        const isSelected = selectedModel === m.id;
                                                        const promptPrice = parseFloat(m.pricing?.prompt || '0');
                                                        const completionPrice = parseFloat(m.pricing?.completion || '0');
                                                        const isFree = promptPrice === 0 && completionPrice === 0;
                                                        return (
                                                            <TableRow
                                                                key={m.id}
                                                                className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5 dark:bg-primary/20' : ''}`}
                                                                onClick={() => {
                                                                    setSelectedModel(m.id);
                                                                    setIsModelDialogOpenMap(false);
                                                                }}
                                                            >
                                                                <TableCell className="font-medium p-1.5 text-[10px] truncate max-w-[200px]" title={m.name}>
                                                                    {m.name}
                                                                    {isSelected && <CheckCircle2 className="inline ml-1 h-2.5 w-2.5 text-primary" />}
                                                                </TableCell>
                                                                <TableCell className="text-[9px] text-muted-foreground font-mono p-1.5 truncate max-w-[150px]" title={m.id}>{m.id}</TableCell>
                                                                <TableCell className="text-[9px] p-1.5">{Math.round(m.context_length / 1000)}k</TableCell>
                                                                <TableCell className={`text-[9px] font-mono p-1.5 ${isFree ? 'text-green-600 font-semibold' : ''}`}>
                                                                    {isFree ? 'FREE' : `$${(promptPrice * 1000000).toFixed(2)}`}
                                                                </TableCell>
                                                                <TableCell className={`text-[9px] font-mono p-1.5 ${isFree ? 'text-green-600 font-semibold' : ''}`}>
                                                                    {isFree ? 'FREE' : `$${(completionPrice * 1000000).toFixed(2)}`}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                    {filteredModelsMap.length === 0 && (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                                                                Nessun modello trovato per &quot;{modelSearchMap}&quot;
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground text-right pt-1">
                                        {filteredModelsMap.length} modelli • ordinati per prezzo
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}

                        {!fullAnalysisRunning && !generatingAI && !inferringRels && !dataSampling && (
                            <>
                                <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleFullAnalysis} disabled={loading || (aiProvider === 'openrouter' && aiMode === 'paid' && !selectedModel)}>
                                    {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                                    {map ? 'Analisi Completa' : 'Scansiona e Analizza'}
                                </Button>
                                {map && (
                                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleResumeAnalysis} disabled={loading || (aiProvider === 'openrouter' && aiMode === 'paid' && !selectedModel)}>
                                        <PlayCircle className="h-3 w-3 mr-1" />
                                        Completa Mappatura
                                    </Button>
                                )}
                            </>
                        )}
                        {fullAnalysisStep && (
                            <Badge variant="secondary" className="text-[10px] h-5 px-2 animate-pulse">
                                {fullAnalysisStep}
                            </Badge>
                        )}
                        {/* Elapsed time timer */}
                        {(loading || fullAnalysisRunning || generatingAI || inferringRels || dataSampling) && elapsedSeconds > 0 && (
                            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-0.5">
                                <Timer className="h-3 w-3 text-slate-500" />
                                <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                                    {formatElapsed(elapsedSeconds)}
                                </span>
                            </div>
                        )}
                        {/* Session cost counter */}
                        {sessionCost.tokens > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-0.5" title={`Token: ${sessionCost.tokens.toLocaleString()} | USD: $${sessionCost.costUsd.toFixed(6)}`}>
                                <DollarSign className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                <span className="text-xs font-mono font-medium text-amber-700 dark:text-amber-300 tabular-nums">
                                    {sessionCost.costUsd > 0
                                        ? `€${(sessionCost.costUsd * USD_TO_EUR).toFixed(4)}`
                                        : `${(sessionCost.tokens / 1000).toFixed(0)}k tok`
                                    }
                                </span>
                            </div>
                        )}
                        {/* Progress for descriptions */}
                        {generatingAI && aiProgress && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-md px-2.5 py-1">
                                    <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                                    <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                                        Descrizioni: {aiProgress.current}/{aiProgress.total} tabelle
                                    </span>
                                    {aiProgress.total > 0 && (
                                        <div className="w-16 h-1.5 bg-violet-200 dark:bg-violet-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                                                style={{ width: `${Math.round((aiProgress.current / aiProgress.total) * 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={handleCancelAI}>
                                    <X className="h-3 w-3 mr-1" />
                                    Stop
                                </Button>
                            </div>
                        )}
                        {/* Progress for AI relationship inference */}
                        {inferringRels && inferProgress && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-1">
                                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                        Relazioni: {inferProgress.current}/{inferProgress.total} tabelle &bull; {inferProgress.found} trovate
                                    </span>
                                    {inferProgress.total > 0 && (
                                        <div className="w-16 h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                                style={{ width: `${Math.round((inferProgress.current / inferProgress.total) * 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={handleCancelAI}>
                                    <X className="h-3 w-3 mr-1" />
                                    Stop
                                </Button>
                            </div>
                        )}
                        {/* Progress for deep data analysis */}
                        {dataSampling && dataProgress && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-md px-2.5 py-1">
                                    {dataProgress.phase === 'done'
                                        ? <Check className="h-3 w-3 text-green-500" />
                                        : <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                                    }
                                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                                        {dataProgress.progress}
                                        {dataProgress.found > 0 && ` \u2022 ${dataProgress.found} relazioni`}
                                    </span>
                                    {dataProgress.percent > 0 && (
                                        <div className="w-20 h-1.5 bg-indigo-200 dark:bg-indigo-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                                style={{ width: `${dataProgress.percent}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                                {dataProgress.phase !== 'done' && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={handleCancelAI}>
                                        <X className="h-3 w-3 mr-1" />
                                        Stop
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden" ref={scrollRef}>
                    {loading && !map ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                            <p className="text-sm text-muted-foreground">Scansione database in corso...</p>
                            {elapsedSeconds > 0 && (
                                <p className="text-xs font-mono text-muted-foreground/60 tabular-nums">
                                    {formatElapsed(elapsedSeconds)}
                                </p>
                            )}
                            {elapsedSeconds > 30 && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 max-w-sm text-center">
                                    Database con molte tabelle – la scansione potrebbe richiedere qualche minuto...
                                </p>
                            )}
                        </div>
                    ) : !map ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-3">
                            <Database className="h-12 w-12 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">Clicca &quot;Scansiona e Analizza&quot; per iniziare</p>
                        </div>
                    ) : (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                            <div className="px-4 pt-2 shrink-0 border-b">
                                <TabsList className="h-8">
                                    <TabsTrigger value="diagram" className="text-xs h-7 gap-1.5">
                                        <Network className="h-3 w-3" />
                                        Diagramma ER
                                    </TabsTrigger>
                                    <TabsTrigger value="tables" className="text-xs h-7 gap-1.5">
                                        <Table2 className="h-3 w-3" />
                                        Tabelle ({filteredTables.length})
                                    </TabsTrigger>
                                    <TabsTrigger value="relations" className="text-xs h-7 gap-1.5">
                                        <GitFork className="h-3 w-3" />
                                        Relazioni ({map.summary.totalRelationships})
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="diagram" className="flex-1 overflow-hidden mt-0" style={{ height: 'calc(95vh - 200px)' }}>
                                <DatabaseERDiagram map={map} connectorId={connectorId} />
                            </TabsContent>

                            <TabsContent value="tables" className="flex-1 overflow-hidden mt-0">
                                {/* Search bar */}
                                <div className="px-4 py-2 border-b">
                                    <div className="flex items-center border rounded-md px-2.5 py-1.5 bg-muted/30">
                                        <Search className="h-3.5 w-3.5 opacity-50 mr-2 shrink-0" />
                                        <input
                                            placeholder="Cerca tabella, colonna o descrizione..."
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            className="border-0 h-5 text-xs focus:outline-none bg-transparent w-full"
                                        />
                                        {search && (
                                            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                                                <X className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <ScrollArea className="h-full max-h-[calc(95vh-260px)]">
                                    {/* Banner when no AI descriptions */}
                                    {tablesWithDesc === 0 && !generatingAI && (
                                        <div className="mx-4 mt-3 mb-1 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-lg px-4 py-3">
                                            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-amber-800 dark:text-amber-300">Nessuna descrizione AI generata</div>
                                                <div className="text-[11px] text-amber-700/80 dark:text-amber-400/70 mt-0.5">
                                                    Clicca &quot;Completa Mancanti&quot; o &quot;Aggiorna Tutte&quot; nella barra sopra per generare automaticamente le descrizioni di tabelle e colonne.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="px-2 py-2 space-y-0.5">
                                        {filteredTables.length === 0 ? (
                                            <p className="text-center text-sm text-muted-foreground py-8">
                                                {search ? 'Nessun risultato trovato' : 'Nessuna tabella nel database'}
                                            </p>
                                        ) : (
                                            filteredTables.map(table => (
                                                <TableCard
                                                    key={table.fullName}
                                                    table={table}
                                                    connectorId={connectorId}
                                                    onScrollToTable={handleScrollToTable}
                                                    isNewRel={isNewRel}
                                                />
                                            ))
                                        )}
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="relations" className="flex-1 overflow-hidden mt-0">
                                <ScrollArea className="h-full max-h-[calc(95vh-260px)]">
                                    <RelationshipsMapView
                                        map={map}
                                        onScrollToTable={handleScrollToTable}
                                    />
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
