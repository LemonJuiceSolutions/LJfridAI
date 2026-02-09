'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Save, Trash2, Loader2, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface NodeSchedulePopoverProps {
  treeId: string;
  nodeId: string;
  nodePath: string;
  taskType: 'SQL_PREVIEW' | 'SQL_EXECUTE' | 'PYTHON_EXECUTE' | 'EMAIL_SEND';
  taskLabel: string;
  existingSchedule?: any | null;
  taskConfigProvider: () => Record<string, any>;
  onScheduleChanged?: () => void;
}

const DAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Gio' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sab' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function NodeSchedulePopover({
  treeId,
  nodeId,
  nodePath,
  taskType,
  taskLabel,
  existingSchedule,
  taskConfigProvider,
  onScheduleChanged,
}: NodeSchedulePopoverProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // panel is centered via CSS, no position state needed

  // Schedule config state
  const [scheduleType, setScheduleType] = useState<'specific' | 'interval' | 'cron'>('specific');
  const [daysOfWeek, setDaysOfWeek] = useState('');
  const [hours, setHours] = useState('');
  const [customTimes, setCustomTimes] = useState<string[]>([]);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);
  const [cronExpression, setCronExpression] = useState('');
  const [newTime, setNewTime] = useState('');

  const hasActiveSchedule = !!existingSchedule && existingSchedule.status === 'active';

  // Load existing schedule data when panel opens
  useEffect(() => {
    if (open && existingSchedule) {
      setScheduleType(existingSchedule.scheduleType || 'specific');
      setDaysOfWeek(existingSchedule.daysOfWeek || '');
      setHours(existingSchedule.hours || '');
      setIntervalMinutes(existingSchedule.intervalMinutes || 60);
      setCronExpression(existingSchedule.cronExpression || '');
      const config = existingSchedule.config as any;
      if (config?.customTimes && Array.isArray(config.customTimes)) {
        setCustomTimes(config.customTimes);
      } else {
        setCustomTimes([]);
      }
    } else if (open && !existingSchedule) {
      setScheduleType('specific');
      setDaysOfWeek('');
      setHours('');
      setCustomTimes([]);
      setIntervalMinutes(60);
      setCronExpression('');
    }
  }, [open, existingSchedule]);

  const selectedDays = daysOfWeek ? daysOfWeek.split(',').map(Number) : [];
  const selectedHours = hours ? hours.split(',').map(Number) : [];

  const toggleDay = (day: number) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter(d => d !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    setDaysOfWeek(newDays.join(','));
  };

  const toggleHour = (hour: number) => {
    const newHours = selectedHours.includes(hour)
      ? selectedHours.filter(h => h !== hour)
      : [...selectedHours, hour].sort((a, b) => a - b);
    setHours(newHours.join(','));
  };

  const addCustomTime = () => {
    if (!newTime) return;
    if (customTimes.includes(newTime)) { setNewTime(''); return; }
    setCustomTimes(prev => [...prev, newTime].sort());
    setNewTime('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { saveNodeScheduleAction } = await import('@/app/actions/scheduler');
      const taskConfig = taskConfigProvider();
      const result = await saveNodeScheduleAction(
        treeId,
        nodeId,
        nodePath,
        {
          enabled: true,
          scheduleType,
          cronExpression: scheduleType === 'cron' ? cronExpression : undefined,
          intervalMinutes: scheduleType === 'interval' ? intervalMinutes : undefined,
          daysOfWeek: scheduleType === 'specific' ? daysOfWeek : undefined,
          hours: scheduleType === 'specific' ? hours : undefined,
        },
        {
          ...taskConfig,
          type: taskType,
          customTimes: scheduleType === 'specific' ? customTimes : undefined,
        }
      );

      if (result.success) {
        toast({ title: 'Schedulazione salvata', description: `${taskLabel} programmato con successo.` });
        setOpen(false);
        onScheduleChanged?.();
      } else {
        toast({ variant: 'destructive', title: 'Errore', description: result.message || 'Impossibile salvare la schedulazione.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Errore', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { deleteNodeScheduleByTypeAction } = await import('@/app/actions/scheduler');
      const result = await deleteNodeScheduleByTypeAction(treeId, nodeId, taskType);
      if (result.success) {
        toast({ title: 'Schedulazione rimossa', description: `Schedulazione ${taskLabel} eliminata.` });
        setOpen(false);
        onScheduleChanged?.();
      } else {
        toast({ variant: 'destructive', title: 'Errore', description: result.message || 'Impossibile eliminare.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Errore', description: err.message });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(prev => !prev);
  };

  const panelContent = open ? (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
      className="flex items-center justify-center"
      onClick={(e) => { e.stopPropagation(); setOpen(false); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />
      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-[420px] max-h-[80vh] overflow-y-auto rounded-lg border bg-popover p-5 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">Programma: {taskLabel}</div>
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Schedule Type */}
        <div className="space-y-1">
          <Label className="text-xs">Tipo di schedulazione</Label>
          <div className="flex gap-1">
            {[
              { value: 'specific' as const, label: 'Giorni/Ore' },
              { value: 'interval' as const, label: 'Intervallo' },
              { value: 'cron' as const, label: 'Cron' },
            ].map(opt => (
              <Button
                key={opt.value}
                type="button"
                variant={scheduleType === opt.value ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={() => setScheduleType(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Specific: Days + Hours */}
        {scheduleType === 'specific' && (
          <div className="space-y-3">
            {/* Days */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Giorni</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setDaysOfWeek('1,2,3,4,5')}>Lun-Ven</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setDaysOfWeek('0,1,2,3,4,5,6')}>Tutti</Button>
                </div>
              </div>
              <div className="flex gap-1">
                {DAYS.map(d => (
                  <Button
                    key={d.value}
                    type="button"
                    variant={selectedDays.includes(d.value) ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 w-10 text-[11px] px-0"
                    onClick={() => toggleDay(d.value)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Hours */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ore</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setHours('9,10,11,12,13,14,15,16,17')}>9-17</Button>
                  <Button type="button" variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setHours('')}>Reset</Button>
                </div>
              </div>
              <div className="grid grid-cols-8 gap-1">
                {HOURS.map(h => (
                  <Button
                    key={h}
                    type="button"
                    variant={selectedHours.includes(h) ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-0"
                    onClick={() => toggleHour(h)}
                  >
                    {h.toString().padStart(2, '0')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Times */}
            <div className="space-y-1.5">
              <Label className="text-xs">Orari personalizzati</Label>
              <div className="flex gap-1 items-center">
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="h-7 w-28 text-xs"
                />
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCustomTime} disabled={!newTime}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              {customTimes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customTimes.map(t => (
                    <span key={t} className="inline-flex items-center gap-0.5 bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full text-[11px]">
                      {t}
                      <button type="button" onClick={() => setCustomTimes(prev => prev.filter(x => x !== t))} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Interval */}
        {scheduleType === 'interval' && (
          <div className="space-y-1">
            <Label className="text-xs">Esegui ogni (minuti)</Label>
            <Input
              type="number"
              min={1}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 1)}
              className="h-8 text-xs"
            />
          </div>
        )}

        {/* Cron */}
        {scheduleType === 'cron' && (
          <div className="space-y-1">
            <Label className="text-xs">Espressione Cron</Label>
            <Input
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 9 * * 1-5"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">Es: &quot;0 9 * * 1-5&quot; = Lun-Ven alle 9:00</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-2 border-t">
          {hasActiveSchedule ? (
            <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Rimuovi
            </Button>
          ) : (
            <div />
          )}
          <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            Salva
          </Button>
        </div>
      </div>
    </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative shrink-0"
        title={`Programma ${taskLabel}`}
        onClick={handleToggle}
      >
        <Clock className="h-4 w-4" />
        {hasActiveSchedule && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
        )}
      </Button>
      {panelContent}
    </>
  );
}
