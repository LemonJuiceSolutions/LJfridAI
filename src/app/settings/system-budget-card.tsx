'use client';

import { useEffect, useState } from 'react';
import { Cpu, Save, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
    getSystemBudgetAction,
    saveSystemBudgetAction,
    type SystemBudget,
} from '@/actions/system-budget';

const MIN_MB = 2048;
const MAX_MB = 65536;

export function SystemBudgetCard() {
    const { toast } = useToast();
    const [nextMb, setNextMb] = useState<number>(6144);
    const [schedulerMb, setSchedulerMb] = useState<number>(4096);
    const [meta, setMeta] = useState<Pick<SystemBudget, 'updatedAt' | 'updatedBy'>>({
        updatedAt: null,
        updatedBy: null,
    });
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getSystemBudgetAction()
            .then(res => {
                if (res.data) {
                    setNextMb(res.data.nextHeapMb);
                    setSchedulerMb(res.data.schedulerHeapMb);
                    setMeta({ updatedAt: res.data.updatedAt, updatedBy: res.data.updatedBy });
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const totalMb = nextMb + schedulerMb;
    const totalGb = (totalMb / 1024).toFixed(1);
    const isOutOfRange =
        nextMb < MIN_MB || nextMb > MAX_MB || schedulerMb < MIN_MB || schedulerMb > MAX_MB;

    async function handleSave() {
        if (isOutOfRange) {
            toast({
                variant: 'destructive',
                title: 'Valori non validi',
                description: `Intervallo consentito: ${MIN_MB}-${MAX_MB} MB per processo.`,
            });
            return;
        }
        setSaving(true);
        try {
            const res = await saveSystemBudgetAction({
                nextHeapMb: nextMb,
                schedulerHeapMb: schedulerMb,
            });
            if (res.error) {
                toast({ variant: 'destructive', title: 'Errore salvataggio', description: res.error });
                return;
            }
            toast({
                title: 'Salvato',
                description: `Riavvia dev e scheduler per applicare: ctrl+c + npm run dev`,
            });
            setDirty(false);
            const fresh = await getSystemBudgetAction();
            if (fresh.data) {
                setMeta({ updatedAt: fresh.data.updatedAt, updatedBy: fresh.data.updatedBy });
            }
        } finally {
            setSaving(false);
        }
    }

    function onChangeNext(v: string) {
        const n = parseInt(v, 10);
        setNextMb(Number.isFinite(n) ? n : 0);
        setDirty(true);
    }
    function onChangeScheduler(v: string) {
        const n = parseInt(v, 10);
        setSchedulerMb(Number.isFinite(n) ? n : 0);
        setDirty(true);
    }

    return (
        <Card className="flex flex-col h-full">
            <CardHeader className="p-3 pb-2 shrink-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                    <Cpu className="h-4 w-4" />
                    Risorse Sistema
                </CardTitle>
                <CardDescription className="text-[11px]">
                    Budget RAM per Next dev e scheduler-service. Evita di saturare la RAM del PC.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Caricamento…
                    </div>
                ) : (
                    <>
                        <div className="space-y-1">
                            <Label htmlFor="next-heap" className="text-[11px] font-medium">
                                Next.js dev (MB)
                            </Label>
                            <Input
                                id="next-heap"
                                type="number"
                                min={MIN_MB}
                                max={MAX_MB}
                                step={512}
                                value={nextMb}
                                onChange={e => onChangeNext(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="scheduler-heap" className="text-[11px] font-medium">
                                scheduler-service (MB)
                            </Label>
                            <Input
                                id="scheduler-heap"
                                type="number"
                                min={MIN_MB}
                                max={MAX_MB}
                                step={512}
                                value={schedulerMb}
                                onChange={e => onChangeScheduler(e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>

                        <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] flex items-center justify-between">
                            <span className="text-muted-foreground">Totale</span>
                            <span className="font-mono font-medium">
                                {totalMb} MB &nbsp; (~{totalGb} GB)
                            </span>
                        </div>

                        <div className="text-[10px] text-muted-foreground leading-snug">
                            Linee guida: mantieni totale ≤ 60% RAM libera.
                            <ul className="list-disc ml-4 mt-1 space-y-0.5">
                                <li>16 GB Mac → Next 5120, Scheduler 3072</li>
                                <li>32 GB Mac → Next 8192, Scheduler 4096</li>
                                <li>64 GB Mac → Next 12288, Scheduler 6144</li>
                            </ul>
                        </div>

                        {dirty && (
                            <div className="flex items-start gap-1.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2 text-[10px] text-amber-800 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                <span>
                                    Modifiche non salvate. Dopo il salvataggio serve <strong>riavviare</strong>{' '}
                                    dev e scheduler (ctrl+c, poi <code>npm run dev</code>).
                                </span>
                            </div>
                        )}

                        {meta.updatedAt && (
                            <div className="text-[10px] text-muted-foreground">
                                Ultimo aggiornamento:{' '}
                                {new Date(meta.updatedAt).toLocaleString('it-IT')}
                                {meta.updatedBy && <> da {meta.updatedBy}</>}
                            </div>
                        )}

                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={saving || !dirty || isOutOfRange}
                            className="w-full"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                    Salvataggio…
                                </>
                            ) : (
                                <>
                                    <Save className="h-3 w-3 mr-1.5" />
                                    Salva
                                </>
                            )}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
