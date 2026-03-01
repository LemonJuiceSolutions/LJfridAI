'use client';

import { useMemo, useState, useEffect, useCallback, useRef, memo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    Handle,
    Position,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    type Node,
    type Edge,
    type NodeProps,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DatabaseMap, TableInfo } from '@/lib/database-map-types';
import { chatDatabaseMapAction, saveNodePositionsAction } from '../actions/database-map';
import {
    Key, ArrowRight, Search, X, Maximize2, MessageCircle, Send, Loader2, Bot, User, Filter, LayoutGrid,
} from 'lucide-react';

// ─── Cluster colors ─────────────────────────────────────────────────────────
const CLUSTER_PALETTE = [
    { stroke: '#7c3aed', header: '#6d28d9', mini: '#7c3aed' },
    { stroke: '#0891b2', header: '#0e7490', mini: '#0891b2' },
    { stroke: '#059669', header: '#047857', mini: '#059669' },
    { stroke: '#d97706', header: '#b45309', mini: '#d97706' },
    { stroke: '#dc2626', header: '#b91c1c', mini: '#dc2626' },
    { stroke: '#2563eb', header: '#1d4ed8', mini: '#2563eb' },
    { stroke: '#e11d48', header: '#be123c', mini: '#e11d48' },
    { stroke: '#7c3aed', header: '#6d28d9', mini: '#7c3aed' },
    { stroke: '#0d9488', header: '#0f766e', mini: '#0d9488' },
    { stroke: '#ea580c', header: '#c2410c', mini: '#ea580c' },
];

