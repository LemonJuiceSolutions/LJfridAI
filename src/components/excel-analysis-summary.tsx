'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, ArrowRight, BarChart3, Table2, Database, Code2, Settings, ChevronDown, ChevronRight, GitBranchPlus, Layers, Link2 } from 'lucide-react';

const ROLE_CONFIG: Record<string, { label: string; color: string; borderColor: string; icon: any }> = {
    data_source: { label: 'Dati', color: 'bg-blue-100 text-blue-800', borderColor: 'border-blue-300', icon: Database },
    transformation: { label: 'Trasformazione', color: 'bg-amber-100 text-amber-800', borderColor: 'border-amber-300', icon: Code2 },
    report: { label: 'Report', color: 'bg-emerald-100 text-emerald-800', borderColor: 'border-emerald-300', icon: Table2 },
    chart: { label: 'Grafico', color: 'bg-purple-100 text-purple-800', borderColor: 'border-purple-300', icon: BarChart3 },
    config: { label: 'Config', color: 'bg-gray-100 text-gray-800', borderColor: 'border-gray-300', icon: Settings },
    separator: { label: 'Sezione', color: 'bg-gray-50 text-gray-500', borderColor: 'border-gray-200', icon: ArrowRight },
    unknown: { label: '?', color: 'bg-gray-100 text-gray-600', borderColor: 'border-gray-300', icon: Table2 },
};

interface SheetInfo {
    name: string;
    maxRow: number;
    maxCol: number;
    formulas: Array<{ cell: string; formula: string }>;
    formulaSamples?: Array<{ cell: string; formula: string; translated?: string; pattern?: string }>;
    functionsUsed?: Array<{ name: string; count: number }>;
    charts: number;
    columnHeaders: Array<{ column: string; value: string }>;
    columnMapping?: Record<string, string>;
    sheetRole?: string;
    referencedSheets?: string[];
}

interface ExcelAnalysisSummaryProps {
    analysis: {
        filename: string;
        sheets: SheetInfo[];
        crossSheetReferences: Array<{ fromSheet: string; toSheet: string }>;
        namedRanges: Array<{ name: string; value: string }>;
        dataFlowGraph?: Record<string, string[]>;
        etlSummary?: {
            dataSources: string[];
            transformations: string[];
            reports: string[];
            charts: string[];
            configs: string[];
            totalFormulas: number;
            totalSheets: number;
        };
    };
}

