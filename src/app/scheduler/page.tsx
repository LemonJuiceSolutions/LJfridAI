/**
 * Scheduler Page
 * 
 * Main page for managing scheduled tasks
 */

'use client';

import { useEffect, useState } from 'react';
import { Plus, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle, List, FileText, CalendarClock, ExternalLink, ChevronRight } from 'lucide-react';
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
  if (config.nodePath) {
    const parts = parseNodePath(config.nodePath);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  if (config.subject) return config.subject;
  if (config.sqlResultName) return config.sqlResultName;
  if (config.pythonResultName) return config.pythonResultName;
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

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/scheduler/tasks?includeExecutions=false');
      const data = await response.json();

      if (response.ok) {
        setTasks(data.tasks);
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
      setLoading(false);
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

  const handleTriggerTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/scheduler/tasks/${taskId}/trigger`, {
        method: 'POST'
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Task triggered successfully'
        });
        setTimeout(fetchTasks, 1000);
      } else {
        const data = await response.json();
        toast({
          variant: 'destructive',
          title: 'Error',
          description: data.error || 'Failed to trigger task'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to trigger task'
      });
    }
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

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Scheduler</h1>
          <p className="text-muted-foreground mt-1">Gestisci le operazioni pianificate</p>
        </div>
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

      <Tabs defaultValue="tasks" className="space-y-4">
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
        </TabsList>

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
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
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
                        <TableCell className="whitespace-nowrap text-xs">{formatDate(task.lastRunAt)}</TableCell>
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
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTriggerTask(task.id)}
                              title="Esegui ora"
                              className="h-7 w-7 p-0"
                            >
                              <Play className="w-3.5 h-3.5" />
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
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions">
          <SchedulerExecutionLog />
        </TabsContent>

        <TabsContent value="missed">
          <MissedTasksPanel />
        </TabsContent>

        <TabsContent value="upcoming">
          <SchedulerUpcoming />
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