// ─── Table Node ─────────────────────────────────────────────────────────────
const TableNode = memo(({ data }: NodeProps) => {
    const table = data.table as TableInfo;
    const dimmed = data.dimmed as boolean;
    const highlighted = data.highlighted as boolean;
    const clusterColor = (data.clusterColor as string) || '#64748b';
    const expanded = data.expanded as boolean;
    const effectiveDesc = table.userDescription || table.description;

    const importantCols = table.columns.filter(c => c.isPrimaryKey || c.isForeignKey);
    const otherCols = table.columns.filter(c => !c.isPrimaryKey && !c.isForeignKey);
    const maxOther = expanded ? Math.max(0, 20 - importantCols.length) : Math.max(0, 10 - importantCols.length);
    const shownOther = otherCols.slice(0, maxOther);
    const hiddenCount = expanded ? 0 : table.columns.length - importantCols.length - shownOther.length;

    const renderCol = (col: typeof table.columns[0], important: boolean) => {
        const colDesc = col.userDescription || col.description;
        return (
            <div key={col.name}>
                <div className={`relative flex items-center gap-1.5 px-2.5 py-1 text-[10px] ${important ? 'bg-muted/40' : ''}`}>
                    <Handle type="source" position={Position.Right} id={`${table.fullName}.${col.name}-source`}
                        className={important ? '!w-2 !h-2 !bg-blue-500 !border-blue-600' : '!w-0 !h-0 !bg-transparent !border-transparent'}
                        style={{ top: 'auto' }} />
                    <Handle type="target" position={Position.Left} id={`${table.fullName}.${col.name}-target`}
                        className={important ? '!w-2 !h-2 !bg-green-500 !border-green-600' : '!w-0 !h-0 !bg-transparent !border-transparent'}
                        style={{ top: 'auto' }} />
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                        {col.isPrimaryKey && <Key className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                        {col.isForeignKey && !col.isPrimaryKey && <ArrowRight className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
                        <span className={`font-mono truncate ${important ? 'font-semibold' : 'text-muted-foreground'}`}>{col.name}</span>
                    </div>
                    <span className="text-muted-foreground/70 shrink-0 text-[9px]">{col.dataType}</span>
                    {col.isForeignKey && col.foreignKeyTarget && (
                        <span className="text-blue-500/70 shrink-0 text-[8px] font-mono">→{col.foreignKeyTarget.table}</span>
                    )}
                </div>
                {expanded && colDesc && (
                    <div className="px-2.5 pb-1 text-[9px] text-muted-foreground/70 leading-tight ml-5 line-clamp-2">
                        {colDesc}
                    </div>
                )}
            </div>
        );
    };

    const nodeWidth = expanded ? 380 : 300;

    return (
        <div className={`bg-card border-2 rounded-lg shadow-lg overflow-hidden transition-all duration-200 ${highlighted ? 'border-violet-500 ring-2 ring-violet-400/50' : dimmed ? 'border-border/40 opacity-20' : 'border-border'}`}
            style={{ width: nodeWidth }}>
            <div style={{ backgroundColor: clusterColor }} className="px-3 py-2 text-white">
                <div className="font-bold text-[11px] truncate">{table.name}</div>
                <div className="flex items-center gap-2 text-[9px] text-white/60 mt-0.5">
                    <span>{table.schema}</span><span>&bull;</span>
                    <span>{table.rowCount.toLocaleString('it-IT')} righe</span><span>&bull;</span>
                    <span>{table.columns.length} col</span>
                </div>
                {effectiveDesc && (
                    <div className={`mt-1.5 bg-white/15 rounded px-1.5 py-1 text-white/90 leading-snug ${expanded ? 'text-[11px]' : 'text-[10px] line-clamp-2'}`}>
                        {effectiveDesc}
                    </div>
                )}
            </div>
            <div className="divide-y divide-border/30">
                {importantCols.map(col => renderCol(col, true))}
                {importantCols.length > 0 && shownOther.length > 0 && <div className="h-px bg-border/60" />}
                {shownOther.map(col => renderCol(col, false))}
                {hiddenCount > 0 && (
                    <div className="px-2.5 py-1 text-[9px] text-muted-foreground/50 text-center bg-muted/20">+{hiddenCount} altre colonne</div>
                )}
            </div>
            <Handle type="source" position={Position.Right} id={`${table.fullName}-out`} className="!w-0 !h-0 !bg-transparent !border-transparent" />
            <Handle type="target" position={Position.Left} id={`${table.fullName}-in`} className="!w-0 !h-0 !bg-transparent !border-transparent" />
        </div>
    );
});
TableNode.displayName = 'TableNode';

const nodeTypes = { tableNode: TableNode };

// ─── Find connected components ──────────────────────────────────────────────
function findClusters(map: DatabaseMap): Map<string, number> {
    const adj = new Map<string, Set<string>>();
    for (const t of map.tables) adj.set(t.fullName, new Set());
    for (const rel of map.relationships) {
        const s = `${rel.sourceSchema}.${rel.sourceTable}`;
        const t = `${rel.targetSchema}.${rel.targetTable}`;
        adj.get(s)?.add(t);
        adj.get(t)?.add(s);
    }
    const clusterOf = new Map<string, number>();
    let clusterId = 0;
    const visited = new Set<string>();
    const sorted = [...map.tables].sort((a, b) => (adj.get(b.fullName)?.size || 0) - (adj.get(a.fullName)?.size || 0));
    for (const t of sorted) {
        if (visited.has(t.fullName)) continue;
        const queue = [t.fullName];
        visited.add(t.fullName);
        while (queue.length > 0) {
            const curr = queue.shift()!;
            clusterOf.set(curr, clusterId);
            for (const n of adj.get(curr) || []) {
                if (!visited.has(n)) { visited.add(n); queue.push(n); }
            }
        }
        clusterId++;
    }
    return clusterOf;
}

// ─── Estimate actual rendered height of a table node ─────────────────────────
function estimateNodeHeight(table: TableInfo, expanded = false): number {
    const HEADER = 52;
    const DESC = (table.userDescription || table.description) ? (expanded ? 60 : 32) : 0;
    const importantCount = table.columns.filter(c => c.isPrimaryKey || c.isForeignKey).length;
    const otherCount = table.columns.length - importantCount;
    const maxOther = expanded ? Math.max(0, 20 - importantCount) : Math.max(0, 10 - importantCount);
    const shownCols = importantCount + Math.min(otherCount, maxOther);
    let colH = shownCols * 24;
    if (expanded) {
        // columns with descriptions add extra height for the desc line
        const allShown = table.columns.filter(c => c.isPrimaryKey || c.isForeignKey)
            .concat(table.columns.filter(c => !c.isPrimaryKey && !c.isForeignKey).slice(0, maxOther));
        const withDesc = allShown.filter(c => c.userDescription || c.description).length;
        colH += withDesc * 16;
    }
    const hiddenH = expanded ? 0 : (table.columns.length - shownCols > 0 ? 22 : 0);
    const sepH = (!expanded && importantCount > 0 && Math.min(otherCount, maxOther) > 0) ? 1 : 0;
    return HEADER + DESC + colH + hiddenH + sepH + 8;
}

// ─── BFS ordering: place connected tables adjacently in the grid ────────────
function bfsOrderTables(tables: TableInfo[], adj: Map<string, Set<string>>): TableInfo[] {
    const tableSet = new Set(tables.map(t => t.fullName));
    const visited = new Set<string>();
    const ordered: TableInfo[] = [];
    const tableMap = new Map(tables.map(t => [t.fullName, t]));

    // Start from the most-connected table
    const sorted = [...tables].sort((a, b) =>
        (adj.get(b.fullName)?.size || 0) - (adj.get(a.fullName)?.size || 0)
    );

    for (const start of sorted) {
        if (visited.has(start.fullName)) continue;
        const queue = [start.fullName];
        visited.add(start.fullName);
        while (queue.length > 0) {
            const curr = queue.shift()!;
            ordered.push(tableMap.get(curr)!);
            // Neighbors sorted by connection count so hubs stay close
            const neighbors = [...(adj.get(curr) || [])]
                .filter(n => !visited.has(n) && tableSet.has(n))
                .sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0));
            for (const n of neighbors) {
                visited.add(n);
                queue.push(n);
            }
        }
    }
    return ordered;
}