export function ExcelAnalysisSummary({ analysis }: ExcelAnalysisSummaryProps) {
    const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
    const totalFormulas = analysis.etlSummary?.totalFormulas ?? analysis.sheets.reduce((sum, s) => sum + s.formulas.length, 0);
    const totalCharts = analysis.sheets.reduce((sum, s) => sum + s.charts, 0);

    const sheetMap = useMemo(() => new Map(analysis.sheets.map(s => [s.name, s])), [analysis.sheets]);

    // Build children map: parent -> children that reference it
    const childrenMap = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const s of analysis.sheets) {
            if (s.referencedSheets) {
                for (const ref of s.referencedSheets) {
                    if (!map.has(ref)) map.set(ref, []);
                    if (!map.get(ref)!.includes(s.name)) {
                        map.get(ref)!.push(s.name);
                    }
                }
            }
            // Also from dataFlowGraph
            if (analysis.dataFlowGraph?.[s.name]) {
                for (const ref of analysis.dataFlowGraph[s.name]) {
                    if (!map.has(ref)) map.set(ref, []);
                    if (!map.get(ref)!.includes(s.name)) {
                        map.get(ref)!.push(s.name);
                    }
                }
            }
        }
        return map;
    }, [analysis.sheets, analysis.dataFlowGraph]);

    // Root nodes: sheets with no dependencies (or data_source/config)
    const rootSheets = useMemo(() => {
        return analysis.sheets.filter(s => {
            if (s.sheetRole === 'separator') return false;
            const refs = s.referencedSheets || [];
            const flowRefs = analysis.dataFlowGraph?.[s.name] || [];
            return refs.length === 0 && flowRefs.length === 0;
        }).sort((a, b) => {
            // data_source first, then config, then others
            const order: Record<string, number> = { data_source: 0, config: 1, transformation: 2, report: 3, chart: 4 };
            return (order[a.sheetRole || 'unknown'] ?? 5) - (order[b.sheetRole || 'unknown'] ?? 5);
        });
    }, [analysis.sheets, analysis.dataFlowGraph]);

    const toggleSheet = useCallback((name: string) => {
        setExpandedSheets(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }, []);

    const etl = analysis.etlSummary;

    // Recursive tree node renderer
    const renderTreeNode = (sheetName: string, depth: number, rendered: Set<string>, isLast: boolean): React.ReactNode => {
        const sheet = sheetMap.get(sheetName);
        if (!sheet || sheet.sheetRole === 'separator') return null;

        const alreadyRendered = rendered.has(sheetName);
        rendered.add(sheetName);

        const role = ROLE_CONFIG[sheet.sheetRole || 'unknown'];
        const RoleIcon = role.icon;
        const children = childrenMap.get(sheetName) || [];
        const isExpanded = expandedSheets.has(sheetName);
        const hasFormulas = (sheet.formulaSamples && sheet.formulaSamples.length > 0);
        const hasDetails = hasFormulas ||
                           (sheet.functionsUsed && sheet.functionsUsed.length > 0);

        return (
            <div key={`${sheetName}-${depth}`} className="relative">
                {/* Tree connector lines */}
                {depth > 0 && (
                    <div className="absolute left-0 top-0 bottom-0" style={{ width: depth * 20 }}>
                        {/* Horizontal branch line */}
                        <div
                            className="absolute border-t border-muted-foreground/30"
                            style={{ left: (depth - 1) * 20 + 8, top: 14, width: 12 }}
                        />
                        {/* Vertical line */}
                        {!isLast && (
                            <div
                                className="absolute border-l border-muted-foreground/30"
                                style={{ left: (depth - 1) * 20 + 8, top: 14, bottom: 0 }}
                            />
                        )}
                        {isLast && (
                            <div
                                className="absolute border-l border-muted-foreground/30"
                                style={{ left: (depth - 1) * 20 + 8, top: 0, height: 14 }}
                            />
                        )}
                    </div>
                )}

                {/* Node content */}
                <div style={{ paddingLeft: depth * 20 }}>
                    {/* Already rendered elsewhere -> show as reference link */}
                    {alreadyRendered ? (
                        <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground italic">
                            <Link2 className="h-3 w-3 shrink-0" />
                            <span>{sheetName}</span>
                            <span className="text-[10px]">(vedi sopra)</span>
                        </div>
                    ) : (
                        <>
                            {/* Sheet node */}
                            <div
                                className={`inline-flex items-center gap-1.5 border rounded-md px-2 py-1 my-0.5 ${role.borderColor} cursor-pointer hover:shadow-sm transition-shadow`}
                                onClick={() => toggleSheet(sheetName)}
                            >
                                {(children.length > 0 || hasDetails) ? (
                                    isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 opacity-50" /> : <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                                ) : null}
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${role.color}`}>
                                    <RoleIcon className="h-2.5 w-2.5 mr-0.5" />
                                    {role.label}
                                </Badge>
                                <span className="font-medium text-xs">{sheet.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {sheet.maxRow}r
                                    {sheet.columnHeaders.length > 0 && `, ${sheet.columnHeaders.length}col`}
                                    {sheet.formulas.length > 0 && `, ${sheet.formulas.length}f`}
                                    {sheet.charts > 0 && `, ${sheet.charts}g`}
                                </span>
                                {children.length > 0 && !isExpanded && (
                                    <span className="text-[9px] text-muted-foreground/60">
                                        ({children.length} figli)
                                    </span>
                                )}
                            </div>

                            {/* Expanded: show details + child tree */}
                            {isExpanded && (
                                <div className="ml-4 mt-0.5">
                                    {/* Column headers */}
                                    {sheet.columnHeaders.length > 0 && (
                                        <div className="text-[10px] text-muted-foreground mb-0.5">
                                            <span className="font-medium">Colonne:</span>{' '}
                                            {sheet.columnHeaders.slice(0, 10).map(h => h.value).join(' | ')}
                                            {sheet.columnHeaders.length > 10 && ` +${sheet.columnHeaders.length - 10}`}
                                        </div>
                                    )}
                                    {/* Functions */}
                                    {sheet.functionsUsed && sheet.functionsUsed.length > 0 && (
                                        <div className="text-[10px] mb-0.5">
                                            <span className="font-medium text-muted-foreground">Funzioni:</span>{' '}
                                            {sheet.functionsUsed.map(f => (
                                                <Badge key={f.name} variant="secondary" className="text-[9px] mr-0.5 mb-0.5 px-1 py-0">
                                                    {f.name}({f.count})
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                    {/* Translated formulas */}
                                    {hasFormulas && (
                                        <div className="text-[10px] mb-1">
                                            <span className="font-medium text-muted-foreground">Logica:</span>
                                            <div className="mt-0.5 space-y-0.5">
                                                {sheet.formulaSamples!.slice(0, 5).map((f, i) => (
                                                    <div key={i} className="font-mono text-[9px] bg-muted/40 px-1.5 py-0.5 rounded truncate">
                                                        {f.translated && f.translated !== f.formula ? (
                                                            <span>{f.translated}</span>
                                                        ) : (
                                                            <><span className="text-muted-foreground">{f.cell}:</span> {f.formula}</>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Render children recursively (always, not only when expanded) */}
                            {isExpanded && children.length > 0 && (
                                <div className="relative">
                                    {/* Vertical line connecting to children */}
                                    {children.length > 1 && (
                                        <div
                                            className="absolute border-l border-muted-foreground/30"
                                            style={{ left: depth * 20 + 8, top: 0, bottom: 14 }}
                                        />
                                    )}
                                    {children.map((childName, ci) =>
                                        renderTreeNode(childName, depth + 1, rendered, ci === children.length - 1)
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Card className="mt-3">
            <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        Analisi: {analysis.filename}
                    </CardTitle>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setViewMode('tree')}
                            className={`p-1 rounded ${viewMode === 'tree' ? 'bg-muted' : 'hover:bg-muted/50'}`}
                            title="Vista albero"
                        >
                            <GitBranchPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1 rounded ${viewMode === 'list' ? 'bg-muted' : 'hover:bg-muted/50'}`}
                            title="Vista lista"
                        >
                            <Layers className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="py-2 space-y-3">
                {/* ETL Summary */}
                {etl && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {etl.dataSources.length > 0 && (
                            <div className="bg-blue-50 rounded p-2">
                                <div className="font-medium text-blue-800">Sorgenti Dati ({etl.dataSources.length})</div>
                                <div className="text-blue-600 text-[10px]">{etl.dataSources.join(', ')}</div>
                            </div>
                        )}
                        {etl.transformations.length > 0 && (
                            <div className="bg-amber-50 rounded p-2">
                                <div className="font-medium text-amber-800">Trasformazioni ({etl.transformations.length})</div>
                                <div className="text-amber-600 text-[10px]">{etl.transformations.join(', ')}</div>
                            </div>
                        )}
                        {etl.reports.length > 0 && (
                            <div className="bg-emerald-50 rounded p-2">
                                <div className="font-medium text-emerald-800">Report ({etl.reports.length})</div>
                                <div className="text-emerald-600 text-[10px]">{etl.reports.join(', ')}</div>
                            </div>
                        )}
                        {etl.charts.length > 0 && (
                            <div className="bg-purple-50 rounded p-2">
                                <div className="font-medium text-purple-800">Grafici ({etl.charts.length})</div>
                                <div className="text-purple-600 text-[10px]">{etl.charts.join(', ')}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* === TREE VIEW === */}
                {viewMode === 'tree' && (
                    <div className="space-y-0.5 overflow-x-auto">
                        {(() => {
                            const rendered = new Set<string>();
                            const nodes = rootSheets.map((sheet, i) =>
                                renderTreeNode(sheet.name, 0, rendered, i === rootSheets.length - 1)
                            );
                            // Orphans: sheets not reached from roots (circular deps or disconnected)
                            const orphans = analysis.sheets.filter(s =>
                                s.sheetRole !== 'separator' && !rendered.has(s.name)
                            );
                            if (orphans.length > 0) {
                                nodes.push(
                                    <div key="orphans" className="mt-2 pt-1 border-t border-dashed">
                                        <div className="text-[10px] font-medium text-muted-foreground mb-1">Fogli non collegati:</div>
                                        {orphans.map((s, i) => renderTreeNode(s.name, 0, rendered, i === orphans.length - 1))}
                                    </div>
                                );
                            }
                            return nodes;
                        })()}
                    </div>
                )}

                {/* === LIST VIEW === */}
                {viewMode === 'list' && (
                    <div className="space-y-1">
                        {analysis.sheets.filter(s => s.sheetRole !== 'separator').map(sheet => {
                            const role = ROLE_CONFIG[sheet.sheetRole || 'unknown'];
                            const RoleIcon = role.icon;
                            const isExpanded = expandedSheets.has(sheet.name);
                            const hasDetails = (sheet.formulaSamples && sheet.formulaSamples.length > 0) ||
                                               (sheet.functionsUsed && sheet.functionsUsed.length > 0) ||
                                               (sheet.referencedSheets && sheet.referencedSheets.length > 0);

                            return (
                                <div key={sheet.name}>
                                    <div
                                        className={`flex items-center gap-2 text-sm flex-wrap rounded px-2 py-1 ${hasDetails ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                                        onClick={() => hasDetails && toggleSheet(sheet.name)}
                                    >
                                        {hasDetails ? (
                                            isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
                                        ) : <span className="w-3" />}
                                        <Badge variant="outline" className={`shrink-0 text-[10px] ${role.color}`}>
                                            <RoleIcon className="h-3 w-3 mr-1" />
                                            {role.label}
                                        </Badge>
                                        <span className="font-medium">{sheet.name}</span>
                                        <span className="text-muted-foreground text-xs">
                                            {sheet.maxRow}r, {sheet.columnHeaders.length}col, {sheet.formulas.length} formule
                                            {sheet.charts > 0 && `, ${sheet.charts} grafici`}
                                        </span>
                                        {sheet.referencedSheets && sheet.referencedSheets.length > 0 && (
                                            <span className="text-[10px] text-muted-foreground">
                                                <ArrowRight className="h-2.5 w-2.5 inline" /> {sheet.referencedSheets.join(', ')}
                                            </span>
                                        )}
                                    </div>
                                    {isExpanded && (
                                        <div className="ml-8 pl-2 border-l-2 border-muted space-y-1 py-1">
                                            {sheet.columnHeaders.length > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    <span className="font-medium">Colonne:</span>{' '}
                                                    {sheet.columnHeaders.slice(0, 12).map(h => h.value).join(' | ')}
                                                    {sheet.columnHeaders.length > 12 && ` ... +${sheet.columnHeaders.length - 12}`}
                                                </div>
                                            )}
                                            {sheet.functionsUsed && sheet.functionsUsed.length > 0 && (
                                                <div className="text-xs">
                                                    <span className="font-medium text-muted-foreground">Funzioni:</span>{' '}
                                                    {sheet.functionsUsed.map(f => (
                                                        <Badge key={f.name} variant="secondary" className="text-[10px] mr-1 mb-0.5">
                                                            {f.name} ({f.count})
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {sheet.referencedSheets && sheet.referencedSheets.length > 0 && (
                                                <div className="text-xs text-muted-foreground">
                                                    <span className="font-medium">Dipende da:</span>{' '}
                                                    {sheet.referencedSheets.map(r => (
                                                        <Badge key={r} variant="outline" className="text-[10px] mr-1">
                                                            <ArrowRight className="h-2 w-2 mr-0.5" />{r}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {sheet.formulaSamples && sheet.formulaSamples.length > 0 && (
                                                <div className="text-xs">
                                                    <span className="font-medium text-muted-foreground">Logica (nomi colonna):</span>
                                                    <div className="mt-0.5 space-y-0.5">
                                                        {sheet.formulaSamples.slice(0, 8).map((f, i) => (
                                                            <div key={i} className="font-mono text-[10px] bg-muted/50 px-1.5 py-0.5 rounded truncate">
                                                                {f.translated && f.translated !== f.formula ? (
                                                                    <span>{f.translated}</span>
                                                                ) : (
                                                                    <><span className="text-muted-foreground">{f.cell}:</span> {f.formula}</>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Bottom summary */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t flex-wrap">
                    <span>{analysis.sheets.length} fogli</span>
                    <span>{totalFormulas} formule</span>
                    {totalCharts > 0 && <span>{totalCharts} grafici</span>}
                    {analysis.crossSheetReferences.length > 0 && (
                        <span className="inline-flex items-center">
                            <ArrowRight className="h-3 w-3 mr-0.5" />
                            {analysis.crossSheetReferences.length} rif. cross-sheet
                        </span>
                    )}
                    {analysis.namedRanges.length > 0 && (
                        <span>{analysis.namedRanges.length} named ranges</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
