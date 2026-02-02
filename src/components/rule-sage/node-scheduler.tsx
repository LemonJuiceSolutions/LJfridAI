'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScheduleBuilder } from '@/components/scheduler/schedule-builder';
import { CalendarClock, Loader2, Save } from 'lucide-react';
import { getNodeScheduleAction, saveNodeScheduleAction } from '@/app/actions/scheduler';
import { useToast } from '@/hooks/use-toast';

interface NodeSchedulerProps {
    treeId: string;
    nodeId: string;
    nodePath: string;
    nodeType: 'sql' | 'python' | 'email';
    taskConfigProvider: () => any; // Function to get current task config (e.g. current query)
}

export function NodeScheduler({
    treeId,
    nodeId,
    nodePath,
    nodeType,
    taskConfigProvider
}: NodeSchedulerProps) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Schedule State
    const [enabled, setEnabled] = useState(false);
    const [scheduleType, setScheduleType] = useState<'interval' | 'specific'>('specific'); // Default to specific
    const [intervalMinutes, setIntervalMinutes] = useState(60);
    const [daysOfWeek, setDaysOfWeek] = useState('');
    const [hours, setHours] = useState('');
    const [customTimes, setCustomTimes] = useState<string[]>([]);

    // Load existing schedule
    useEffect(() => {
        if (isOpen) {
            loadSchedule();
        }
    }, [isOpen]);

    const loadSchedule = async () => {
        setLoading(true);
        try {
            const result = await getNodeScheduleAction(treeId, nodeId);
            if (result.success && result.data) {
                const task = result.data;
                setEnabled(true);
                setScheduleType(task.scheduleType as any || 'specific');
                setIntervalMinutes(task.intervalMinutes || 60);
                setDaysOfWeek(task.daysOfWeek || '');
                setHours(task.hours || '');

                // Safely load custom times
                try {
                    let config = task.config;
                    if (typeof config === 'string') {
                        config = JSON.parse(config);
                    }

                    if (config && Array.isArray((config as any).customTimes)) {
                        setCustomTimes((config as any).customTimes);
                    } else {
                        setCustomTimes([]);
                    }
                } catch (e) {
                    console.error("Error parsing task config:", e);
                    setCustomTimes([]);
                }
            } else {
                // Default state
                setEnabled(false);
                setCustomTimes([]);
            }
        } catch (error) {
            console.error("Error loading schedule:", error);
            toast({
                variant: 'destructive',
                title: 'Errore Caricamento',
                description: 'Impossibile caricare la schedulazione.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);

        const currentTaskConfig = taskConfigProvider();

        // Map internal node types to Task Types
        let taskType = 'CUSTOM';
        if (nodeType === 'sql') taskType = 'SQL_EXECUTE'; // Or PREVIEW depending on need, but usually Execute for schedule
        if (nodeType === 'email') taskType = 'EMAIL_SEND';
        if (nodeType === 'python') taskType = 'PYTHON_EXECUTE';

        // Construct final Task Config
        const finalTaskConfig = {
            ...currentTaskConfig,
            type: taskType
        };

        const scheduleConfig = {
            enabled,
            scheduleType,
            intervalMinutes,
            daysOfWeek,
            hours,
            timezone: 'Europe/Rome',
            // Store customTimes in the main config object which gets merged into task.config by the action
            customTimes
        };

        // Also add to finalTaskConfig just in case action logic splits them differently, 
        // though typically saveNodeScheduleAction merges scheduleConfig into task props or config.
        // Based on action implementation, scheduleConfig props go to DB columns, 
        // but customTimes needs to go into the JSON config column.
        (finalTaskConfig as any).customTimes = customTimes;

        const result = await saveNodeScheduleAction(
            treeId,
            nodeId,
            nodePath,
            scheduleConfig,
            finalTaskConfig
        );

        if (result.success) {
            toast({
                title: 'Schedulazione Salvata',
                description: 'Il task è stato programmato correttamente.',
            });
            setIsOpen(false);
        } else {
            toast({
                variant: 'destructive',
                title: 'Errore',
                description: result.message || 'Impossibile salvare la schedulazione.',
            });
        }

        setSaving(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <CalendarClock className="h-4 w-4" />
                    {enabled ? 'Schedulato' : 'Schedula'}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Schedulazione Task</DialogTitle>
                    <DialogDescription>
                        Configura l'esecuzione automatica per questo nodo.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 pt-2">
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="grid gap-6 py-4">
                            {/* Enable Object */}
                            <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg bg-muted/20">
                                <Label htmlFor="schedule-enabled" className="flex flex-col space-y-1">
                                    <span className="font-semibold">Abilita Schedulazione</span>
                                    <span className="font-normal text-sm text-muted-foreground">
                                        Attiva l'esecuzione automatica di questo nodo.
                                    </span>
                                </Label>
                                <Switch
                                    id="schedule-enabled"
                                    checked={enabled}
                                    onCheckedChange={setEnabled}
                                />
                            </div>

                            {enabled && (
                                <>
                                    <div className="grid gap-2">
                                        <Label>Tipo di Schedulazione</Label>
                                        <Select
                                            value={scheduleType}
                                            onValueChange={(v: any) => setScheduleType(v)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="specific">Giorni e Ore specifici</SelectItem>
                                                <SelectItem value="interval">Intervallo (Ogni X minuti)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {scheduleType === 'interval' && (
                                        <div className="grid gap-2">
                                            <Label>Intervallo in minuti</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                value={intervalMinutes}
                                                onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 1)}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Il task verrà eseguito ogni {intervalMinutes} minuti.
                                            </p>
                                        </div>
                                    )}

                                    {scheduleType === 'specific' && (
                                        <ScheduleBuilder
                                            daysOfWeek={daysOfWeek}
                                            hours={hours}
                                            customTimes={customTimes}
                                            onDaysOfWeekChange={setDaysOfWeek}
                                            onHoursChange={setHours}
                                            onCustomTimesChange={setCustomTimes}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    )}

                </div >

                <DialogFooter className="p-6 pt-2 mt-auto">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Annulla
                    </Button>
                    <Button onClick={handleSave} disabled={loading || saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salva Schedulazione
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
