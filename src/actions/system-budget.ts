'use server';

import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'system-budget.json');

// Lower bound: Next.js + dependencies cannot run in less than ~2GB reliably.
// Upper bound: avoid typo-ing "60000" and OOMing the host.
const MIN_MB = 2048;
const MAX_MB = 65536;

const BudgetSchema = z.object({
    nextHeapMb: z.number().int().min(MIN_MB).max(MAX_MB),
    schedulerHeapMb: z.number().int().min(MIN_MB).max(MAX_MB),
});

export interface SystemBudget {
    nextHeapMb: number;
    schedulerHeapMb: number;
    updatedAt: string | null;
    updatedBy: string | null;
}

const DEFAULTS: SystemBudget = {
    nextHeapMb: 6144,
    schedulerHeapMb: 4096,
    updatedAt: null,
    updatedBy: null,
};

export async function getSystemBudgetAction(): Promise<{ data: SystemBudget; error: string | null }> {
    try {
        const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            data: {
                nextHeapMb: Number(parsed.nextHeapMb) || DEFAULTS.nextHeapMb,
                schedulerHeapMb: Number(parsed.schedulerHeapMb) || DEFAULTS.schedulerHeapMb,
                updatedAt: parsed.updatedAt ?? null,
                updatedBy: parsed.updatedBy ?? null,
            },
            error: null,
        };
    } catch (err: any) {
        if (err.code === 'ENOENT') return { data: DEFAULTS, error: null };
        return { data: DEFAULTS, error: err.message || 'Lettura config fallita' };
    }
}

export async function saveSystemBudgetAction(input: {
    nextHeapMb: number;
    schedulerHeapMb: number;
}): Promise<{ success: boolean; error: string | null }> {
    const session = await getServerSession(authOptions);
    const user = session?.user as any;
    if (!user?.id) return { success: false, error: 'Non autorizzato.' };

    // Admin/superadmin only — host-level resource knob.
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return { success: false, error: 'Permessi insufficienti (solo admin).' };
    }

    const parsed = BudgetSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: `Valori fuori range [${MIN_MB}-${MAX_MB}] MB` };
    }

    const payload: SystemBudget = {
        nextHeapMb: parsed.data.nextHeapMb,
        schedulerHeapMb: parsed.data.schedulerHeapMb,
        updatedAt: new Date().toISOString(),
        updatedBy: user.email ?? user.id,
    };

    try {
        await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
        await fs.writeFile(
            CONFIG_PATH,
            JSON.stringify(
                {
                    ...payload,
                    _comment:
                        'RAM budget per process (MB). Edited via Settings → Risorse Sistema. Restart required after change: ctrl+c dev then npm run dev.',
                },
                null,
                2,
            ) + '\n',
            'utf-8',
        );
        return { success: true, error: null };
    } catch (err: any) {
        return { success: false, error: err.message || 'Scrittura config fallita' };
    }
}
