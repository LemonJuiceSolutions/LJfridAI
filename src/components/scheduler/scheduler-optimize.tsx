'use client';

/**
 * Scheduler optimisation tab.
 *
 * Lists the company's scheduled tasks ranked by avg recent duration, lets
 * the user kick off an AI analysis per task, and shows the result side by
 * side: original SQL, AI-proposed SQL, run timings, row-count parity, and
 * an "Applica" button that's only enabled when the equivalence check
 * passed (same canonical row hash).
 */

import { useEffect, useState } from 'react';
import { Loader2, Wand2, Play, AlertTriangle, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

interface TaskRow {
    id: string;
    name: string;
    type: string;
    treeName: string | null;
    nodePath: string | null;
    avgMs: number | null;
    runs: number;
    lastStatus: string | null;
}

interface NodeReport {
    nodeId: string;
    nodeName: string;
    nodePath: string;
    originalSql: string;
    optimizedSql: string | null;
    rationale: string;
    expectedSpeedup: string;
    risk: string;
    aiNotes: string[];
    originalMs: number | null;
    optimizedMs: number | null;
    originalRows: number | null;
    optimizedRows: number | null;
    equivalent: boolean | null;
    resultDiff: string | null;
}

interface AnalyzeResponse {
    taskId: string;
    taskName: string;
    sqlNodeCount: number;
    avgRecentMs: number | null;
    reports: NodeReport[];
}

function fmtMs(ms: number | null | undefined): string {
    if (ms == null) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}min`;
}

function speedupRatio(orig: number | null, opt: number | null): string {
    if (!orig || !opt || opt === 0) return '-';
    const r = orig / opt;
    if (r >= 1) return `${r.toFixed(1)}x più veloce`;
    return `${(1 / r).toFixed(1)}x più lenta`;
}

function riskColor(risk: string): string {
    if (risk === 'low') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
    if (risk === 'high') return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
}

export function SchedulerOptimize() {
    const [tasks, setTasks] = useState<TaskRow[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [report, setReport] = useState<AnalyzeResponse | null>(null);
    const [applying, setApplying] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingList(true);
            try {
                const res = await fetch('/api/scheduler/optimize/list');
                if (!res.ok) throw new Error(`List failed: ${res.status}`);
                const data = await res.json();
                if (!cancelled) setTasks(data.tasks || []);
            } catch (e: any) {
                if (!cancelled) toast({ title: 'Errore caricamento task', description: e.message, variant: 'destructive' });
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const analyze = async (taskId: string) => {
        setAnalyzing(taskId);
        setReport(null);
        try {
            toast({ title: 'Analisi avviata', description: 'Esecuzione query originale + ottimizzata in corso. Può richiedere qualche minuto.' });
            const res = await fetch(`/api/scheduler/optimize/${taskId}`, {
                method: 'POST',
                signal: AbortSignal.timeout(15 * 60 * 1000),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            const data: AnalyzeResponse = await res.json();
            setReport(data);
            toast({ title: 'Analisi completata', description: `${data.reports.length} nodo/i analizzati.` });
        } catch (e: any) {
            toast({ title: 'Analisi fallita', description: e.message, variant: 'destructive' });
        } finally {
            setAnalyzing(null);
        }
    };

    const apply = async (taskId: string, nodeId: string, optimizedSql: string) => {
        setApplying(nodeId);
        try {
            const res = await fetch(`/api/scheduler/optimize/${taskId}/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodeId, optimizedSql }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            toast({ title: 'Applicato', description: `Query ottimizzata salvata sul nodo ${nodeId}.` });
        } catch (e: any) {
            toast({ title: 'Applica fallito', description: e.message, variant: 'destructive' });
        } finally {
            setApplying(null);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        Ottimizzazione algoritmo
                    </CardTitle>
                    <CardDescription>
                        Per ogni task, l&apos;AI propone una versione ottimizzata della query SQL,
                        esegue ENTRAMBE le versioni sul DB sorgente, confronta i risultati
                        (stesso row-count + stesso hash canonico) e mostra i tempi prima/dopo.
                        Il bottone <strong>Applica</strong> è abilitato solo se i risultati coincidono.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingList ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-sm text-slate-500 py-8 text-center">
                            Nessun task con esecuzioni recenti.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Task</TableHead>
                                    <TableHead>Tree</TableHead>
                                    <TableHead className="text-right">Avg recente</TableHead>
                                    <TableHead className="text-right">Run</TableHead>
                                    <TableHead>Last</TableHead>
                                    <TableHead className="w-32"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {tasks.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell className="font-medium">
                                            {t.name.length > 50 ? t.name.slice(0, 50) + '...' : t.name}
                                            {t.nodePath && (
                                                <div className="text-xs text-slate-400 truncate max-w-md">{t.nodePath}</div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">{t.treeName || '-'}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            <span className={(t.avgMs || 0) > 60_000 ? 'text-rose-600 font-semibold' : ''}>
                                                {fmtMs(t.avgMs)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right text-xs">{t.runs}</TableCell>
                                        <TableCell>
                                            {t.lastStatus === 'success' ? (
                                                <Badge variant="outline" className="text-emerald-600 border-emerald-200">success</Badge>
                                            ) : t.lastStatus ? (
                                                <Badge variant="outline" className="text-rose-600 border-rose-200">{t.lastStatus}</Badge>
                                            ) : (
                                                <span className="text-xs text-slate-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => analyze(t.id)}
                                                disabled={analyzing !== null}
                                            >
                                                {analyzing === t.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                ) : (
                                                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                                                )}
                                                Analizza
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {report && (
                <Card>
                    <CardHeader>
                        <CardTitle>Risultati analisi — {report.taskName}</CardTitle>
                        <CardDescription>
                            {report.sqlNodeCount} nodo/i SQL trovati. Avg task recente: {fmtMs(report.avgRecentMs)}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {report.reports.map((r, i) => (
                            <Card key={i} className="border-slate-200 dark:border-zinc-800">
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        {r.equivalent === true ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                        ) : r.equivalent === false ? (
                                            <XCircle className="w-4 h-4 text-rose-500" />
                                        ) : (
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        )}
                                        {r.nodeName}
                                        <Badge className={riskColor(r.risk)}>risk: {r.risk}</Badge>
                                        {r.expectedSpeedup && (
                                            <Badge variant="outline">stima: {r.expectedSpeedup}</Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription className="text-xs">{r.nodePath}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="text-sm">{r.rationale}</div>

                                    {r.aiNotes.length > 0 && (
                                        <div className="text-xs space-y-1">
                                            {r.aiNotes.map((n, j) => (
                                                <div key={j} className="text-amber-600 dark:text-amber-400">⚠ {n}</div>
                                            ))}
                                        </div>
                                    )}

                                    {r.optimizedSql ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                <div className="bg-slate-50 dark:bg-zinc-900 rounded p-3">
                                                    <div className="font-semibold mb-1">Originale</div>
                                                    <div className="tabular-nums">⏱ {fmtMs(r.originalMs)} · {r.originalRows ?? '-'} righe</div>
                                                </div>
                                                <div className="bg-emerald-50 dark:bg-emerald-950 rounded p-3">
                                                    <div className="font-semibold mb-1">Ottimizzata</div>
                                                    <div className="tabular-nums">⏱ {fmtMs(r.optimizedMs)} · {r.optimizedRows ?? '-'} righe</div>
                                                    <div className="font-semibold mt-1 text-emerald-700 dark:text-emerald-300">
                                                        {speedupRatio(r.originalMs, r.optimizedMs)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                <pre className="bg-slate-50 dark:bg-zinc-900 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">{r.originalSql}</pre>
                                                <pre className="bg-emerald-50 dark:bg-emerald-950 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">{r.optimizedSql}</pre>
                                            </div>

                                            {r.resultDiff && (
                                                <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950 rounded p-2">
                                                    {r.resultDiff}
                                                </div>
                                            )}

                                            <div className="flex justify-end">
                                                <Button
                                                    size="sm"
                                                    onClick={() => apply(report.taskId, r.nodeId, r.optimizedSql!)}
                                                    disabled={r.equivalent !== true || applying === r.nodeId}
                                                >
                                                    {applying === r.nodeId ? (
                                                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                                    ) : (
                                                        <Play className="w-3.5 h-3.5 mr-1.5" />
                                                    )}
                                                    Applica al tree
                                                </Button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-xs text-slate-500 italic">Nessuna ottimizzazione proposta.</div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
