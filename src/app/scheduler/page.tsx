/**
 * Scheduler Page
 * 
 * Main page for managing scheduled tasks
 */

'use client';

import { useEffect, useState } from 'react';
import { Plus, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
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
import { TaskForm } from '@/components/scheduler/task-form';
import { TaskExecutions } from '@/components/scheduler/task-executions';
import { toast } from '@/hooks/use-toast';

interface ScheduledTask {
  id: string;
  name: string;
  description: string | null;
  type: string;
  scheduleType: string;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  successCount: number;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
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
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Ultima Esecuzione</TableHead>
                  <TableHead>Prossima Esecuzione</TableHead>
                  <TableHead>Esecuzioni</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{task.name}</div>
                        {task.description && (
                          <div className="text-sm text-muted-foreground">{task.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(task.type)}</TableCell>
                    <TableCell>{getStatusBadge(task.status)}</TableCell>
                    <TableCell>{formatDate(task.lastRunAt)}</TableCell>
                    <TableCell>{formatDate(task.nextRunAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-green-600">{task.successCount}</span>
                        <span>/</span>
                        <span className="text-red-600">{task.failureCount}</span>
                        <span className="text-muted-foreground">({task.runCount})</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTriggerTask(task.id)}
                          title="Esegui ora"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(task)}
                          title={task.status === 'active' ? 'Pausa' : 'Attiva'}
                        >
                          {task.status === 'active' ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
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
                        >
                          <Clock className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id)}
                          title="Elimina"
                        >
                          <Trash2 className="w-4 h-4" />
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
