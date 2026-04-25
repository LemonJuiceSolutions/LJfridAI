'use client';

import { useEffect, useState } from 'react';
import { Clock, RefreshCw, Mail, Database, Code, Zap, ExternalLink, ChevronRight, Play, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface UpcomingTask {
  id: string;
  name: string;
  type: string;
  config: any;
  scheduleType: string;
  cronExpression: string | null;
  intervalMinutes: number | null;
  daysOfWeek: string | null;
  hours: string | null;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  successCount: number;
  failureCount: number;
  treeName: string | null;
}

const DAYS_MAP: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Gio', 5: 'Ven', 6: 'Sab'
};

function getScheduleDescription(task: UpcomingTask): string {
  if (task.scheduleType === 'interval') {
    if (task.intervalMinutes && task.intervalMinutes >= 60) {
      const hours = task.intervalMinutes / 60;
      if (Number.isInteger(hours)) return `Ogni ${hours} or${hours === 1 ? 'a' : 'e'}`;
    }
    return `Ogni ${task.intervalMinutes} minuti`;
  }

  if (task.scheduleType === 'cron') {
    return `Cron: ${task.cronExpression}`;
  }

  // 'specific' schedule type
  const parts: string[] = [];

  if (task.daysOfWeek) {
    const days = task.daysOfWeek.split(',').map(Number).sort((a, b) => a - b);
    if (days.join(',') === '1,2,3,4,5') {
      parts.push('Lun-Ven');
    } else if (days.join(',') === '0,1,2,3,4,5,6') {
      parts.push('Ogni giorno');
    } else if (days.join(',') === '0,6') {
      parts.push('Weekend');
    } else {
      parts.push(days.map(d => DAYS_MAP[d]).join(', '));
    }
  }

  // Check for customTimes in config first
  const config = task.config as any;
  const customTimes = config?.customTimes as string[] | undefined;
  if (customTimes && Array.isArray(customTimes) && customTimes.length > 0) {
    parts.push(`alle ${customTimes.join(', ')}`);
  } else if (task.hours) {
    const hrs = task.hours.split(',').map(Number).sort((a, b) => a - b);
    parts.push(`alle ${hrs.map(h => `${h.toString().padStart(2, '0')}:00`).join(', ')}`);
  }

  return parts.join(' ') || 'Non configurato';
}

