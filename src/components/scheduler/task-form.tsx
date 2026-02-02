/**
 * Task Form Component
 * 
 * Form for creating and editing scheduled tasks
 */

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { ScheduleBuilder } from './schedule-builder';
import { TaskConfigForm } from './task-config-form';

// ============================================
// Schema
// ============================================

const taskFormSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  description: z.string().optional(),
  type: z.enum(['EMAIL_PREVIEW', 'EMAIL_SEND', 'SQL_PREVIEW', 'SQL_EXECUTE', 'DATA_SYNC', 'CUSTOM']),
  scheduleType: z.enum(['cron', 'interval', 'specific']),
  cronExpression: z.string().optional(),
  intervalMinutes: z.number().int().positive().optional(),
  daysOfWeek: z.string().optional(),
  hours: z.string().optional(),
  timezone: z.string().default('Europe/Rome'),
  maxRetries: z.number().int().min(0).default(3),
  retryDelayMinutes: z.number().int().positive().default(5),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

export function TaskForm({ onSuccess, onCancel, initialData }: TaskFormProps) {
  const [loading, setLoading] = useState(false);
  const [taskConfig, setTaskConfig] = useState<any>(initialData?.config || {});

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: initialData || {
      name: '',
      description: '',
      type: 'EMAIL_SEND',
      scheduleType: 'interval',
      intervalMinutes: 60,
      timezone: 'Europe/Rome',
      maxRetries: 3,
      retryDelayMinutes: 5,
    },
  });

  const scheduleType = watch('scheduleType');
  const taskType = watch('type');

  const onSubmit = async (data: TaskFormValues) => {
    try {
      setLoading(true);

      // Validate schedule configuration
      if (data.scheduleType === 'cron' && !data.cronExpression) {
        toast({
          variant: 'destructive',
          title: 'Errore di validazione',
          description: 'L\'espressione cron è obbligatoria per lo scheduling cron'
        });
        return;
      }

      if (data.scheduleType === 'interval' && !data.intervalMinutes) {
        toast({
          variant: 'destructive',
          title: 'Errore di validazione',
          description: 'L\'intervallo in minuti è obbligatorio per lo scheduling a intervalli'
        });
        return;
      }

      if (data.scheduleType === 'specific' && !data.daysOfWeek && !data.hours) {
        toast({
          variant: 'destructive',
          title: 'Errore di validazione',
          description: 'Specificare almeno i giorni della settimana o le ore per lo scheduling specifico'
        });
        return;
      }

      // Validate task configuration
      if (!taskConfig || Object.keys(taskConfig).length === 0) {
        toast({
          variant: 'destructive',
          title: 'Errore di validazione',
          description: 'La configurazione del task è obbligatoria'
        });
        return;
      }

      const payload = {
        ...data,
        config: taskConfig,
      };

      const response = await fetch('/api/scheduler/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const errorData = await response.json();
        toast({
          variant: 'destructive',
          title: 'Errore',
          description: errorData.error || 'Failed to create task'
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: 'Failed to create task'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTaskConfigChange = (config: any) => {
    setTaskConfig(config);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni Base</CardTitle>
          <CardDescription>Configura le informazioni generali del task</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="Es. Invio report giornaliero"
              disabled={loading}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrizione</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descrizione del task..."
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo di Task *</Label>
            <Select
              value={taskType}
              onValueChange={(value) => setValue('type', value as any)}
              disabled={loading}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Seleziona tipo di task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMAIL_PREVIEW">Anteprima Email</SelectItem>
                <SelectItem value="EMAIL_SEND">Invio Email</SelectItem>
                <SelectItem value="SQL_PREVIEW">Anteprima SQL</SelectItem>
                <SelectItem value="SQL_EXECUTE">Esecuzione SQL</SelectItem>
                <SelectItem value="DATA_SYNC">Sincronizzazione Dati</SelectItem>
                <SelectItem value="CUSTOM">Personalizzato</SelectItem>
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-sm text-red-500">{errors.type.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Task Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione Task</CardTitle>
          <CardDescription>Configura i parametri specifici del task</CardDescription>
        </CardHeader>
        <CardContent>
          <TaskConfigForm
            taskType={taskType}
            config={taskConfig}
            onChange={handleTaskConfigChange}
          />
        </CardContent>
      </Card>

      {/* Schedule Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configurazione Scheduling</CardTitle>
          <CardDescription>Configura quando eseguire il task</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="interval" value={scheduleType} onValueChange={(v) => setValue('scheduleType', v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="interval">Intervallo</TabsTrigger>
              <TabsTrigger value="specific">Specifico</TabsTrigger>
              <TabsTrigger value="cron">Cron</TabsTrigger>
            </TabsList>

            <TabsContent value="interval" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="intervalMinutes">Intervallo (minuti) *</Label>
                <Input
                  id="intervalMinutes"
                  type="number"
                  {...register('intervalMinutes', { valueAsNumber: true })}
                  placeholder="60"
                  disabled={loading}
                />
                <p className="text-sm text-muted-foreground">
                  Il task verrà eseguito ogni X minuti
                </p>
                {errors.intervalMinutes && (
                  <p className="text-sm text-red-500">{errors.intervalMinutes.message}</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="specific" className="space-y-4 mt-4">
              <ScheduleBuilder
                daysOfWeek={watch('daysOfWeek')}
                hours={watch('hours')}
                onDaysOfWeekChange={(value) => setValue('daysOfWeek', value)}
                onHoursChange={(value) => setValue('hours', value)}
              />
            </TabsContent>

            <TabsContent value="cron" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="cronExpression">Espressione Cron *</Label>
                <Input
                  id="cronExpression"
                  {...register('cronExpression')}
                  placeholder="0 9 * * *"
                  disabled={loading}
                />
                <p className="text-sm text-muted-foreground">
                  Formato: minuto ora giorno-mese mese giorno-settimana
                </p>
                <p className="text-xs text-muted-foreground">
                  Esempi: "0 9 * * *" (ogni giorno alle 9:00), "0 */6 * * *" (ogni 6 ore)
                </p>
                {errors.cronExpression && (
                  <p className="text-sm text-red-500">{errors.cronExpression.message}</p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Fuso Orario</Label>
              <Select
                value={watch('timezone')}
                onValueChange={(value) => setValue('timezone', value)}
                disabled={loading}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/Rome">Europe/Rome</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                  <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxRetries">Max Tentativi</Label>
                <Input
                  id="maxRetries"
                  type="number"
                  {...register('maxRetries', { valueAsNumber: true })}
                  placeholder="3"
                  disabled={loading}
                  min={0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retryDelayMinutes">Ritardo Retry (minuti)</Label>
                <Input
                  id="retryDelayMinutes"
                  type="number"
                  {...register('retryDelayMinutes', { valueAsNumber: true })}
                  placeholder="5"
                  disabled={loading}
                  min={1}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Annulla
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creazione...' : 'Crea Task'}
        </Button>
      </div>
    </form>
  );
}
