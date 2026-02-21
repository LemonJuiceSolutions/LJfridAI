'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, RefreshCw, AlertCircle, ExternalLink, ChevronRight } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExecutionWithTask {
  id: string;
  taskId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: any;
  error: string | null;
  retryCount: number;
  task: {
    id: string;
    name: string;
    type: string;
    config: any;
    treeName: string | null;
  };
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
  if (config.nodePath) {
    const parts = parseNodePath(config.nodePath);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  if (config.subject) return config.subject;
  if (config.sqlResultName) return config.sqlResultName;
  if (config.pythonResultName) return config.pythonResultName;
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

export function SchedulerExecutionLog() {
  const [executions, setExecutions] = useState<ExecutionWithTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    setPage(1);
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchExecutions();
  }, [page, statusFilter, typeFilter]);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const response = await fetch(`/api/scheduler/executions?${params}`);
      const data = await response.json();

      if (response.ok) {
        setExecutions(data.executions);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Error fetching executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            Successo
          </Badge>
        );
      case 'failure':
        return (
          <Badge className="bg-red-500">
            <XCircle className="w-3 h-3 mr-1" />
            Fallito
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-500">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            In esecuzione
          </Badge>
        );
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };


  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">Tutte</TabsTrigger>
            <TabsTrigger value="success">Successi</TabsTrigger>
            <TabsTrigger value="failure">Fallimenti</TabsTrigger>
            <TabsTrigger value="running">In corso</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Tipo task" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="EMAIL_SEND">Email Send</SelectItem>
            <SelectItem value="EMAIL_PREVIEW">Email Preview</SelectItem>
            <SelectItem value="SQL_EXECUTE">SQL Execute</SelectItem>
            <SelectItem value="SQL_PREVIEW">SQL Preview</SelectItem>
            <SelectItem value="PYTHON_EXECUTE">Python Execute</SelectItem>
            <SelectItem value="DATA_SYNC">Data Sync</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">Caricamento registro...</p>
            </div>
          ) : executions.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nessuna esecuzione trovata</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome Task</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Stato</TableHead>
                    <TableHead className="text-xs">Avviato</TableHead>
                    <TableHead className="text-xs">Completato</TableHead>
                    <TableHead className="text-xs">Durata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell className="whitespace-nowrap">
                        {execution.task ? (
                          <div>
                            {execution.task.treeName && (
                              <div className="text-[10px] text-muted-foreground leading-tight">{execution.task.treeName}</div>
                            )}
                            {(execution.task.config as any)?.treeId ? (
                              <Link
                                href={`/view/${(execution.task.config as any).treeId}${(execution.task.config as any)?.nodePath ? `?node=${encodeURIComponent((execution.task.config as any).nodePath)}` : ''}`}
                                className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
                              >
                                {getTaskNodeName(execution.task)}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            ) : (
                              <span className="text-xs font-medium">{getTaskNodeName(execution.task)}</span>
                            )}
                            {getTaskPathParts(execution.task) && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                {getTaskPathParts(execution.task)!.map((part, i, arr) => (
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
                        ) : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {execution.task ? getTypeBadge(execution.task.type) : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{getStatusBadge(execution.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(execution.startedAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {execution.completedAt ? formatDate(execution.completedAt) : '-'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDuration(execution.durationMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Pagina {page} di {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Precedente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Successiva
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Refresh */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchExecutions}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
      </div>
    </div>
  );
}
