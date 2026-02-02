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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScheduleBuilder } from '@/components/scheduler/schedule-builder';
import { CalendarClock, Loader2, Save, History, PlayCircle, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { getNodeScheduleAction, saveNodeScheduleAction, getNodeExecutionHistoryAction } from '@/app/actions/scheduler';
import { useToast } from '@/hooks/use-toast';
import { DateTime } from 'luxon';

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

    // Monitoring State
    const [history, setHistory] = useState<any[]>([]);
    const [nextRun, setNextRun] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState("config");

    // Load existing schedule
    useEffect(() => {
        if (isOpen) {
            loadSchedule();
            loadHistory();
        }
    }, [isOpen]);

    const loadHistory = async () => {
        const result = await getNodeExecutionHistoryAction(treeId, nodeId);
        if (result.success && result.data) {
            setHistory(result.data);
        }
    };

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
                setNextRun(task.nextRunAt ? new Date(task.nextRunAt).toLocaleString('it-IT') : null);

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
                setNextRun(null);
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

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-6 border-b bg-muted/40">
                        <TabsList className="w-full justify-start bg-transparent p-0 h-auto gap-4">
                            <TabsTrigger
                                value="config"
                                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3"
                            >Configurazione</TabsTrigger>
                            <TabsTrigger
                                value="history"
                                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 py-3"
                            >Storico Esecuzioni</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="config" className="flex-1 overflow-y-auto p-6 pt-4 mt-0">
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
                    </TabsContent>

                    <TabsContent value="history" className="flex-1 overflow-y-auto p-6 pt-4 mt-0">
                        <div className="space-y-6">
                            {/* Next Run Info */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                                <div className="space-y-1">
                                    <div className="text-sm font-medium">Prossima Esecuzione</div>
                                    <div className="text-2xl font-bold flex items-center gap-2">
                                        {nextRun ? (
                                            <>
                                                <CalendarClock className="h-5 w-5 text-primary" />
                                                {nextRun}
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground text-lg">Non programmata</span>
                                        )}
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => { loadHistory(); loadSchedule(); }}>
                                    <History className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Log Recenti</h3>
                                {history.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground text-sm">
                                        Nessuna esecuzione registrata.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {history.map((run) => (
                                            <div key={run.id} className="flex items-start justify-between p-3 border rounded hover:bg-muted/10 transition-colors">
                                                <div className="flex items-start gap-3">
                                                    {run.status === 'success' ? (
                                                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                                                    ) : run.status === 'running' ? (
                                                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin mt-0.5" />
                                                    ) : (
                                                        <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                                                    )}
                                                    <div>
                                                        <div className="font-medium text-sm">
                                                            {new Date(run.startedAt).toLocaleString('it-IT')}
                                                        </div>
                                                        {run.error && (
                                                            <div className="text-xs text-red-500 mt-1 line-clamp-2">
                                                                {run.error}
                                                            </div>
                                                        )}
                                                        {run.status === 'success' && run.completedAt && (
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                Completato in {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <Badge variant={run.status === 'success' ? 'outline' : run.status === 'running' ? 'secondary' : 'destructive'}>
                                                    {run.status === 'success' ? 'Successo' : run.status === 'running' ? 'In corso' : 'Fallito'}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

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
