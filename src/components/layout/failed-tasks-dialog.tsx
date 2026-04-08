'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { XCircle, RefreshCw, X, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type FailedTask = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  lastError: string | null;
  failureCount: number;
  maxRetries: number;
  lastRunAt: string | null;
  treeName?: string | null;
  config?: any;
  lastExecution?: {
    id: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
    retryCount: number;
    durationMs: number | null;
  } | null;
};

const TYPE_LABELS: Record<string, string> = {
  EMAIL_SEND: 'Email',
  EMAIL_PREVIEW: 'Email Preview',
  SQL_EXECUTE: 'SQL',
  SQL_PREVIEW: 'SQL Preview',
  PYTHON_EXECUTE: 'Python',
  DATA_SYNC: 'Sync',
  CUSTOM: 'Custom',
};

function getDisplayName(task: FailedTask): string {
  const config = task.config;
  if (config?.nodePath) {
    const matches = config.nodePath.match(/\['([^']+)'\]/g);
    if (matches && matches.length > 0) {
      const parts = matches.map((m: string) => m.replace(/\['|'\]/g, ''));
      return parts[parts.length - 1];
    }
  }
  if (config?.subject) return config.subject;
  if (config?.sqlResultName) return config.sqlResultName;
  if (config?.pythonResultName) return config.pythonResultName;
  if (task.name.startsWith('Node-') && task.treeName) return task.treeName;
  return task.name;
}

// Poll interval to check for newly failed tasks (every 60s)
const POLL_INTERVAL_MS = 60_000;

export function FailedTasksDialog() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<FailedTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const fetchFailedTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduler/failed-tasks');
      if (!res.ok) return;
      const data: FailedTask[] = await res.json();
      if (data.length > 0) {
        setTasks(data);
        // Select all by default — user probably wants to retry all
        setSelected(new Set(data.map(t => t.id)));
        setOpen(true);
      } else {
        setTasks([]);
        setOpen(false);
      }
    } catch {
      // silently ignore
    }
  }, []);

  // Initial check + polling
  useEffect(() => {
    if (status !== 'authenticated') return;

    // First check after 5s (give missed-tasks dialog priority)
    const initial = setTimeout(fetchFailedTasks, 5000);
    // Then poll every 60s
    const interval = setInterval(fetchFailedTasks, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [status, fetchFailedTasks]);

  const toggleTask = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(tasks.map(t => t.id)));
  const deselectAll = () => setSelected(new Set());

  const handleRetry = async () => {
    const retryIds = [...selected];
    const dismissIds = tasks.filter(t => !selected.has(t.id)).map(t => t.id);

    setOpen(false);

    if (retryIds.length > 0) {
      toast({
        title: `${retryIds.length} task in nuovo tentativo...`,
        description: dismissIds.length > 0
          ? `${dismissIds.length} task riprogrammati.`
          : 'Verranno rieseguiti in background.',
      });
    }

    try {
      const res = await fetch('/api/scheduler/failed-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryIds, dismissIds }),
      });

      if (!res.ok) {
        toast({
          title: 'Errore',
          description: 'Impossibile avviare i retry. Riprova.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Errore di connessione',
        description: 'Impossibile contattare il server.',
        variant: 'destructive',
      });
    }
  };

  const handleDismissAll = async () => {
    const dismissIds = tasks.map(t => t.id);
    setOpen(false);

    try {
      await fetch('/api/scheduler/failed-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryIds: [], dismissIds }),
      });
      toast({
        title: 'Task riprogrammati',
        description: 'Verranno eseguiti al prossimo orario previsto.',
      });
    } catch {
      // silent
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (tasks.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Task falliti dopo tutti i tentativi
          </DialogTitle>
          <DialogDescription>
            {tasks.length} task {tasks.length === 1 ? 'ha' : 'hanno'} esaurito tutti i retry automatici.
            Controlla gli errori, correggi il problema e riprova.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Seleziona tutti
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            Deseleziona tutti
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            {selected.size}/{tasks.length} selezionati
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {tasks.map(task => (
            <div
              key={task.id}
              className="rounded-md border border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
            >
              <label className="flex items-start gap-3 p-3 cursor-pointer">
                <Checkbox
                  checked={selected.has(task.id)}
                  onCheckedChange={() => toggleTask(task.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {getDisplayName(task)}
                    </span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {TYPE_LABELS[task.type] || task.type}
                    </Badge>
                    <Badge variant="destructive" className="text-xs shrink-0">
                      {task.lastExecution?.retryCount ?? task.maxRetries} retry falliti
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ultimo tentativo: {formatDate(task.lastRunAt)}
                  </p>
                </div>
              </label>

              {/* Collapsible error details */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 px-3 pb-2 text-xs text-red-600 dark:text-red-400 hover:underline">
                    <ChevronDown className="h-3 w-3" />
                    Dettagli errore
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mx-3 mb-3 p-2 rounded bg-muted/80 dark:bg-muted/30">
                    <pre className="text-xs whitespace-pre-wrap break-words font-mono text-red-700 dark:text-red-300 max-h-32 overflow-y-auto">
                      {task.lastError || task.lastExecution?.error || 'Errore sconosciuto'}
                    </pre>
                    {task.lastExecution?.durationMs && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Durata ultimo tentativo: {(task.lastExecution.durationMs / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={handleDismissAll}
            className="text-muted-foreground"
          >
            <X className="mr-2 h-4 w-4" />
            Riprogramma tutti
          </Button>
          <Button onClick={handleRetry} variant="destructive">
            <RefreshCw className="mr-2 h-4 w-4" />
            {selected.size > 0 ? `Riprova ${selected.size} selezionati` : 'Riprogramma tutti'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
