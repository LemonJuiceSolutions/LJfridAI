/**
 * Task Executions Component
 * 
 * Component for viewing task execution history
 */

'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TaskExecution {
  id: string;
  taskId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: any;
  error: string | null;
  retryCount: number;
  createdAt: string;
}

interface TaskExecutionsProps {
  taskId: string;
}

export function TaskExecutions({ taskId }: TaskExecutionsProps) {
  const [executions, setExecutions] = useState<TaskExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchExecutions();
  }, [taskId, page, statusFilter]);

  const fetchExecutions = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/scheduler/tasks/${taskId}/executions?page=${page}&limit=20${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`
      );
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
      case 'failed':
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
      case 'pending':
        return (
          <Badge className="bg-yellow-500">
            <Clock className="w-3 h-3 mr-1" />
            In attesa
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-gray-500">
            <AlertCircle className="w-3 h-3 mr-1" />
            Annullato
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
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
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}min`;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">Tutte</TabsTrigger>
          <TabsTrigger value="success">Successi</TabsTrigger>
          <TabsTrigger value="failed">Fallimenti</TabsTrigger>
          <TabsTrigger value="running">In corso</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Executions Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">Caricamento esecuzioni...</p>
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
                    <TableHead>Stato</TableHead>
                    <TableHead>Avviato</TableHead>
                    <TableHead>Completato</TableHead>
                    <TableHead>Durata</TableHead>
                    <TableHead>Retry</TableHead>
                    <TableHead>Risultato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((execution) => (
                    <TableRow key={execution.id}>
                      <TableCell>{getStatusBadge(execution.status)}</TableCell>
                      <TableCell className="text-sm">
                        {formatDate(execution.startedAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {execution.completedAt ? formatDate(execution.completedAt) : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDuration(execution.durationMs)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {execution.retryCount > 0 ? (
                          <Badge variant="outline" className="text-orange-500 border-orange-500">
                            {execution.retryCount}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs">
                        {execution.error ? (
                          <div className="text-red-600 truncate" title={execution.error}>
                            {execution.error}
                          </div>
                        ) : execution.result ? (
                          <div className="text-green-600 truncate" title={JSON.stringify(execution.result)}>
                            {typeof execution.result === 'string' 
                              ? execution.result 
                              : JSON.stringify(execution.result).substring(0, 50)}
                          </div>
                        ) : (
                          '-'
                        )}
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

      {/* Refresh Button */}
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
