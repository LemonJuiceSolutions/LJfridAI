/**
 * Scheduler Page
 * 
 * Main page for managing scheduled tasks
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle, List, FileText, CalendarClock, ExternalLink, ChevronRight, Search, Loader2, Timer, PlayCircle, StopCircle } from 'lucide-react';
import Link from 'next/link';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TaskForm } from '@/components/scheduler/task-form';
import { TaskExecutions } from '@/components/scheduler/task-executions';
import { SchedulerExecutionLog } from '@/components/scheduler/scheduler-execution-log';
import { SchedulerUpcoming } from '@/components/scheduler/scheduler-upcoming';
import { MissedTasksPanel } from '@/components/scheduler/missed-tasks-panel';
import { SchedulerOptimize } from '@/components/scheduler/scheduler-optimize';
import { Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ScheduledTask {
  id: string;
  name: string;
  description: string | null;
  type: string;
  config: any;
  scheduleType: string;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
  treeName: string | null;
}

function parseNodePath(nodePath: string): string[] {
  // Format: root.options['B2B'].options['Query'].options['Mail']
  // or: root.options['Commesse'].options['Join'][0]
  // or: root->A->B->C (legacy)
  if (nodePath.includes('.options[')) {
    const matches = nodePath.match(/\['([^']+)'\]/g);
    if (matches && matches.length > 0) {
      return matches.map(m => m.replace(/\['|'\]/g, ''));
    }
  }
  if (nodePath.includes('->')) {
    return nodePath.split('->').filter(p => p !== 'root');
  }
  return [];
}

function getTaskNodeName(task: { name: string; config?: any; treeName?: string | null }): string {
  const config = task.config as any;
  if (!config) return task.name;
  // Prefer user-defined result name over parent option key.
  if (config.sqlResultName) return config.sqlResultName;
  if (config.pythonResultName) return config.pythonResultName;
  if (config.subject) return config.subject;
  if (config.nodePath) {
    const parts = parseNodePath(config.nodePath);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  // Handle implicit nodes: Node-xxx-yyy (Implicit) or Node-xxx-yyy (TYPE)
  if (task.name.startsWith('Node-') && task.treeName) {
    return task.treeName;
  }
  return task.name;
}

function getTaskPathParts(task: { name: string; config?: any }): string[] | null {
  const config = task.config as any;
  if (!config?.nodePath) return null;
  const parts = parseNodePath(config.nodePath);
  return parts.length > 1 ? parts : null;
}

function getTaskTreeId(task: { config?: any }): string | null {
  const config = task.config as any;
  return config?.treeId || null;
}

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<ScheduledTask | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showExecutionsDialog, setShowExecutionsDialog] = useState(false);
  const [search, setSearch] = useState('');

  // Live progress dialog (manual trigger)
  const [runningTask, setRunningTask] = useState<ScheduledTask | null>(null);
  const [runStatus, setRunStatus] = useState<'triggering' | 'running' | 'retrying' | 'success' | 'failure' | 'failed_permanent'>('triggering');
  const [runResult, setRunResult] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runElapsed, setRunElapsed] = useState(0);
  const [runPipelineReport, setRunPipelineReport] = useState<any[]>([]);
  const runStartRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Global background-task tracking
  // taskId -> { startedAt (ms), elapsedSec, name, type, treeName, nodeName, detail }
  const [bgRunning, setBgRunning] = useState<Record<string, {
    startedAt: number;
    elapsed: number;
    name?: string;
    type?: string;
    treeName?: string | null;
    nodeName?: string | null;
    detail?: string | null;
    executionId?: string;
  }>>({});
  const [bgDialogOpen, setBgDialogOpen] = useState(false);
  const bgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgElapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [bgTick, setBgTick] = useState(0); // forces re-render for elapsed

  // Run-all state
  const [runAllOpen, setRunAllOpen] = useState(false);
  const [expandedRunAllRows, setExpandedRunAllRows] = useState<Set<string>>(new Set());
  const [runAllData, setRunAllData] = useState<{
    active: boolean;
    run?: {
      id: string;
      startedAt: string;
      completedAt?: string;
      status: 'running' | 'completed' | 'aborted';
      currentIndex: number;
      tasks: Array<{
        taskId: string;
        taskName: string;
        taskType: string;
        treeName: string | null;
        treeId: string | null;
        nodeName: string | null;
        detail: string | null;
        status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
        error?: string;
        message?: string;
        durationMs?: number;
        pipelineReport?: Array<{
          name: string;
          type: string;
          status: 'success' | 'error' | 'skipped';
          error?: string;
          timestamp: string;
          nodePath?: string;
        }>;
      }>;
    };
  } | null>(null);
  const runAllPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start global polling on mount (+ check for existing run-all)
  useEffect(() => {
    fetchTasks();
    startBgPolling();
    // Check if there's an active run-all from before navigation
    pollRunAll();
    return () => {
      if (bgPollRef.current) clearInterval(bgPollRef.current);
      if (bgElapsedRef.current) clearInterval(bgElapsedRef.current);
      if (runAllPollRef.current) clearInterval(runAllPollRef.current);
    };
  }, []);

  // Pause all polling while the tab is hidden — prevents hundreds of
  // background requests piling up on the dev server (which caused the
  // `--max-old-space-size` OOM restart and UI freeze reported in the log).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (bgPollRef.current) { clearInterval(bgPollRef.current); bgPollRef.current = null; }
        if (bgElapsedRef.current) { clearInterval(bgElapsedRef.current); bgElapsedRef.current = null; }
        if (runAllPollRef.current) { clearInterval(runAllPollRef.current); runAllPollRef.current = null; }
      } else {
        if (!bgPollRef.current) startBgPolling();
        if (runAllData?.active && !runAllPollRef.current) startRunAllPolling();
        // Fetch immediately so state is fresh when user returns to the tab.
        pollRunAll();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [runAllData?.active]);

  const startBgPolling = () => {
    // Elapsed ticker: every 3s (was every 1s — too chatty, re-renders whole
    // page tree and was a contributor to the UI freeze reported on the
    // scheduler page under memory pressure).
    bgElapsedRef.current = setInterval(() => setBgTick(t => t + 1), 3000);
    // Running-task poll: every 4s (was 2.5s). Still plenty fresh, but ~40%
    // less DB + server pressure while long tasks are running.
    bgPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/scheduler/executions?status=running&limit=20');
        if (!res.ok) return;
        const data = await res.json();
        const runningExecs: any[] = data.executions || [];
        setBgRunning(prev => {
          const next: Record<string, typeof prev[string]> = {};
          for (const exec of runningExecs) {
            const taskId = exec.task?.id || exec.taskId;
            if (!taskId) continue;
            const startedAt = prev[taskId]?.startedAt ?? new Date(exec.startedAt).getTime();
            next[taskId] = {
              startedAt,
              elapsed: Math.floor((Date.now() - startedAt) / 1000),
              name: exec.task?.name ?? prev[taskId]?.name,
              type: exec.task?.type ?? prev[taskId]?.type,
              treeName: exec.task?.treeName ?? prev[taskId]?.treeName ?? null,
              nodeName: exec.task?.nodeName ?? prev[taskId]?.nodeName ?? null,
              detail: exec.task?.detail ?? prev[taskId]?.detail ?? null,
              executionId: exec.id ?? prev[taskId]?.executionId,
            };
          }
          // If something finished (was in prev but not in next), refresh tasks
          const prevIds = Object.keys(prev);
          const nextIds = Object.keys(next);
          if (prevIds.some(id => !nextIds.includes(id))) {
            fetchTasks(true); // silent refresh when a task finishes
          }
          return next;
        });
      } catch { /* ignore */ }
    }, 4000);
  };

  const fetchTasks = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch('/api/scheduler/tasks?includeExecutions=false');
      const data = await response.json();

      if (response.ok) {
        setTasks(data.items || data.tasks || []);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.error || 'Failed to fetch tasks'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch tasks'
      });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleTaskCreated = () => {
    setShowCreateDialog(false);
    fetchTasks();
    toast({
      title: 'Success',
      description: 'Task created successfully'
    });
  };

  const handleTaskUpdated = () => {
    fetchTasks();
    toast({
      title: 'Success',
      description: 'Task updated successfully'
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) {
      return;
    }

    try {
      const response = await fetch(`/api/scheduler/tasks/${taskId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchTasks();
        toast({
          title: 'Success',
          description: 'Task deleted successfully'
        });
      } else {
        const data = await response.json();
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.error || 'Failed to delete task'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete task'
      });
    }
  };

  const handleToggleStatus = async (task: ScheduledTask) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';

    try {
      const response = await fetch(`/api/scheduler/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchTasks();
        toast({
          title: 'Success',
          description: `Task ${newStatus === 'active' ? 'activated' : 'paused'}`
        });
      } else {
        const data = await response.json();
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.error || 'Failed to update task status'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update task status'
      });
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
  };

  const closeRunDialog = () => {
    stopPolling();
    setRunningTask(null);
  };

  // ── Run-All logic ──

  const pollRunAll = async () => {
    try {
      const res = await fetch('/api/scheduler/run-all');
      if (!res.ok) return;
      const data = await res.json();
      setRunAllData(data);
      if (data.active && !runAllOpen) {
        setRunAllOpen(true);
      }
      // Start polling if active
      if (data.active && !runAllPollRef.current) {
        startRunAllPolling();
      }
    } catch { /* ignore */ }
  };

  const startRunAllPolling = () => {
    if (runAllPollRef.current) return;
    // 3s cadence (was 1.5s). The indeterminate progress bar and per-task
    // animation already convey "something is happening" — we don't need
    // sub-2s poll granularity, and doubling the interval halves the server
    // load while long-running python/SQL steps are executing.
    runAllPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/scheduler/run-all');
        if (!res.ok) return;
        const data = await res.json();
        setRunAllData(data);
        if (!data.active) {
          // Completed — stop polling, refresh tasks
          if (runAllPollRef.current) { clearInterval(runAllPollRef.current); runAllPollRef.current = null; }
          fetchTasks(true);
        }
      } catch { /* ignore */ }
    }, 3000);
  };

  const handleRunAll = async () => {
    setRunAllOpen(true);
    setRunAllData({ active: true, run: undefined }); // Show loading

    try {
      const res = await fetch('/api/scheduler/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ variant: 'destructive', title: 'Errore', description: d.error || 'Impossibile avviare' });
        setRunAllOpen(false);
        return;
      }
      // Start polling
      startRunAllPolling();
      // Immediate poll
      setTimeout(pollRunAll, 500);
    } catch {
      toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile contattare il server' });
      setRunAllOpen(false);
    }
  };

  const handleAbortRunAll = async () => {
    try {
      await fetch('/api/scheduler/run-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abort' }),
      });
      pollRunAll();
    } catch { /* ignore */ }
  };

  const closeRunAllDialog = () => {
    setRunAllOpen(false);
    // Keep polling alive while a run-all is still active so that re-opening
    // the dialog (via the "1 task in esecuzione" banner) shows fresh state.
    // Only stop polling once the run has actually finished.
    if (runAllPollRef.current && !runAllData?.active) {
      clearInterval(runAllPollRef.current);
      runAllPollRef.current = null;
    }
  };

  // Banner click: decide which progress view to open.
  //   - If there's an active `Lancia Tutto` batch → open the run-all dialog.
  //   - Otherwise the banner is showing individual running tasks from the
  //     scheduler-service; open a lightweight list dialog for those.
  const reopenRunAllDialog = async () => {
    await pollRunAll(); // refresh run-all state
    if (runAllData?.active) {
      setRunAllOpen(true);
      if (!runAllPollRef.current) startRunAllPolling();
    } else {
      setBgDialogOpen(true);
    }
  };

  const handleTriggerTask = async (task: ScheduledTask) => {
    stopPolling();
    setRunningTask(task);
    setRunStatus('triggering');
    setRunResult(null);
    setRunError(null);
    setRunElapsed(0);
    setRunPipelineReport([]);
    runStartRef.current = Date.now();

    // Elapsed ticker
    elapsedIntervalRef.current = setInterval(() => {
      setRunElapsed(Math.floor((Date.now() - runStartRef.current) / 1000));
    }, 1000);

    try {
      const triggerRes = await fetch(`/api/scheduler/tasks/${task.id}/trigger`, { method: 'POST' });
      if (!triggerRes.ok) {
        const d = await triggerRes.json();
        setRunStatus('failure');
        setRunError(d.error || 'Impossibile avviare il task');
        stopPolling();
        return;
      }
    } catch {
      setRunStatus('failure');
      setRunError('Impossibile contattare il server');
      stopPolling();
      return;
    }

    setRunStatus('running');
    const triggerTime = new Date();

    // Poll executions every 1.5s to detect the new execution
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/scheduler/tasks/${task.id}/executions?limit=5`);
        if (!res.ok) return;
        const data = await res.json();
        const execs: any[] = data.executions || [];
        // Find the execution started at or after trigger
        const exec = execs.find(e => new Date(e.startedAt) >= triggerTime);
        if (!exec) return;

        const st = exec.status as string;
        if (st === 'running' || st === 'retrying') {
          setRunStatus(st as any);
        } else {
          // Terminal state
          setRunStatus(st as any);
          setRunError(exec.error || null);
          // Extract message from result
          const r = exec.result;
          if (r) {
            if (typeof r === 'string') setRunResult(r);
            else if (r.message) setRunResult(r.message);
            else if (r.error) setRunError(r.error);
          }
          // Pipeline report
          if (r?.pipelineReport) setRunPipelineReport(r.pipelineReport);
          stopPolling();
          fetchTasks();
        }
      } catch { /* ignore */ }
    }, 1500);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500"><Pause className="w-3 h-3 mr-1" /> Paused</Badge>;
      case 'disabled':
        return <Badge className="bg-gray-500"><XCircle className="w-3 h-3 mr-1" /> Disabled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'EMAIL_PREVIEW': 'bg-blue-500',
      'EMAIL_SEND': 'bg-purple-500',
      'SQL_PREVIEW': 'bg-cyan-500',
      'SQL_EXECUTE': 'bg-indigo-500',
      'DATA_SYNC': 'bg-orange-500',
      'CUSTOM': 'bg-pink-500'
    };

    return (
      <Badge className={colors[type] || 'bg-gray-500'}>
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const bgRunningCount = Object.keys(bgRunning).length;

  return (
    <div className="container mx-auto p-6">

      {/* ── Global "tasks running" banner ── */}
      {bgRunningCount > 0 && (
        <button
          type="button"
          onClick={reopenRunAllDialog}
          title="Clicca per vedere avanzamento"
          className="mb-4 w-full text-left rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors px-4 py-3 flex items-center gap-3 cursor-pointer"
        >
          <Loader2 className="w-4 h-4 animate-spin text-violet-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-violet-800 dark:text-violet-300">
                {bgRunningCount === 1 ? '1 task in esecuzione' : `${bgRunningCount} task in esecuzione`}
                <span className="ml-2 text-xs font-normal text-violet-600 dark:text-violet-400 underline">
                  vedi avanzamento
                </span>
              </span>
              <span className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                {Object.values(bgRunning).map(r => {
                  const s = Math.floor((Date.now() - r.startedAt) / 1000);
                  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
                }).join(' · ')}
              </span>
            </div>
            {/* Indeterminate progress bar */}
            <div className="h-1.5 w-full bg-violet-200 dark:bg-violet-800 rounded-full overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full animate-[progress_2s_ease-in-out_infinite]"
                style={{ width: '40%', animation: 'bgSlide 1.8s ease-in-out infinite' }} />
            </div>
          </div>
        </button>
      )}

      <style>{`
        @keyframes bgSlide {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { width: 60%; }
          100% { transform: translateX(350%); width: 40%; }
        }
      `}</style>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Scheduler</h1>
          <p className="text-muted-foreground mt-1">Gestisci le operazioni pianificate</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRunAll}
            disabled={runAllData?.active === true}
          >
            {runAllData?.active ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-2" />
            )}
            {runAllData?.active
              ? (() => {
                  const r = runAllData.run;
                  if (!r) return 'In corso...';
                  const current = r.tasks[r.currentIndex];
                  const currentName = current?.nodeName || current?.treeName || current?.taskName || '';
                  return `${r.currentIndex + 1}/${r.tasks.length} — ${currentName}`;
                })()
              : 'Lancia Tutto'}
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nuovo Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crea Nuovo Task Pianificato</DialogTitle>
              <DialogDescription>
                Configura un nuovo task pianificato per eseguire operazioni automatiche
              </DialogDescription>
            </DialogHeader>
            <TaskForm onSuccess={handleTaskCreated} onCancel={() => setShowCreateDialog(false)} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs defaultValue="tasks" className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="tasks">
              <List className="w-4 h-4 mr-2" />
              Schedulazioni
            </TabsTrigger>
            <TabsTrigger value="executions">
              <FileText className="w-4 h-4 mr-2" />
              Registro Invii
            </TabsTrigger>
            <TabsTrigger value="missed">
              <AlertCircle className="w-4 h-4 mr-2" />
              Task Persi
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              <CalendarClock className="w-4 h-4 mr-2" />
              Prossimi Invii
            </TabsTrigger>
            <TabsTrigger value="optimize">
              <Sparkles className="w-4 h-4 mr-2" />
              Ottimizzazione
            </TabsTrigger>
          </TabsList>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Task Pianificati</CardTitle>
              <CardDescription>
                Gestisci e monitora tutti i task pianificati
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Caricamento task...</p>
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nessun task pianificato</h3>
                  <p className="text-muted-foreground mb-4">
                    Crea il tuo primo task pianificato per automatizzare le operazioni
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Crea Primo Task
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Stato</TableHead>
                      <TableHead className="text-xs">Ultima Esecuzione</TableHead>
                      <TableHead className="text-xs">Prossima Esecuzione</TableHead>
                      <TableHead className="text-xs">Esecuzioni</TableHead>
                      <TableHead className="text-xs">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.filter(task => {
                      if (!search.trim()) return true;
                      const q = search.toLowerCase();
                      return (
                        getTaskNodeName(task).toLowerCase().includes(q) ||
                        (task.treeName || '').toLowerCase().includes(q) ||
                        task.type.toLowerCase().includes(q) ||
                        (task.config as any)?.subject?.toLowerCase().includes(q) ||
                        (task.description || '').toLowerCase().includes(q)
                      );
                    }).map((task) => {
                      const isRunning = !!bgRunning[task.id];
                      const runInfo = bgRunning[task.id];
                      const elapsedSec = runInfo ? Math.floor((Date.now() - runInfo.startedAt) / 1000) : 0;
                      return (
                      <TableRow key={task.id} className={isRunning ? 'bg-violet-50/60 dark:bg-violet-900/10' : ''}>
                        <TableCell className="whitespace-nowrap">
                          <div>
                            {task.treeName && (
                              <div className="text-[10px] text-muted-foreground leading-tight">{task.treeName}</div>
                            )}
                            {getTaskTreeId(task) ? (
                              <Link
                                href={`/view/${getTaskTreeId(task)}${(task.config as any)?.nodePath ? `?node=${encodeURIComponent((task.config as any).nodePath)}` : ''}`}
                                className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                              >
                                {getTaskNodeName(task)}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <div className="text-xs font-medium">{getTaskNodeName(task)}</div>
                            )}
                            {getTaskPathParts(task) && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                {getTaskPathParts(task)!.map((part, i, arr) => (
                                  <span key={i} className="inline-flex items-center">
                                    <span className={`text-[10px] ${i === arr.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                                      {part}
                                    </span>
                                    {i < arr.length - 1 && (
                                      <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/50 mx-0.5" />
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            {task.description && (
                              <div className="text-[10px] text-muted-foreground">{task.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{getTypeBadge(task.type)}</TableCell>
                        <TableCell className="whitespace-nowrap">{getStatusBadge(task.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {isRunning ? (
                            <div className="flex flex-col gap-1 min-w-[110px]">
                              <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 font-medium">
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                <span>In corso…</span>
                                <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                                  {elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`}
                                </span>
                              </div>
                              <div className="h-1 w-full bg-violet-100 dark:bg-violet-900 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-500 rounded-full"
                                  style={{ width: `${Math.min(95, 5 + (elapsedSec / 120) * 90)}%`, transition: 'width 1s linear' }} />
                              </div>
                            </div>
                          ) : formatDate(task.lastRunAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(task.nextRunAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-green-600">{task.successCount}</span>
                            <span>/</span>
                            <span className="text-red-600">{task.failureCount}</span>
                            <span className="text-muted-foreground">({task.runCount})</span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTriggerTask(task)}
                              title="Esegui ora questo singolo task"
                              className="h-7 px-2 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
                              disabled={isRunning}
                            >
                              <Play className="w-3 h-3" />
                              Esegui
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleStatus(task)}
                              title={task.status === 'active' ? 'Pausa' : 'Attiva'}
                              className="h-7 w-7 p-0"
                            >
                              {task.status === 'active' ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedTask(task);
                                setShowExecutionsDialog(true);
                              }}
                              title="Storico esecuzioni"
                              className="h-7 w-7 p-0"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTask(task.id)}
                              title="Elimina"
                              className="h-7 w-7 p-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );})}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions">
          <SchedulerExecutionLog search={search} />
        </TabsContent>

        <TabsContent value="missed">
          <MissedTasksPanel search={search} />
        </TabsContent>

        <TabsContent value="upcoming">
          <SchedulerUpcoming search={search} />
        </TabsContent>

        <TabsContent value="optimize">
          <SchedulerOptimize search={search} />
        </TabsContent>
      </Tabs>

      {/* Live execution progress dialog */}
      <Dialog open={!!runningTask} onOpenChange={open => { if (!open) closeRunDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {runStatus === 'triggering' || runStatus === 'running' || runStatus === 'retrying' ? (
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              ) : runStatus === 'success' ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500" />
              )}
              {runningTask ? getTaskNodeName(runningTask) : 'Esecuzione Task'}
            </DialogTitle>
            {runningTask?.treeName && (
              <DialogDescription>{runningTask.treeName}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {runStatus === 'triggering' && <span className="text-muted-foreground">Avvio in corso...</span>}
                {runStatus === 'running' && <span className="text-violet-600 font-medium">In esecuzione</span>}
                {runStatus === 'retrying' && <span className="text-yellow-600 font-medium">Nuovo tentativo...</span>}
                {runStatus === 'success' && <span className="text-green-600 font-medium">Completato con successo</span>}
                {(runStatus === 'failure' || runStatus === 'failed_permanent') && <span className="text-red-600 font-medium">Errore</span>}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="w-3 h-3" />
                <span>{runElapsed}s</span>
              </div>
            </div>

            {/* Progress bar while running */}
            {(runStatus === 'triggering' || runStatus === 'running' || runStatus === 'retrying') && (
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            )}

            {/* Result message */}
            {runResult && (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-800 dark:text-green-300">
                {runResult}
              </div>
            )}

            {/* Error */}
            {runError && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-800 dark:text-red-300 break-words">
                {runError}
              </div>
            )}

            {/* Pipeline report */}
            {runPipelineReport.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground mb-1">Pipeline Report</div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {runPipelineReport.map((entry: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-0.5 border-b border-border/40 last:border-0">
                      {entry.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />
                      ) : entry.status === 'error' ? (
                        <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">{entry.name}</span>
                      {entry.type && <span className="text-muted-foreground shrink-0">{entry.type}</span>}
                      {entry.error && <span className="text-red-500 truncate max-w-[140px]" title={entry.error}>{entry.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Waiting message */}
            {(runStatus === 'running' || runStatus === 'retrying') && !runPipelineReport.length && (
              <p className="text-xs text-muted-foreground text-center">
                Attendere il completamento dell'esecuzione...
              </p>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="outline" size="sm" onClick={closeRunDialog}>
              {runStatus === 'running' || runStatus === 'retrying' || runStatus === 'triggering' ? 'Chiudi (continua in background)' : 'Chiudi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExecutionsDialog} onOpenChange={setShowExecutionsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Storico Esecuzioni</DialogTitle>
            <DialogDescription>
              {selectedTask?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <TaskExecutions taskId={selectedTask.id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Run-All progress dialog */}
      <Dialog open={runAllOpen} onOpenChange={open => { if (!open) closeRunAllDialog(); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {runAllData?.active ? (
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              ) : runAllData?.run?.status === 'completed' ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : runAllData?.run?.status === 'aborted' ? (
                <StopCircle className="w-4 h-4 text-yellow-500" />
              ) : (
                <PlayCircle className="w-4 h-4 text-violet-500" />
              )}
              Esecuzione Completa
            </DialogTitle>
            <DialogDescription>
              {runAllData?.active
                ? `Task ${(runAllData.run?.currentIndex ?? 0) + 1} di ${runAllData.run?.tasks.length ?? '...'} in esecuzione`
                : runAllData?.run
                  ? `${runAllData.run.tasks.filter(t => t.status === 'success').length} successi, ${runAllData.run.tasks.filter(t => t.status === 'failure').length} errori`
                  : 'Avvio in corso...'}
            </DialogDescription>
          </DialogHeader>

          {runAllData?.run ? (
            <div className="flex-1 overflow-hidden flex flex-col gap-3 py-2">
              {/* Summary bar */}
              <div className="flex items-center gap-2 text-xs">
                {(() => {
                  const r = runAllData.run!;
                  const done = r.tasks.filter(t => t.status !== 'pending' && t.status !== 'running').length;
                  const pct = r.tasks.length > 0 ? Math.round((done / r.tasks.length) * 100) : 0;
                  return (
                    <>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: r.status === 'aborted'
                              ? 'rgb(234 179 8)'
                              : r.tasks.some(t => t.status === 'failure')
                                ? 'linear-gradient(90deg, rgb(34 197 94) 0%, rgb(239 68 68) 100%)'
                                : 'rgb(34 197 94)',
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground tabular-nums shrink-0">{pct}%</span>
                    </>
                  );
                })()}
              </div>

              {/* Task list */}
              <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
                {runAllData.run.tasks.map((t, i) => {
                  const hasReport = Array.isArray(t.pipelineReport) && t.pipelineReport.length > 0;
                  const expanded = expandedRunAllRows.has(t.taskId);
                  return (
                  <div key={t.taskId}>
                  <div
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors ${
                      t.status === 'running'
                        ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800'
                        : t.status === 'success'
                          ? 'bg-green-50/50 dark:bg-green-900/10'
                          : t.status === 'failure'
                            ? 'bg-red-50/50 dark:bg-red-900/10'
                            : ''
                    }`}
                  >
                    {/* Expand toggle — always interactive. Shows pipelineReport
                        when available, otherwise just status / message / error. */}
                    <button
                      type="button"
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-muted cursor-pointer"
                      onClick={() => {
                        setExpandedRunAllRows(prev => {
                          const next = new Set(prev);
                          if (next.has(t.taskId)) next.delete(t.taskId);
                          else next.add(t.taskId);
                          return next;
                        });
                      }}
                      title={expanded ? 'Nascondi dettagli' : 'Mostra dettagli'}
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                    </button>

                    {/* Status icon */}
                    <div className="shrink-0 w-4">
                      {t.status === 'pending' && <span className="block w-2 h-2 rounded-full bg-muted-foreground/30 mx-auto" />}
                      {t.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />}
                      {t.status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                      {t.status === 'failure' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      {t.status === 'skipped' && <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />}
                    </div>

                    {/* Index */}
                    <span className="text-muted-foreground tabular-nums w-5 text-right shrink-0">{i + 1}.</span>

                    {/* Name + detail */}
                    <div className="flex-1 min-w-0">
                      <div className={`truncate ${t.status === 'running' ? 'font-medium text-violet-700 dark:text-violet-300' : ''}`}>
                        {t.nodeName || t.treeName || t.taskName}
                      </div>
                      {t.detail && (
                        <div className="truncate text-[10px] text-muted-foreground">
                          {t.detail}
                        </div>
                      )}
                    </div>

                    {/* Type badge */}
                    <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                      {t.taskType.replace(/_/g, ' ')}
                    </Badge>

                    {/* Open button */}
                    {t.treeId && (
                      <Link href={`/trees/${t.treeId}`} target="_blank" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" title="Apri albero">
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                    )}

                    {/* Duration or status */}
                    <div className="shrink-0 w-16 text-right text-muted-foreground tabular-nums">
                      {t.status === 'running' && <span className="text-violet-600">...</span>}
                      {t.durationMs != null && (
                        <span>{t.durationMs < 1000 ? `${t.durationMs}ms` : `${(t.durationMs / 1000).toFixed(1)}s`}</span>
                      )}
                    </div>
                  </div>
                  {expanded && (
                    <div className="ml-12 mt-1 mb-2 pl-3 border-l-2 border-violet-200 dark:border-violet-800 space-y-0.5">
                      {hasReport ? (
                        t.pipelineReport!.map((step, si) => (
                          <div key={si} className="flex items-center gap-2 text-[11px] py-0.5">
                            <span className="shrink-0">
                              {step.status === 'success' && <CheckCircle className="w-3 h-3 text-green-500" />}
                              {step.status === 'error' && <XCircle className="w-3 h-3 text-red-500" />}
                              {step.status === 'skipped' && <AlertCircle className="w-3 h-3 text-yellow-500" />}
                            </span>
                            <span className="font-mono text-muted-foreground tabular-nums w-5">{si + 1}.</span>
                            <span className="flex-1 truncate">{step.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{step.type}</Badge>
                            {step.error && (
                              <span className="text-red-600 dark:text-red-400 text-[10px] truncate max-w-[200px]" title={step.error}>
                                {step.error}
                              </span>
                            )}
                          </div>
                        ))
                      ) : (
                        // Fallback for tasks without a pipelineReport (older types
                        // or in-progress runs) — show whatever we know.
                        <div className="text-[11px] py-1 space-y-0.5">
                          <div className="text-muted-foreground">
                            <span className="font-medium">Stato:</span> {t.status}
                            {t.durationMs != null && (
                              <span className="ml-2 tabular-nums">
                                ({t.durationMs < 1000 ? `${t.durationMs}ms` : `${(t.durationMs / 1000).toFixed(1)}s`})
                              </span>
                            )}
                          </div>
                          {t.message && <div className="text-foreground/80">{t.message}</div>}
                          {t.error && (
                            <div className="text-red-600 dark:text-red-400 break-words" title={t.error}>
                              {t.error}
                            </div>
                          )}
                          {!t.message && !t.error && (
                            <div className="italic text-muted-foreground">
                              Pipeline dettagliata non disponibile per questo task.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                  );
                })}
              </div>

              {/* Error details (show last failure) */}
              {(() => {
                const lastFail = [...(runAllData.run?.tasks || [])].reverse().find(t => t.status === 'failure');
                if (!lastFail?.error) return null;
                return (
                  <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-800 dark:text-red-300 break-words max-h-20 overflow-y-auto">
                    <span className="font-medium">{lastFail.treeName || lastFail.taskName}:</span> {lastFail.error}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          )}

          <div className="flex justify-between pt-1">
            {runAllData?.active ? (
              <Button variant="destructive" size="sm" onClick={handleAbortRunAll}>
                <StopCircle className="w-3.5 h-3.5 mr-1.5" />
                Interrompi
              </Button>
            ) : (
              <div />
            )}
            <Button variant="outline" size="sm" onClick={closeRunAllDialog}>
              {runAllData?.active ? 'Chiudi (continua in background)' : 'Chiudi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Background individual-task progress dialog (shown when banner is
          clicked and no run-all batch is active). The scheduler-service runs
          tasks in a separate process — Next only has poll-level visibility,
          so this view lists task name + elapsed time, not per-step detail. */}
      <Dialog open={bgDialogOpen} onOpenChange={setBgDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              Task in esecuzione
            </DialogTitle>
            <DialogDescription>
              {bgRunningCount === 1
                ? '1 task in background'
                : `${bgRunningCount} task in background`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {Object.entries(bgRunning).length === 0 && (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Nessun task attivo. L'esecuzione è terminata da poco.
              </div>
            )}
            {Object.entries(bgRunning).map(([taskId, info]) => {
              const seconds = Math.floor((Date.now() - info.startedAt) / 1000);
              const mins = Math.floor(seconds / 60);
              const secs = seconds % 60;
              const elapsedLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

              // Prefer human-readable labels (same priority as run-all view):
              //   primary = nodeName (the leaf step the user authored)
              //   else    = treeName (the decision tree the task runs on)
              //   else    = raw task.name ("Node-xxx-yyy" — id-like fallback)
              const primary = info.nodeName || info.treeName || info.name || taskId;
              // Subtitle row: show "tree · type" or just type if no tree.
              const subtitleParts: string[] = [];
              if (info.nodeName && info.treeName) subtitleParts.push(info.treeName);
              if (info.type) subtitleParts.push(info.type.replace(/_/g, ' '));
              const subtitle = subtitleParts.join(' · ');

              return (
                <div
                  key={taskId}
                  className="flex items-start justify-between gap-2 rounded-md border bg-violet-50/30 dark:bg-violet-900/10 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={primary}>
                      {primary}
                    </div>
                    {subtitle && (
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                        {subtitle}
                      </div>
                    )}
                    {info.detail && (
                      <div className="text-[10px] text-muted-foreground/80 truncate mt-0.5" title={info.detail}>
                        {info.detail}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 shrink-0 tabular-nums pt-0.5">
                    <Timer className="w-3 h-3" />
                    {elapsedLabel}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
            <span>Aggiornamento ogni 4s</span>
            <span>Guarda "Registro Invii" per lo storico.</span>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setBgDialogOpen(false)}>
              Chiudi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