// ─── Layout: clusters in 2D zones, grid within each cluster ─────────────────
function computeLayout(map: DatabaseMap, filteredIds: Set<string> | null, expanded = false) {
    const clusterOf = findClusters(map);

    // Group by cluster
    const clusters = new Map<number, TableInfo[]>();
    for (const t of map.tables) {
        const cId = clusterOf.get(t.fullName) ?? 0;
        if (!clusters.has(cId)) clusters.set(cId, []);
        clusters.get(cId)!.push(t);
    }

    // Visible filter
    let visibleTables: Set<string>;
    if (filteredIds && filteredIds.size > 0) {
        visibleTables = filteredIds;
    } else {
        visibleTables = new Set(map.tables.map(t => t.fullName));
    }

    // Adjacency for visible tables
    const adj = new Map<string, Set<string>>();
    for (const t of map.tables) if (visibleTables.has(t.fullName)) adj.set(t.fullName, new Set());
    for (const rel of map.relationships) {
        const s = `${rel.sourceSchema}.${rel.sourceTable}`;
        const t = `${rel.targetSchema}.${rel.targetTable}`;
        if (adj.has(s) && adj.has(t)) { adj.get(s)!.add(t); adj.get(t)!.add(s); }
    }

    const NODE_W = expanded ? 420 : 340;
    const GAP_X = 60;
    const GAP_Y = 40;
    const ZONE_GAP = 150;          // Gap between connected cluster zones
    const ORPHAN_GAP_X = 30;       // Tight packing for orphan tables
    const ORPHAN_GAP_Y = 20;

    const nodes: Node[] = [];

    // Pre-compute all node heights
    const nodeHeightCache = new Map<string, number>();
    for (const t of map.tables) nodeHeightCache.set(t.fullName, estimateNodeHeight(t, expanded));

    // ── Separate connected clusters (size>1) from orphans (size=1) ──
    const connectedClusters: [number, TableInfo[]][] = [];
    const orphanTables: TableInfo[] = [];

    for (const [cId, tables] of clusters) {
        const visible = tables.filter(t => visibleTables.has(t.fullName));
        if (visible.length === 0) continue;
        if (visible.length === 1 && (adj.get(visible[0].fullName)?.size || 0) === 0) {
            orphanTables.push(visible[0]);
        } else {
            connectedClusters.push([cId, visible]);
        }
    }

    // Sort connected clusters: largest first
    connectedClusters.sort((a, b) => b[1].length - a[1].length);

    // ── Build cluster boxes with BFS ordering ──
    const clusterBoxes: { cId: number; tables: TableInfo[]; w: number; h: number; rowHeights: number[]; cols: number; color: typeof CLUSTER_PALETTE[0] }[] = [];

    for (const [cId, visible] of connectedClusters) {
        // BFS order keeps connected tables adjacent in the grid
        const ordered = bfsOrderTables(visible, adj);
        const cols = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));

        const rowHeights: number[] = [];
        for (let i = 0; i < ordered.length; i++) {
            const r = Math.floor(i / cols);
            const h = nodeHeightCache.get(ordered[i].fullName) || 200;
            rowHeights[r] = Math.max(rowHeights[r] || 0, h);
        }

        const w = cols * (NODE_W + GAP_X) - GAP_X;
        const h = rowHeights.reduce((sum, rh) => sum + rh + GAP_Y, 0) - GAP_Y;

        clusterBoxes.push({ cId, tables: ordered, w, h, rowHeights, cols, color: CLUSTER_PALETTE[cId % CLUSTER_PALETTE.length] });
    }

    // ── Place cluster zones in a 2D meta-grid ──
    const metaCols = Math.max(1, Math.ceil(Math.sqrt(clusterBoxes.length)));

    const metaRowHeights: number[] = [];
    const metaColWidths: number[] = [];
    for (let i = 0; i < clusterBoxes.length; i++) {
        const mc = i % metaCols;
        const mr = Math.floor(i / metaCols);
        metaColWidths[mc] = Math.max(metaColWidths[mc] || 0, clusterBoxes[i].w);
        metaRowHeights[mr] = Math.max(metaRowHeights[mr] || 0, clusterBoxes[i].h);
    }

    const zoneOrigins: { x: number; y: number }[] = [];
    for (let i = 0; i < clusterBoxes.length; i++) {
        const mc = i % metaCols;
        const mr = Math.floor(i / metaCols);
        let ox = 0;
        for (let c = 0; c < mc; c++) ox += (metaColWidths[c] || 0) + ZONE_GAP;
        let oy = 0;
        for (let r = 0; r < mr; r++) oy += (metaRowHeights[r] || 0) + ZONE_GAP;
        zoneOrigins.push({ x: ox, y: oy });
    }

    // ── Place tables within each cluster zone ──
    for (let ci = 0; ci < clusterBoxes.length; ci++) {
        const { tables: clusterTables, rowHeights, cols, color } = clusterBoxes[ci];
        const origin = zoneOrigins[ci];

        const rowY: number[] = [0];
        for (let r = 1; r < rowHeights.length; r++) {
            rowY[r] = rowY[r - 1] + rowHeights[r - 1] + GAP_Y;
        }

        for (let i = 0; i < clusterTables.length; i++) {
            const t = clusterTables[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const isHighlighted = filteredIds ? filteredIds.has(t.fullName) : false;

            nodes.push({
                id: t.fullName,
                type: 'tableNode',
                position: {
                    x: origin.x + col * (NODE_W + GAP_X),
                    y: origin.y + (rowY[row] || 0),
                },
                data: {
                    table: t,
                    dimmed: false,
                    highlighted: isHighlighted,
                    clusterColor: color.header,
                    expanded,
                },
            });
        }
    }

    // ── Place orphan tables in a compact zone below connected clusters ──
    if (orphanTables.length > 0) {
        // Find the bottom of all cluster zones
        let maxClusterBottom = 0;
        for (let i = 0; i < clusterBoxes.length; i++) {
            const bottom = zoneOrigins[i].y + clusterBoxes[i].h;
            maxClusterBottom = Math.max(maxClusterBottom, bottom);
        }

        const orphanStartY = clusterBoxes.length > 0 ? maxClusterBottom + ZONE_GAP : 0;

        // Wider grid for orphans since they're unrelated – pack more columns
        const orphanCols = Math.max(1, Math.ceil(Math.sqrt(orphanTables.length * 2)));

        // Sort alphabetically so they're easy to find
        orphanTables.sort((a, b) => a.name.localeCompare(b.name));

        const orphanRowHeights: number[] = [];
        for (let i = 0; i < orphanTables.length; i++) {
            const r = Math.floor(i / orphanCols);
            const h = nodeHeightCache.get(orphanTables[i].fullName) || 150;
            orphanRowHeights[r] = Math.max(orphanRowHeights[r] || 0, h);
        }

        const orphanRowY: number[] = [0];
        for (let r = 1; r < orphanRowHeights.length; r++) {
            orphanRowY[r] = orphanRowY[r - 1] + orphanRowHeights[r - 1] + ORPHAN_GAP_Y;
        }

        const orphanColor = CLUSTER_PALETTE[clusterBoxes.length % CLUSTER_PALETTE.length];

        for (let i = 0; i < orphanTables.length; i++) {
            const t = orphanTables[i];
            const col = i % orphanCols;
            const row = Math.floor(i / orphanCols);
            const isHighlighted = filteredIds ? filteredIds.has(t.fullName) : false;

            nodes.push({
                id: t.fullName,
                type: 'tableNode',
                position: {
                    x: col * (NODE_W + ORPHAN_GAP_X),
                    y: orphanStartY + (orphanRowY[row] || 0),
                },
                data: {
                    table: t,
                    dimmed: false,
                    highlighted: isHighlighted,
                    clusterColor: orphanColor.header,
                    expanded,
                },
            });
        }
    }

    // Edges - adapt complexity to graph size for performance
    const visSet = new Set(nodes.map(n => n.id));
    const visibleRels = map.relationships.filter(rel => {
        const s = `${rel.sourceSchema}.${rel.sourceTable}`;
        const t = `${rel.targetSchema}.${rel.targetTable}`;
        return visSet.has(s) && visSet.has(t);
    });

    const edgeCount = visibleRels.length;
    const useSimpleEdges = edgeCount > 80;
    const showLabels = edgeCount <= 150;

    const edges: Edge[] = visibleRels.map((rel, idx) => {
        const sf = `${rel.sourceSchema}.${rel.sourceTable}`;
        const tf = `${rel.targetSchema}.${rel.targetTable}`;
        const cId = clusterOf.get(sf) ?? 0;
        const clusterColor = CLUSTER_PALETTE[cId % CLUSTER_PALETTE.length].stroke;
        const confidence = rel.confidence;
        const method = rel.inferenceMethod;

        // Opacity: high confidence = opaque, low = semi-transparent
        const opacity = confidence !== undefined ? Math.max(0.3, confidence / 100) : 1;

        // Stroke width based on confidence
        const strokeWidth = confidence !== undefined
            ? (confidence >= 80 ? 2.5 : confidence >= 50 ? 1.5 : 1)
            : 2;

        // Distinct visual for data_analysis: dot-dash pattern + teal color
        let strokeDasharray: string | undefined;
        let edgeColor = clusterColor;
        if (method === 'data_analysis') {
            strokeDasharray = '2 4 8 4'; // dot-dash: clearly different
            edgeColor = '#0d9488';        // teal-600
        } else if (rel.inferred) {
            strokeDasharray = '6 3';
        }

        const edge: Edge = {
            id: `edge-${idx}`,
            source: sf,
            target: tf,
            sourceHandle: `${sf}.${rel.sourceColumn}-source`,
            targetHandle: `${tf}.${rel.targetColumn}-target`,
            type: useSimpleEdges ? 'default' : 'smoothstep',
            style: {
                stroke: edgeColor,
                strokeWidth,
                strokeDasharray,
                opacity,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 14, height: 14 },
        };

        if (showLabels) {
            const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '..' : s;
            const srcCol = truncate(rel.sourceColumn, 12);
            const tgtCol = truncate(rel.targetColumn, 12);
            const confLabel = confidence !== undefined ? ` ${confidence}%` : '';
            // Short method abbreviation (single letter) only for non-formal
            let methodSuffix = '';
            if (method && method !== 'formal_fk') {
                const abbrev: Record<string, string> = { 'data_analysis': 'D', 'name_pattern': 'N', 'prefix_suffix': 'P', 'view_sp': 'V', 'ai_schema': 'A' };
                methodSuffix = abbrev[method] ? ` ${abbrev[method]}` : '';
            }
            edge.label = `${srcCol}→${tgtCol}${confLabel}${methodSuffix}`;
            edge.labelStyle = { fontSize: 9, fill: edgeColor, fontWeight: rel.inferred ? 400 : 600, fontStyle: rel.inferred ? 'italic' : 'normal' };
            edge.labelBgStyle = { fill: 'var(--card)', fillOpacity: 0.9 } as any;
            edge.labelBgPadding = [4, 2] as [number, number];
        }

        return edge;
    });

    return { nodes, edges };
}