function getRelativeTime(dateString: string): string {
  const now = new Date();
  const target = new Date(dateString);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs < 0) return 'In ritardo';

  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Tra meno di un minuto';
  if (diffMinutes < 60) return `Tra ${diffMinutes} minut${diffMinutes === 1 ? 'o' : 'i'}`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Tra ${diffHours} or${diffHours === 1 ? 'a' : 'e'}`;

  const diffDays = Math.floor(diffHours / 24);
  return `Tra ${diffDays} giorn${diffDays === 1 ? 'o' : 'i'}`;
}

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

function getTaskNodeName(task: { name: string; config?: any; treeName?: string | null }): string {
  const config = task.config as any;
  if (!config) return task.name;
  // Prefer the user-defined result name (the label they typed in the editor)
  // over the parent option key, which is just the path bucket of the node.
  if (config.sqlResultName) return config.sqlResultName;
  if (config.pythonResultName) return config.pythonResultName;
  if (config.subject) return config.subject;
  if (config.nodePath) {
    const parts = parseNodePath(config.nodePath);
    if (parts.length > 0) return parts[parts.length - 1];
  }
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

export function SchedulerUpcoming({ search = '' }: { search?: string }) {
  const [tasks, setTasks] = useState<UpcomingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<Set<string>>(new Set());

  const handleTrigger = async (task: UpcomingTask) => {
    setTriggering(prev => new Set(prev).add(task.id));
    try {
      const res = await fetch(`/api/scheduler/tasks/${task.id}/trigger`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Errore', description: data.error || `HTTP ${res.status}` });
        return;
      }
      toast({ title: 'Task avviato', description: `"${task.name}" in esecuzione. Vedi Registro Invii per il risultato.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Errore di rete', description: e?.message || 'Trigger fallito' });
    } finally {
      setTriggering(prev => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  };

  useEffect(() => {
    fetchUpcoming();
  }, []);

  const fetchUpcoming = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/scheduler/upcoming');
      const data = await response.json();

      if (response.ok) {
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error('Error fetching upcoming tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'EMAIL_PREVIEW': 'bg-blue-500',
      'EMAIL_SEND': 'bg-purple-500',
      'SQL_PREVIEW': 'bg-cyan-500',
      'SQL_EXECUTE': 'bg-indigo-500',
      'PYTHON_EXECUTE': 'bg-teal-500',
      'DATA_SYNC': 'bg-orange-500',
      'CUSTOM': 'bg-pink-500'
    };
    return (
      <Badge className={colors[type] || 'bg-gray-500'}>
        {type.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'EMAIL_SEND':
      case 'EMAIL_PREVIEW':
        return <Mail className="w-4 h-4" />;
      case 'SQL_EXECUTE':
      case 'SQL_PREVIEW':
        return <Database className="w-4 h-4" />;
      case 'PYTHON_EXECUTE':
        return <Code className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRecipient = (task: UpcomingTask): string | null => {
    if (task.type !== 'EMAIL_SEND' && task.type !== 'EMAIL_PREVIEW') return null;
    const config = task.config as any;
    return config?.to || null;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prossimi Invii Programmati</CardTitle>
          <CardDescription>
            Prossime esecuzioni delle schedulazioni attive
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">Caricamento...</p>
            </div>
          ) : (() => {
            const q = search.trim().toLowerCase();
            const filtered = q
              ? tasks.filter((t) => {
                  const nodeName = getTaskNodeName(t).toLowerCase();
                  const treeName = (t.treeName || '').toLowerCase();
                  const taskName = (t.name || '').toLowerCase();
                  const type = (t.type || '').toLowerCase();
                  const recipient = (getRecipient(t) || '').toLowerCase();
                  return nodeName.includes(q) || treeName.includes(q) || taskName.includes(q) || type.includes(q) || recipient.includes(q);
                })
              : tasks;
            if (filtered.length === 0) {
              return (
                <div className="text-center py-12">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{q ? `Nessun risultato per "${search}"` : 'Nessun invio programmato'}</p>
                </div>
              );
            }
            return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome Task</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Programmazione</TableHead>
                  <TableHead className="text-xs">Prossima Esecuzione</TableHead>

                  <TableHead className="text-xs">Destinatario</TableHead>
                  <TableHead className="text-xs">Statistiche</TableHead>
                  <TableHead className="text-xs w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => {
                  const recipient = getRecipient(task);
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="whitespace-nowrap">
                        <div>
                          {task.treeName && (
                            <div className="text-[10px] text-muted-foreground leading-tight ml-6">{task.treeName}</div>
                          )}
                          <div className="flex items-center gap-1.5">
                            {getTypeIcon(task.type)}
                            {(task.config as any)?.treeId ? (
                              <Link
                                href={`/view/${(task.config as any).treeId}${(task.config as any)?.nodePath ? `?node=${encodeURIComponent((task.config as any).nodePath)}` : ''}`}
                                className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                              >
                                {getTaskNodeName(task)}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-xs font-medium">{getTaskNodeName(task)}</span>
                            )}
                          </div>
                          {getTaskPathParts(task) && (
                            <div className="flex items-center gap-0.5 mt-0.5 ml-6">
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
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{getTypeBadge(task.type)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-xs">{getScheduleDescription(task)}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div>
                          <div className="text-xs font-medium">{formatDate(task.nextRunAt)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {getRelativeTime(task.nextRunAt)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {recipient || '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-green-600">{task.successCount}</span>
                          <span>/</span>
                          <span className="text-red-600">{task.failureCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTrigger(task)}
                          disabled={triggering.has(task.id)}
                          title="Esegui ora questo task"
                          className="h-7 px-2 text-xs gap-1 border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
                        >
                          {triggering.has(task.id)
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Play className="w-3 h-3" />}
                          Esegui
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            );
          })()}
        </CardContent>
      </Card>

      {/* Refresh */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchUpcoming}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
      </div>
    </div>
  );
}
