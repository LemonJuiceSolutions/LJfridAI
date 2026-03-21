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
import { Loader2, AlertTriangle, Play, SkipForward } from 'lucide-react';

type MissedTask = {
  id: string;
  name: string;
  type: string;
  cronExpression: string | null;
  description: string | null;
  lastRunAt: string | null;
  missedSlots: string[];
  totalMissed: number;
  oldestMissed: string | null;
  newestMissed: string | null;
  treeName?: string | null;
  config?: any;
};

function parseNodePath(nodePath: string): string[] {
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

function getTaskDisplayName(task: MissedTask): string {
  const config = task.config;
  if (config?.nodePath) {
    const parts = parseNodePath(config.nodePath);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  if (config?.subject) return config.subject;
  if (config?.sqlResultName) return config.sqlResultName;
  if (config?.pythonResultName) return config.pythonResultName;
  if (task.name.startsWith('Node-') && task.treeName) {
    return task.treeName;
  }
  return task.name;
}

const TYPE_LABELS: Record<string, string> = {
  EMAIL_SEND: 'Email',
  EMAIL_PREVIEW: 'Email Preview',
  SQL_EXECUTE: 'SQL',
  SQL_PREVIEW: 'SQL Preview',
  PYTHON_EXECUTE: 'Python',
  DATA_SYNC: 'Sync',
  CUSTOM: 'Custom',
};

export function MissedTasksDialog() {
  const { data: session, status } = useSession();
  const [tasks, setTasks] = useState<MissedTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [checked, setChecked] = useState(false);

  const totalMissedSlots = tasks.reduce((sum, t) => sum + t.totalMissed, 0);

  const fetchMissedTasks = useCallback(async () => {
    if (checked || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/scheduler/missed-tasks');
      if (!res.ok) return;
      const data: MissedTask[] = await res.json();
      if (data.length > 0) {
        setTasks(data);
        setOpen(true);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [checked, loading]);

  useEffect(() => {
    if (status === 'authenticated' && !checked) {
      // Small delay to let the app settle after login
      const timer = setTimeout(fetchMissedTasks, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, checked, fetchMissedTasks]);

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

  const handleProcess = async () => {
    setProcessing(true);
    try {
      const executeIds = [...selected];
      const skipIds = tasks.filter(t => !selected.has(t.id)).map(t => t.id);
      await fetch('/api/scheduler/missed-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executeIds, skipIds }),
      });
      setOpen(false);
    } catch {
      // silently ignore
    } finally {
      setProcessing(false);
    }
  };

  const handleSkipAll = () => {
    setOpen(false);
  };

  if (tasks.length === 0) return null;

  const formatDateShort = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!processing) setOpen(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Invii programmati persi
          </DialogTitle>
          <DialogDescription>
            {totalMissedSlots} invii previsti su {tasks.length} task non sono stati eseguiti.
            Seleziona quelli da eseguire ora, gli altri verranno riprogrammati.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1">
          <Button variant="outline" size="sm" onClick={selectAll} disabled={processing}>
            Seleziona tutti
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll} disabled={processing}>
            Deseleziona tutti
          </Button>
          <span className="ml-auto text-sm text-muted-foreground">
            {selected.size}/{tasks.length} selezionati
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
          {tasks.map(task => (
            <label
              key={task.id}
              className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                checked={selected.has(task.id)}
                onCheckedChange={() => toggleTask(task.id)}
                disabled={processing}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{getTaskDisplayName(task)}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {TYPE_LABELS[task.type] || task.type}
                  </Badge>
                  <Badge variant="destructive" className="text-xs shrink-0">
                    {task.totalMissed} persi
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {task.totalMissed === 1
                    ? `Previsto: ${formatDateShort(task.oldestMissed)}`
                    : `Dal ${formatDateShort(task.oldestMissed)} al ${formatDateShort(task.newestMissed)}`
                  }
                </p>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={handleSkipAll}
            disabled={processing}
            className="text-muted-foreground"
          >
            <SkipForward className="mr-2 h-4 w-4" />
            Dopo
          </Button>
          <Button
            onClick={handleProcess}
            disabled={processing}
          >
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {selected.size > 0 ? `Esegui ${selected.size} selezionati` : 'Salta tutti e riprogramma'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