// ─── Extract table names mentioned in AI response ───────────────────────────
function extractMentionedTables(text: string, map: DatabaseMap): string[] {
    const found = new Set<string>();
    for (const t of map.tables) {
        if (text.includes(t.fullName) || text.includes(t.name)) {
            found.add(t.fullName);
        }
    }
    return Array.from(found);
}

// ─── Chat Panel ─────────────────────────────────────────────────────────────
function ChatPanel({ connectorId, map, open, onToggle, onIsolate }: {
    connectorId: string;
    map: DatabaseMap;
    open: boolean;
    onToggle: () => void;
    onIsolate: (tableNames: string[]) => void;
}) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        const q = input.trim();
        setInput('');
        const newMessages = [...messages, { role: 'user' as const, content: q }];
        setMessages(newMessages);
        setLoading(true);
        const res = await chatDatabaseMapAction(connectorId, q, messages);
        setMessages(prev => [...prev, { role: 'assistant', content: res.answer || res.error || 'Errore' }]);
        setLoading(false);
    };

    if (!open) return null;

    return (
        <div className="absolute right-3 top-3 w-[380px] bg-card border rounded-xl shadow-2xl flex flex-col z-50" style={{ height: 'calc(100% - 24px)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 shrink-0">
                <Bot className="h-4 w-4 text-violet-500" />
                <span className="text-xs font-semibold flex-1">Chiedi al Database</span>
                <button onClick={onToggle} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && (
                    <div className="text-center text-muted-foreground/50 text-xs py-8 space-y-2">
                        <Bot className="h-8 w-8 mx-auto opacity-30" />
                        <p>Chiedimi qualsiasi cosa sul database.</p>
                        <div className="space-y-1 text-[10px]">
                            <p className="italic">&quot;Quali tabelle contengono dati sui clienti?&quot;</p>
                            <p className="italic">&quot;Isolami le tabelle del libro giornale&quot;</p>
                            <p className="italic">&quot;Scrivi una query per contare gli ordini per mese&quot;</p>
                        </div>
                    </div>
                )}
                {messages.map((msg, i) => {
                    const mentionedTables = msg.role === 'assistant' ? extractMentionedTables(msg.content, map) : [];
                    return (
                        <div key={i}>
                            <div className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'assistant' && <Bot className="h-4 w-4 text-violet-500 shrink-0 mt-1" />}
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-violet-600 text-white' : 'bg-muted'}`}>
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                </div>
                                {msg.role === 'user' && <User className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
                            </div>
                            {mentionedTables.length > 0 && (
                                <div className="ml-6 mt-1.5">
                                    <button
                                        onClick={() => onIsolate(mentionedTables)}
                                        className="flex items-center gap-1.5 text-[10px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-md px-2.5 py-1 transition-colors"
                                    >
                                        <Filter className="h-3 w-3" />
                                        Isola nel diagramma ({mentionedTables.length} tabelle)
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {loading && (
                    <div className="flex gap-2">
                        <Bot className="h-4 w-4 text-violet-500 shrink-0 mt-1" />
                        <div className="bg-muted rounded-lg px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-violet-500" /></div>
                    </div>
                )}
            </div>
            <div className="border-t p-3 shrink-0">
                <div className="flex items-center gap-2">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Chiedi qualcosa..."
                        className="flex-1 text-xs bg-muted/50 border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-400"
                        disabled={loading}
                    />
                    <button onClick={handleSend} disabled={loading || !input.trim()} className="bg-violet-600 text-white rounded-lg p-2 hover:bg-violet-700 disabled:opacity-50 transition-colors">
                        <Send className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Inner Diagram ──────────────────────────────────────────────────────────
function DiagramInner({ map, connectorId }: { map: DatabaseMap; connectorId: string }) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [chatOpen, setChatOpen] = useState(false);
    const [chatIsolateIds, setChatIsolateIds] = useState<Set<string> | null>(null);
    const [isLayoutReady, setIsLayoutReady] = useState(false);
    const reactFlowInstance = useReactFlow();
    const isFirstRender = useRef(true);
    const positionsRef = useRef<Record<string, { x: number; y: number }>>(map.nodePositions || {});
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const filteredIds = useMemo(() => {
        if (!debouncedSearch) return null;
        const q = debouncedSearch.toLowerCase();
        const matching = new Set<string>();
        for (const t of map.tables) {
            const desc = (t.userDescription || t.description || '').toLowerCase();
            if (
                t.name.toLowerCase().includes(q) ||
                t.fullName.toLowerCase().includes(q) ||
                desc.includes(q) ||
                t.columns.some(c =>
                    c.name.toLowerCase().includes(q) ||
                    (c.userDescription || c.description || '').toLowerCase().includes(q)
                )
            ) matching.add(t.fullName);
        }
        const withNeighbors = new Set(matching);
        for (const rel of map.relationships) {
            const s = `${rel.sourceSchema}.${rel.sourceTable}`;
            const t = `${rel.targetSchema}.${rel.targetTable}`;
            if (matching.has(s)) withNeighbors.add(t);
            if (matching.has(t)) withNeighbors.add(s);
        }
        return withNeighbors;
    }, [debouncedSearch, map]);

    // Chat isolation takes priority over search filter
    const effectiveFilterIds = useMemo(() => {
        if (chatIsolateIds && chatIsolateIds.size > 0) return chatIsolateIds;
        return filteredIds;
    }, [chatIsolateIds, filteredIds]);

    const handleIsolate = useCallback((tableNames: string[]) => {
        // Include the specified tables plus their FK neighbors
        const ids = new Set(tableNames);
        for (const rel of map.relationships) {
            const s = `${rel.sourceSchema}.${rel.sourceTable}`;
            const t = `${rel.targetSchema}.${rel.targetTable}`;
            if (ids.has(s)) ids.add(t);
            if (ids.has(t)) ids.add(s);
        }
        setChatIsolateIds(ids);
    }, [map]);

    // Expanded mode: when filtering ≤ 30 tables, show full descriptions
    const isExpanded = !!(effectiveFilterIds && effectiveFilterIds.size > 0 && effectiveFilterIds.size <= 30);

    const { nodes: computedNodes, edges: layoutEdges } = useMemo(
        () => computeLayout(map, effectiveFilterIds, isExpanded),
        [map, effectiveFilterIds, isExpanded]
    );

    // Count relationships by method for legend
    const relCounts = useMemo(() => {
        const counts = { formal: 0, inferred: 0, data: 0 };
        for (const rel of map.relationships) {
            if (rel.inferenceMethod === 'data_analysis') counts.data++;
            else if (rel.inferred) counts.inferred++;
            else counts.formal++;
        }
        return counts;
    }, [map]);

    // Apply saved positions for full view (no filter active)
    const layoutNodes = useMemo(() => {
        if (effectiveFilterIds || !map.nodePositions) return computedNodes;
        return computedNodes.map(n => ({
            ...n,
            position: map.nodePositions![n.id] || n.position,
        }));
    }, [computedNodes, effectiveFilterIds, map.nodePositions]);

    const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

    useEffect(() => {
        setNodes(layoutNodes);
        setEdges(layoutEdges);

        // Update positionsRef with computed positions for nodes that don't have saved ones
        for (const n of layoutNodes) {
            if (!positionsRef.current[n.id]) {
                positionsRef.current[n.id] = n.position;
            }
        }

        if (isFirstRender.current) {
            // First render: instant fitView, no animation, then reveal
            isFirstRender.current = false;
            requestAnimationFrame(() => {
                reactFlowInstance.fitView({ padding: 0.12, maxZoom: 0.85, duration: 0 });
                requestAnimationFrame(() => setIsLayoutReady(true));
            });
        } else {
            // Subsequent changes: smooth animation
            setTimeout(() => {
                reactFlowInstance.fitView({ padding: 0.12, maxZoom: 0.85, duration: 300 });
            }, 50);
        }
    }, [layoutNodes, layoutEdges, setNodes, setEdges, reactFlowInstance]);

    // Save positions on node drag (debounced 3s)
    const handleNodeDragStop = useCallback((_: any, node: Node) => {
        positionsRef.current[node.id] = node.position;

        // Only save positions in full view (no filter)
        if (effectiveFilterIds) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveNodePositionsAction(connectorId, { ...positionsRef.current });
        }, 3000);
    }, [connectorId, effectiveFilterIds]);

    const handleFitView = useCallback(() => {
        reactFlowInstance.fitView({ padding: 0.12, maxZoom: 0.85, duration: 300 });
    }, [reactFlowInstance]);

    const handleResetLayout = useCallback(() => {
        // Clear saved positions and recompute layout from scratch
        positionsRef.current = {};
        const fresh = computeLayout(map, effectiveFilterIds, isExpanded);
        setNodes(fresh.nodes);
        setEdges(fresh.edges);
        // Save empty positions (clears the saved ones)
        saveNodePositionsAction(connectorId, {});
        setTimeout(() => {
            reactFlowInstance.fitView({ padding: 0.12, maxZoom: 0.85, duration: 300 });
        }, 50);
    }, [map, effectiveFilterIds, isExpanded, setNodes, setEdges, connectorId, reactFlowInstance]);

    const matchCount = effectiveFilterIds ? effectiveFilterIds.size : map.tables.length;

    return (
        <>
            {/* Loading overlay until first layout is ready */}
            {!isLayoutReady && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-card/95">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                        <span className="text-sm text-muted-foreground">Caricamento diagramma...</span>
                    </div>
                </div>
            )}

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStop={handleNodeDragStop}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.12, maxZoom: 0.85 }}
                minZoom={0.02}
                maxZoom={2.5}
                defaultEdgeOptions={{ type: 'smoothstep' }}
                proOptions={{ hideAttribution: true }}
            >
                <Background gap={24} size={1} color="var(--muted-foreground)" style={{ opacity: 0.06 }} />
                <Controls showInteractive={false} className="!bg-card !border-border !shadow-md" />
                <MiniMap
                    nodeColor={(node) => (node.data?.clusterColor as string) || '#64748b'}
                    nodeStrokeColor="#475569"
                    maskColor="rgba(0,0,0,0.06)"
                    className="!bg-card !border-border"
                    pannable zoomable
                />

                {/* Search */}
                <Panel position="top-left" className="!m-3">
                    <div className="flex items-center gap-2 bg-card border rounded-lg shadow-lg px-3 py-2 min-w-[340px]">
                        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filtra tabelle per nome, colonna, descrizione..."
                            className="border-0 bg-transparent text-xs focus:outline-none w-full placeholder:text-muted-foreground/50"
                        />
                        {search ? (
                            <>
                                <span className="text-[10px] text-muted-foreground shrink-0">{matchCount}</span>
                                <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
                            </>
                        ) : (
                            <span className="text-[10px] text-muted-foreground shrink-0">{map.tables.length} tabelle</span>
                        )}
                    </div>
                </Panel>

                {/* Isolation indicator */}
                {chatIsolateIds && (
                    <Panel position="top-center" className="!m-3">
                        <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-1.5 shadow-lg">
                            <Filter className="h-3.5 w-3.5 text-violet-500" />
                            <span className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                                {chatIsolateIds.size} tabelle isolate
                            </span>
                            <button
                                onClick={() => setChatIsolateIds(null)}
                                className="text-violet-500 hover:text-violet-700 dark:hover:text-violet-300 ml-1"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </Panel>
                )}

                {/* Top-right buttons */}
                <Panel position="top-right" className="!m-3 flex gap-2">
                    <button
                        onClick={() => setChatOpen(prev => !prev)}
                        className={`border rounded-lg shadow-lg p-2 transition-colors ${chatOpen ? 'bg-violet-600 text-white border-violet-600' : 'bg-card hover:bg-muted'}`}
                        title="Chiedi al Database"
                    >
                        <MessageCircle className="h-4 w-4" />
                    </button>
                    <button onClick={handleResetLayout} className="bg-card border rounded-lg shadow-lg p-2 hover:bg-muted transition-colors" title="Ricalcola layout">
                        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button onClick={handleFitView} className="bg-card border rounded-lg shadow-lg p-2 hover:bg-muted transition-colors" title="Adatta alla vista">
                        <Maximize2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                </Panel>

                {/* Legend */}
                <Panel position="bottom-left" className="!m-3 !mb-12">
                    <div className="bg-card/90 backdrop-blur border rounded-lg shadow-lg px-3 py-2 text-[9px] text-muted-foreground space-y-1">
                        <div className="flex items-center gap-1.5"><Key className="h-2.5 w-2.5 text-amber-500" /> Primary Key</div>
                        <div className="flex items-center gap-1.5">
                            <svg width="16" height="3"><line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#7c3aed" strokeWidth="2.5" /></svg>
                            FK formale ({relCounts.formal})
                        </div>
                        <div className="flex items-center gap-1.5">
                            <svg width="16" height="3"><line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="6 3" /></svg>
                            FK inferita ({relCounts.inferred})
                        </div>
                        <div className="flex items-center gap-1.5">
                            <svg width="16" height="3"><line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#0d9488" strokeWidth="1.5" strokeDasharray="2 4 8 4" /></svg>
                            FK da dati ({relCounts.data})
                        </div>
                        <div className="flex items-center gap-1.5">
                            <svg width="16" height="8">
                                <line x1="0" y1="2" x2="16" y2="2" stroke="#7c3aed" strokeWidth="2.5" opacity="1" />
                                <line x1="0" y1="6" x2="16" y2="6" stroke="#7c3aed" strokeWidth="1" opacity="0.3" />
                            </svg>
                            Spessore/opacita' = confidence
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="flex gap-0.5">
                                {CLUSTER_PALETTE.slice(0, 4).map((c, i) => (
                                    <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.header }} />
                                ))}
                            </div>
                            <span>Colore = gruppo di tabelle correlate</span>
                        </div>
                    </div>
                </Panel>
            </ReactFlow>

            <ChatPanel connectorId={connectorId} map={map} open={chatOpen} onToggle={() => setChatOpen(false)} onIsolate={handleIsolate} />
        </>
    );
}

// ─── Main export ────────────────────────────────────────────────────────────
export function DatabaseERDiagram({ map, connectorId }: { map: DatabaseMap; connectorId: string }) {
    if (map.tables.length === 0) {
        return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Nessun dato disponibile</div>;
    }
    return (
        <div className="w-full h-full relative overflow-hidden" style={{ minHeight: 500 }}>
            <ReactFlowProvider>
                <DiagramInner map={map} connectorId={connectorId} />
            </ReactFlowProvider>
        </div>
    );
}
