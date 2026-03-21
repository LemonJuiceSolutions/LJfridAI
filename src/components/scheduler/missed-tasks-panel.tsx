'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, Trash2, RefreshCw, Loader2, CheckSquare, Square, AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

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

function getTaskBreadcrumb(task: MissedTask): string | null {
  const config = task.config;
  if (!config?.nodePath) return null;
  const parts = parseNodePath(config.nodePath);
  if (parts.length <= 1) return task.treeName || null;
  // Show: TreeName > path... (excluding last part which is the display name)
  const pathParts = parts.slice(0, -1);
  const prefix = task.treeName ? `${task.treeName} > ` : '';
  return `${prefix}${pathParts.join(' > ')}`;
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

const TYPE_COLORS: Record<string, string> = {
  EMAIL_SEND: 'bg-purple-500',
  EMAIL_PREVIEW: 'bg-blue-500',
  SQL_EXECUTE: 'bg-indigo-500',
  SQL_PREVIEW: 'bg-cyan-500',
  PYTHON_EXECUTE: 'bg-green-500',
  DATA_SYNC: 'bg-orange-500',
  CUSTOM: 'bg-pink-500',
};

export function MissedTasksPanel() {
  const [tasks, setTasks] = useState<MissedTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchMissedTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/scheduler/missed-tasks');
      if (res.ok) {
        const data: MissedTask[] = await res.json();
        setTasks(data);
        setSelected(new Set());
      }
    } catch {
      toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile caricare i task persi' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMissedTasks(); }, [fetchMissedTasks]);

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

  const totalMissedSlots = tasks.reduce((sum, t) => sum + t.totalMissed, 0);

  const processSelected = async (action: 'execute' | 'skip', executeAll = false) => {
    if (selected.size === 0) return;
    setProcessing(true);
    try {
      const ids = [...selected];
      const body = action === 'execute'
        ? { executeIds: ids, skipIds: [], executeAll }
        : { executeIds: [], skipIds: ids };

      const res = await fetch('/api/scheduler/missed-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const label = action === 'execute' ? 'eseguiti' : 'riprogrammati';
        toast({ title: 'Fatto', description: `${ids.length} task ${label}` });
        await fetchMissedTasks();
      }
    } catch {
      toast({ variant: 'destructive', title: 'Errore', description: 'Operazione fallita' });
    } finally {
      setProcessing(false);
    }
  };

  const processAll = async (action: 'execute' | 'skip', executeAll = false) => {
    setProcessing(true);
    try {
      const ids = tasks.map(t => t.id);
      const body = action === 'execute'
        ? { executeIds: ids, skipIds: [], executeAll }
        : { executeIds: [], skipIds: ids };

      const res = await fetch('/api/scheduler/missed-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const label = action === 'execute' ? 'eseguiti' : 'riprogrammati';
        toast({ title: 'Fatto', description: `${ids.length} task ${label}` });
        await fetchMissedTasks();
      }
    } catch {
      toast({ variant: 'destructive', title: 'Errore', description: 'Operazione fallita' });
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDateShort = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Task Persi
              {tasks.length > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {totalMissedSlots} invii persi su {tasks.length} task
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Invii previsti dal cron che non sono stati eseguiti (server spento o errori)
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMissedTasks} disabled={loading || processing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Analisi coda invii previsti...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun invio perso. Tutto in ordine!
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Button variant="outline" size="sm" onClick={selectAll} disabled={processing}>
                <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                Seleziona tutti
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll} disabled={processing}>
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Deseleziona
              </Button>
              <span className="text-sm text-muted-foreground">
                {selected.size}/{tasks.length}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => processSelected('execute', false)}
                  disabled={processing || selected.size === 0}
                  title="Esegue ogni task una volta e riallinea al prossimo slot"
                >
                  {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                  Esegui 1x e riallinea ({selected.size})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => processSelected('execute', true)}
                  disabled={processing || selected.size === 0}
                  title="Esegue ogni task per ogni slot perso (recupero completo)"
                >
                  {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5 mr-1.5" />}
                  Recupera tutti gli slot
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => processSelected('skip')}
                  disabled={processing || selected.size === 0}
                >
                  Riprogramma
                </Button>
              </div>
            </div>

            {/* Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs text-center">Invii Persi</TableHead>
                  <TableHead className="text-xs">Periodo</TableHead>
                  <TableHead className="text-xs">Ultima Esecuzione</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map(task => (
                  <TableRow key={task.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggleTask(task.id)}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(task.id)}
                        onCheckedChange={() => toggleTask(task.id)}
                        disabled={processing}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{getTaskDisplayName(task)}</div>
                      {(() => {
                        const breadcrumb = getTaskBreadcrumb(task);
                        return breadcrumb ? (
                          <div className="text-[10px] text-muted-foreground">{breadcrumb}</div>
                        ) : task.description ? (
                          <div className="text-[10px] text-muted-foreground">{task.description}</div>
                        ) : null;
                      })()}
                      {task.cronExpression && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                          {task.cronExpression}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${TYPE_COLORS[task.type] || 'bg-gray-500'}`}>
                        {TYPE_LABELS[task.type] || task.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="destructive" className="text-xs font-bold">
                        {task.totalMissed}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {task.oldestMissed && task.newestMissed ? (
                        task.totalMissed === 1 ? (
                          <span className="text-red-500">{formatDateShort(task.oldestMissed)}</span>
                        ) : (
                          <span className="text-red-500">
                            {formatDateShort(task.oldestMissed)} — {formatDateShort(task.newestMissed)}
                          </span>
                        )
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(task.lastRunAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Bulk actions */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button size="sm" onClick={() => processAll('execute', false)} disabled={processing}>
                {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                Esegui tutti 1x ({tasks.length})
              </Button>
              <Button variant="secondary" size="sm" onClick={() => processAll('execute', true)} disabled={processing}>
                {processing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5 mr-1.5" />}
                Recupera tutti ({totalMissedSlots} slot)
              </Button>
              <Button variant="outline" size="sm" onClick={() => processAll('skip')} disabled={processing}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Riprogramma tutti
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-muted-foreground"
                onClick={() => processAll('skip')}
                disabled={processing}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Cancella coda
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
