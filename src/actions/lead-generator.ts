'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import nodemailer from 'nodemailer';
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp-send";

async function getSession() {
    return await getServerSession(authOptions);
}

async function getAuthUser() {
    const session = await getSession();
    if (!session?.user) return null;
    const userId = (session.user as any).id;
    if (!userId) return null;
    const user = await db.user.findUnique({
        where: { id: userId },
        include: { company: true },
    });
    if (!user?.company) return null;
    return user;
}

/**
 * Save Lead Generator API keys (Apollo, Hunter, SerpApi, Apify) - per company
 */
export async function saveLeadGenApiKeysAction(
    keys: { apollo?: string; hunter?: string; serpApi?: string; apify?: string; groq?: string; vibeProspect?: string; firecrawl?: string }
): Promise<{ success: boolean; error?: string }> {
    const user = await getAuthUser();
    if (!user) return { success: false, error: "Non autorizzato" };

    try {
        await db.company.update({
            where: { id: user.company!.id },
            data: { leadGenApiKeys: keys as any },
        });
        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error("Failed to save lead gen API keys:", error);
        return { success: false, error: "Impossibile salvare le chiavi API" };
    }
}

/**
 * Get Lead Generator API keys - per company
 */
export async function getLeadGenApiKeysAction(): Promise<{
    keys?: { apollo?: string; hunter?: string; serpApi?: string; apify?: string; groq?: string; vibeProspect?: string; firecrawl?: string };
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const company = await db.company.findUnique({
            where: { id: user.company!.id },
            select: { leadGenApiKeys: true },
        });
        return { keys: (company?.leadGenApiKeys as any) || {} };
    } catch (error) {
        console.error("Failed to get lead gen API keys:", error);
        return { error: "Impossibile caricare le chiavi API" };
    }
}

/**
 * Test Groq API key and get available models
 */
export async function testGroqApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API key mancante' };
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
        });
        if (res.status === 401) return { success: false, message: 'API key non valida.' };
        if (!res.ok) return { success: false, message: `Errore Groq: ${res.statusText}` };
        const data = await res.json();
        const whisperModel = data.data?.find((m: any) => m.id?.includes('whisper'));
        return {
            success: true,
            message: `Connessione Groq riuscita! Whisper: ${whisperModel?.id || 'whisper-large-v3'} disponibile. Piano gratuito: 2000 min/giorno.`,
        };
    } catch (error: any) {
        return { success: false, message: error.message || 'Errore di connessione.' };
    }
}

/**
 * Test Vibe Prospecting (Explorium) API key
 */
export async function testVibeProspectApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API key mancante' };
    try {
        const res = await fetch('https://api.explorium.ai/v1/credits', {
            headers: { 'api_key': apiKey.trim() },
        });
        if (res.status === 401 || res.status === 403) return { success: false, message: 'API key non valida.' };
        if (!res.ok) return { success: false, message: `Errore Vibe Prospect: ${res.statusText}` };
        const data = await res.json();
        const allocated = data.allocated_credits ?? 0;
        const remaining = data.remaining_credits ?? 0;
        const used = allocated > 0 ? allocated - remaining : 0;
        return {
            success: true,
            message: `Connessione Vibe Prospecting riuscita!`,
            quota: {
                used,
                available: remaining,
                plan: `Vibe Prospecting (Explorium)`,
                extra: allocated > 0 ? `${used.toLocaleString('it-IT')}/${allocated.toLocaleString('it-IT')} crediti usati` : `${remaining.toLocaleString('it-IT')} crediti rimasti`,
            },
        };
    } catch (error: any) {
        // If /v1/credits doesn't work, try a minimal prospects search as connectivity check
        try {
            const res2 = await fetch('https://api.explorium.ai/v1/prospects', {
                method: 'POST',
                headers: {
                    'api_key': apiKey.trim(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filter: { job_titles: ['CEO'] }, limit: 1 }),
            });
            if (res2.status === 401 || res2.status === 403) return { success: false, message: 'API key non valida.' };
            if (res2.ok || res2.status === 422) {
                // 422 = valid key but bad request format, still means connection works
                return {
                    success: true,
                    message: 'Connessione Vibe Prospecting riuscita! (endpoint crediti non disponibile)',
                };
            }
            return { success: false, message: `Errore Vibe Prospect: ${res2.statusText}` };
        } catch (e2: any) {
            return { success: false, message: error.message || 'Errore di connessione.' };
        }
    }
}

/**
 * Test Firecrawl API key and get credit usage
 */
export async function testFirecrawlApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API key mancante' };
    try {
        // Firecrawl doesn't have a dedicated /credits endpoint — do a minimal scrape to test
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: 'https://example.com',
                formats: ['markdown'],
                onlyMainContent: true,
                timeout: 10000,
            }),
        });

        if (res.status === 401 || res.status === 403) {
            return { success: false, message: 'API key non valida.' };
        }

        if (res.status === 402) {
            return { success: false, message: 'Crediti Firecrawl esauriti.' };
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return { success: false, message: `Errore Firecrawl: ${errData.error || res.statusText}` };
        }

        // Check response headers for rate limit / credits info
        const creditsUsed = res.headers.get('x-credits-used');
        const creditsRemaining = res.headers.get('x-credits-remaining');
        const rateLimit = res.headers.get('x-ratelimit-remaining');

        let extra: string | undefined;
        let used = 0;
        let available = 0;

        if (creditsRemaining) {
            available = parseInt(creditsRemaining, 10);
            used = creditsUsed ? parseInt(creditsUsed, 10) : 0;
            extra = `${available.toLocaleString('it-IT')} crediti rimasti`;
        } else if (rateLimit) {
            extra = `Rate limit: ${rateLimit} richieste rimaste`;
        }

        return {
            success: true,
            message: 'Connessione Firecrawl riuscita! Scraping example.com OK.',
            quota: extra ? {
                used,
                available,
                plan: 'Firecrawl',
                extra,
            } : undefined,
        };
    } catch (error: any) {
        return { success: false, message: error.message || 'Errore di connessione.' };
    }
}

/**
 * Get all lead searches for the company
 */
export async function getLeadSearchesAction(): Promise<{
    searches?: any[];
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const companyId = user.company!.id;
        const [searches, emailCounts, contactCounts, allLeadsForCompanies] = await Promise.all([
            db.leadSearch.findMany({
                where: { companyId },
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { leads: true } } },
            }),
            db.lead.groupBy({
                by: ['searchId'],
                where: { companyId, email: { not: null, notIn: [''] } },
                _count: { _all: true },
            }),
            db.lead.groupBy({
                by: ['searchId'],
                where: { companyId, fullName: { not: null, notIn: [''] } },
                _count: { _all: true },
            }),
            // Fetch company names per search to count unique companies
            db.lead.findMany({
                where: { companyId },
                select: { searchId: true, companyName: true },
            }),
        ]);

        // Build lookup maps by searchId
        const emailCountMap: Record<string, number> = {};
        emailCounts.forEach((r: any) => { if (r.searchId) emailCountMap[r.searchId] = r._count._all; });
        const contactCountMap: Record<string, number> = {};
        contactCounts.forEach((r: any) => { if (r.searchId) contactCountMap[r.searchId] = r._count._all; });

        // Count unique companies per searchId
        const uniqueCompaniesMap: Record<string, Set<string>> = {};
        allLeadsForCompanies.forEach((l: any) => {
            if (!l.searchId) return;
            if (!uniqueCompaniesMap[l.searchId]) uniqueCompaniesMap[l.searchId] = new Set();
            if (l.companyName) uniqueCompaniesMap[l.searchId].add(l.companyName.toLowerCase().trim());
        });
        const uniqueCompanyCountMap: Record<string, number> = {};
        Object.entries(uniqueCompaniesMap).forEach(([sid, set]) => { uniqueCompanyCountMap[sid] = set.size; });

        const enrichedSearches = searches.map((s: any) => ({
            ...s,
            _count: {
                ...s._count,
                leadsWithEmail: emailCountMap[s.id] || 0,
                leadsWithContact: contactCountMap[s.id] || 0,
                uniqueCompanies: uniqueCompanyCountMap[s.id] || 0,
            },
        }));

        return { searches: enrichedSearches };
    } catch (error) {
        console.error("Failed to get lead searches:", error);
        return { error: "Impossibile caricare le ricerche" };
    }
}

/**
 * Get leads with optional filtering
 */
export async function getLeadsAction(searchId?: string): Promise<{
    leads?: any[];
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const where: any = { companyId: user.company!.id };
        if (searchId) where.searchId = searchId;

        const leads = await db.lead.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        return { leads };
    } catch (error) {
        console.error("Failed to get leads:", error);
        return { error: "Impossibile caricare i lead" };
    }
}

/**
 * Delete a single lead
 */
export async function deleteLeadAction(leadId: string): Promise<{ success: boolean; error?: string }> {
    const user = await getAuthUser();
    if (!user) return { success: false, error: "Non autorizzato" };

    try {
        await db.lead.delete({
            where: { id: leadId, companyId: user.company!.id },
        });
        return { success: true };
    } catch (error) {
        console.error("Failed to delete lead:", error);
        return { success: false, error: "Impossibile eliminare il lead" };
    }
}

/**
 * Test WhatsApp Business explicitly via a hello_world template message
 */
export async function testWhatsAppAction(toPhoneNumber: string): Promise<{ success: boolean; message?: string }> {
    const user = await getAuthUser();
    if (!user) return { success: false, message: "Non autorizzato" };

    try {
        const connector = await db.connector.findFirst({
            where: { companyId: user.company!.id, type: 'WHATSAPP' },
        });

        if (!connector || !connector.config) {
            return { success: false, message: "Nessun connettore WhatsApp configurato in Connettori." };
        }

        const config = connector.config as { phoneNumberId?: string; accessToken?: string };
        
        if (!config.phoneNumberId || !config.accessToken) {
            return { success: false, message: "Connettore WhatsApp configurato in modo errato (mancano token/id). " };
        }

        // Clean phone number (remove +, spaces, dashes)
        const cleanNumber = toPhoneNumber.replace(/[\+\s\-]/g, '');

        await sendWhatsAppTemplateMessage(
            config.phoneNumberId,
            config.accessToken,
            cleanNumber,
            'hello_world', // standard pre-approved template for testing
            'en_US'
        );

        return { success: true, message: "Messaggio hello_world inviato con successo! Controlla lo smartphone." };
    } catch (error: any) {
        console.error("Failed to test WhatsApp:", error);
        return { success: false, message:  error.message || "Errore sconosciuto durante l'invio." };
    }
}

/**
 * Delete a lead search and its leads
 */
export async function deleteLeadSearchAction(searchId: string): Promise<{ success: boolean; error?: string }> {
    const user = await getAuthUser();
    if (!user) return { success: false, error: "Non autorizzato" };

    try {
        await db.lead.deleteMany({ where: { searchId, companyId: user.company!.id } });
        await db.leadSearch.delete({ where: { id: searchId, companyId: user.company!.id } });
        return { success: true };
    } catch (error) {
        console.error("Failed to delete lead search:", error);
        return { success: false, error: "Impossibile eliminare la ricerca" };
    }
}

// ============ API TEST + QUOTA ============

type ApiTestResult = {
    success: boolean;
    message: string;
    quota?: {
        used: number;
        available: number;
        plan: string;
        resetDate?: string;
        extra?: string;
    };
};

/**
 * Test Apollo.io API key using the official health endpoint
 * Docs: https://docs.apollo.io/docs/test-api-key
 */
export async function testApolloApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API key mancante' };
    try {
        // Step 1: Test key validity via official health endpoint
        const healthRes = await fetch('https://api.apollo.io/v1/auth/health', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': apiKey.trim(),
            },
        });

        if (healthRes.status === 401 || healthRes.status === 403) {
            return { success: false, message: 'API key non valida o scaduta.' };
        }

        if (!healthRes.ok) {
            const errData = await healthRes.json().catch(() => ({}));
            return { success: false, message: `Errore Apollo: ${errData.message || errData.error || healthRes.statusText}` };
        }

        const healthData = await healthRes.json();
        const isReady = healthData.is_logged_in === true;

        if (!isReady) {
            return { success: false, message: 'API key non attiva. Verifica il tuo account Apollo.' };
        }

        // Step 2: Try a minimal search to get rate limit info
        let creditsInfo: string | undefined;
        let creditsUsed = 0;
        let creditsLimit = 0;
        try {
            const searchRes = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                    'X-Api-Key': apiKey.trim(),
                },
                body: JSON.stringify({ page: 1, per_page: 1, person_titles: ['CEO'] }),
            });

            if (searchRes.ok) {
                creditsUsed = parseInt(searchRes.headers.get('x-rate-limit-24h-used') || '0', 10);
                creditsLimit = parseInt(searchRes.headers.get('x-rate-limit-24h-limit') || '0', 10);
                const searchData = await searchRes.json();
                if (searchData.credits_used != null) {
                    creditsInfo = `${searchData.credits_used} crediti usati in questa richiesta`;
                } else if (creditsLimit > 0) {
                    creditsInfo = `${creditsUsed}/${creditsLimit} crediti usati (24h)`;
                }
            }
        } catch { /* ignore - quota info is optional */ }

        return {
            success: true,
            message: 'Connessione riuscita! API key Apollo valida.',
            quota: creditsInfo ? {
                used: creditsUsed,
                available: creditsLimit > 0 ? creditsLimit - creditsUsed : 0,
                plan: 'Apollo.io',
                extra: creditsInfo,
            } : undefined,
        };
    } catch (error: any) {
        console.error('Apollo test error:', error);
        return { success: false, message: error.message || 'Errore di connessione.' };
    }
}

/**
 * Test Hunter.io API key and get quota
 */
export async function testHunterApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API key mancante' };
    try {
        const res = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(apiKey.trim())}`);

        if (res.status === 401) {
            return { success: false, message: 'API key non valida.' };
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return { success: false, message: `Errore Hunter: ${errData.errors?.[0]?.details || res.statusText}` };
        }

        const data = await res.json();
        const account = data.data;
        const calls = account.calls || {};
        const verifications = account.verifications || {};

        return {
            success: true,
            message: `Connessione riuscita! Account: ${account.email || 'N/A'}`,
            quota: {
                used: calls.used || 0,
                available: calls.available || 0,
                plan: `Hunter.io ${account.plan_name || 'Free'}`,
                resetDate: account.reset_date || undefined,
                extra: `Verifiche: ${verifications.used || 0}/${(verifications.used || 0) + (verifications.available || 0)}`,
            },
        };
    } catch (error: any) {
        console.error('Hunter test error:', error);
        return { success: false, message: error.message || 'Errore di connessione.' };
    }
}

/**
 * Test SerpApi API key and get quota
 */
export async function testSerpApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API key mancante' };
    try {
        const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey.trim())}`);

        if (res.status === 401) {
            return { success: false, message: 'API key non valida.' };
        }

        if (!res.ok) {
            return { success: false, message: `Errore SerpApi: ${res.statusText}` };
        }

        const data = await res.json();
        const searchesLeft = data.total_searches_left ?? data.plan_searches_left ?? 0;
        const totalSearches = data.this_month_usage ?? 0;

        return {
            success: true,
            message: `Connessione riuscita! Account: ${data.account_email || 'N/A'}`,
            quota: {
                used: totalSearches,
                available: searchesLeft,
                plan: `SerpApi ${data.plan_name || 'Free'}`,
                extra: `${searchesLeft} ricerche rimanenti`,
            },
        };
    } catch (error: any) {
        console.error('SerpApi test error:', error);
        return { success: false, message: error.message || 'Errore di connessione.' };
    }
}

/**
 * Test Apify API key and get quota
 */
export async function testApifyApiKeyAction(apiKey: string): Promise<ApiTestResult> {
    if (!apiKey?.trim()) return { success: false, message: 'API token mancante' };
    try {
        const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(apiKey.trim())}`);

        if (res.status === 401) {
            return { success: false, message: 'API token non valido.' };
        }

        if (!res.ok) {
            return { success: false, message: `Errore Apify: ${res.statusText}` };
        }

        const data = await res.json();
        const plan = data.data?.plan || data.plan || {};
        const planDesc = plan.description || plan.id || 'Free';
        const monthlyCreditsUsd = plan.monthlyUsageCreditsUsd || 5;

        // Try to get monthly usage
        let usageUsd = 0;
        try {
            const usageRes = await fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${encodeURIComponent(apiKey.trim())}`);
            if (usageRes.ok) {
                const usageData = await usageRes.json();
                usageUsd = usageData.data?.usageTotalUsd || usageData.usageTotalUsd || 0;
            }
        } catch { /* ignore usage fetch failure */ }

        const remainingUsd = Math.max(0, monthlyCreditsUsd - usageUsd);

        return {
            success: true,
            message: `Connessione riuscita! Username: ${data.data?.username || data.username || 'N/A'}`,
            quota: {
                used: Math.round(usageUsd * 100) / 100,
                available: Math.round(remainingUsd * 100) / 100,
                plan: `Apify ${planDesc}`,
                extra: `$${usageUsd.toFixed(2)} / $${monthlyCreditsUsd.toFixed(2)} usati questo mese`,
            },
        };
    } catch (error: any) {
        console.error('Apify test error:', error);
        return { success: false, message: error.message || 'Errore di connessione.' };
    }
}

/**
 * Get lead stats for the company
 */
export async function getLeadStatsAction(): Promise<{
    stats?: { totalLeads: number; totalSearches: number; bySource: Record<string, number> };
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const companyId = user.company!.id;
        const [totalLeads, totalSearches, leads] = await Promise.all([
            db.lead.count({ where: { companyId } }),
            db.leadSearch.count({ where: { companyId } }),
            db.lead.findMany({ where: { companyId }, select: { source: true } }),
        ]);

        const bySource: Record<string, number> = {};
        for (const lead of leads) {
            const src = lead.source || 'unknown';
            bySource[src] = (bySource[src] || 0) + 1;
        }

        return { stats: { totalLeads, totalSearches, bySource } };
    } catch (error) {
        console.error("Failed to get lead stats:", error);
        return { error: "Impossibile caricare le statistiche" };
    }
}

/**
 * Send email to a lead using the company's SMTP connector
 */
export async function sendLeadEmailAction(params: {
    to: string;
    subject: string;
    htmlBody: string;
}): Promise<{ success: boolean; error?: string }> {
    const user = await getAuthUser();
    if (!user) return { success: false, error: "Non autorizzato" };

    try {
        // Find the company's SMTP connector
        const connector = await db.connector.findFirst({
            where: { companyId: user.company!.id, type: 'SMTP' },
        });

        if (!connector) {
            return { success: false, error: 'Nessun connettore SMTP configurato. Vai in Impostazioni → Connettori per configurarne uno.' };
        }

        let conf;
        try {
            conf = JSON.parse(connector.config);
        } catch {
            return { success: false, error: 'Configurazione SMTP non valida.' };
        }

        const transporter = nodemailer.createTransport({
            host: conf.host,
            port: parseInt(conf.port) || 587,
            secure: parseInt(conf.port) === 465,
            auth: { user: conf.user, pass: conf.password },
            tls: { rejectUnauthorized: process.env.NODE_ENV !== 'production' },
        });

        await transporter.sendMail({
            from: conf.from || conf.user,
            to: params.to,
            subject: params.subject,
            html: params.htmlBody,
        });

        return { success: true };
    } catch (error: any) {
        console.error('Send lead email error:', error);
        return { success: false, error: `Errore invio: ${error.message}` };
    }
}

/**
 * Get API credit balance for lead generation providers
 */
type ProviderCredits = { used: number; available: number; remaining: number };

export async function getLeadGenApiCreditsAction(): Promise<{
    credits?: Record<string, ProviderCredits>;
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const company = await db.company.findUnique({
            where: { id: user.company!.id },
            select: { leadGenApiKeys: true },
        });
        const keys = (company?.leadGenApiKeys as any) || {};
        const credits: Record<string, ProviderCredits> = {};

        // Run all provider checks in parallel for speed
        const checks: Promise<void>[] = [];

        // ===== HUNTER.IO =====
        if (keys.hunter) {
            checks.push((async () => {
                try {
                    const res = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(keys.hunter)}`);
                    if (res.ok) {
                        const data = await res.json();
                        const r = data.data?.requests || {};
                        const s = r.searches || {};
                        const v = r.verifications || {};
                        credits.hunter = { used: s.used ?? 0, available: s.available ?? 0, remaining: Math.max(0, (s.available ?? 0) - (s.used ?? 0)) };
                        credits.hunterVerifications = { used: v.used ?? 0, available: v.available ?? 0, remaining: Math.max(0, (v.available ?? 0) - (v.used ?? 0)) };
                    }
                } catch (e) { console.error('Hunter credits check failed:', e); }
            })());
        }

        // ===== APOLLO.IO =====
        // Credits come from response headers on a minimal search (same approach as testApolloApiKeyAction)
        if (keys.apollo) {
            checks.push((async () => {
                try {
                    const res = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': keys.apollo },
                        body: JSON.stringify({ page: 1, per_page: 1, person_titles: ['CEO'] }),
                    });
                    if (res.ok) {
                        const used24h = parseInt(res.headers.get('x-rate-limit-24h-used') || '0', 10);
                        const limit24h = parseInt(res.headers.get('x-rate-limit-24h-limit') || '0', 10);
                        // Also check minutely limits
                        const usedMin = parseInt(res.headers.get('x-rate-limit-minute-used') || '0', 10);
                        const limitMin = parseInt(res.headers.get('x-rate-limit-minute-limit') || '0', 10);
                        // Use 24h limits as the main metric
                        if (limit24h > 0) {
                            credits.apollo = { used: used24h, available: limit24h, remaining: Math.max(0, limit24h - used24h) };
                        } else if (limitMin > 0) {
                            credits.apollo = { used: usedMin, available: limitMin, remaining: Math.max(0, limitMin - usedMin) };
                        } else {
                            // Headers not available but key works
                            credits.apollo = { used: 0, available: -1, remaining: -1 };
                        }
                    } else if (res.status === 401 || res.status === 403) {
                        credits.apollo = { used: 0, available: 0, remaining: 0 }; // key invalid
                    } else {
                        credits.apollo = { used: 0, available: -1, remaining: -1 };
                    }
                } catch (e) {
                    console.error('Apollo credits check failed:', e);
                    credits.apollo = { used: 0, available: -1, remaining: -1 };
                }
            })());
        }

        // ===== VIBE / EXPLORIUM =====
        // Uses GET /v1/credits → allocated_credits, remaining_credits
        if (keys.vibeProspect) {
            checks.push((async () => {
                try {
                    const res = await fetch('https://api.explorium.ai/v1/credits', {
                        headers: { 'api_key': keys.vibeProspect },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const allocated = data.allocated_credits ?? 0;
                        const remaining = data.remaining_credits ?? 0;
                        credits.vibe = { used: allocated > 0 ? allocated - remaining : 0, available: allocated, remaining };
                    } else {
                        credits.vibe = { used: 0, available: -1, remaining: -1 };
                    }
                } catch (e) {
                    console.error('Vibe credits check failed:', e);
                    credits.vibe = { used: 0, available: -1, remaining: -1 };
                }
            })());
        }

        // ===== SERPAPI =====
        if (keys.serpApi) {
            checks.push((async () => {
                try {
                    const res = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(keys.serpApi)}`);
                    if (res.ok) {
                        const data = await res.json();
                        const searchesLeft = data.total_searches_left ?? data.plan_searches_left ?? 0;
                        const thisMonth = data.this_month_usage ?? 0;
                        credits.serpApi = {
                            used: thisMonth,
                            available: searchesLeft + thisMonth,
                            remaining: Math.max(0, searchesLeft),
                        };
                    }
                } catch (e) { console.error('SerpApi credits check failed:', e); }
            })());
        }

        // ===== FIRECRAWL =====
        // Try /v1/team/credits first, then scrape example.com and check headers as fallback
        if (keys.firecrawl) {
            checks.push((async () => {
                try {
                    // Try dedicated credits endpoint first
                    const res = await fetch('https://api.firecrawl.dev/v1/team/credits', {
                        headers: { 'Authorization': `Bearer ${keys.firecrawl}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const remaining = data.remaining_credits ?? data.data?.remaining_credits ?? 0;
                        const limit = data.credits_limit ?? data.data?.credits_limit ?? 0;
                        const used = limit > 0 ? limit - remaining : 0;
                        credits.firecrawl = { used: Math.max(0, used), available: limit > 0 ? limit : remaining, remaining: Math.max(0, remaining) };
                    } else {
                        // Fallback: minimal scrape to read headers
                        const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${keys.firecrawl}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'], onlyMainContent: true, timeout: 10000 }),
                        });
                        const remaining = parseInt(scrapeRes.headers.get('x-credits-remaining') || '0', 10);
                        const used = parseInt(scrapeRes.headers.get('x-credits-used') || '0', 10);
                        if (remaining > 0 || used > 0) {
                            credits.firecrawl = { used, available: used + remaining, remaining };
                        } else {
                            credits.firecrawl = { used: 0, available: -1, remaining: -1 };
                        }
                    }
                } catch (e) {
                    console.error('Firecrawl credits check failed:', e);
                    credits.firecrawl = { used: 0, available: -1, remaining: -1 };
                }
            })());
        }

        // ===== APIFY =====
        if (keys.apify) {
            checks.push((async () => {
                try {
                    // Get plan info + monthly usage in parallel
                    const [userRes, usageRes] = await Promise.all([
                        fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(keys.apify)}`),
                        fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${encodeURIComponent(keys.apify)}`),
                    ]);
                    let monthlyLimit = 5; // default $5 free plan
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        monthlyLimit = userData.data?.plan?.monthlyUsageCreditsUsd || 5;
                    }
                    let usageUsd = 0;
                    if (usageRes.ok) {
                        const usageData = await usageRes.json();
                        usageUsd = usageData.data?.usageTotalUsd || usageData.usageTotalUsd || 0;
                    }
                    // Store as cents for integer display
                    credits.apify = {
                        used: Math.round(usageUsd * 100),
                        available: Math.round(monthlyLimit * 100),
                        remaining: Math.round(Math.max(0, monthlyLimit - usageUsd) * 100),
                    };
                } catch (e) {
                    console.error('Apify credits check failed:', e);
                    credits.apify = { used: 0, available: -1, remaining: -1 };
                }
            })());
        }

        // Wait for all checks to complete
        await Promise.all(checks);

        return { credits };
    } catch (error) {
        console.error("Failed to get lead gen API credits:", error);
        return { error: "Impossibile caricare i crediti API" };
    }
}

/**
 * Generate a personalized email for a lead using AI
 */
export async function generateLeadEmailAction(leadId: string): Promise<{
    subject?: string;
    body?: string;
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        // Get lead data
        const lead = await db.lead.findFirst({
            where: { id: leadId, companyId: user.company!.id },
        });
        if (!lead) return { error: "Lead non trovato" };

        // AI Provider is dynamically loaded below

        // Get sender and company info
        const companyName = user.company!.name || 'la nostra azienda';
        const senderName = user.name || '';
        const senderEmail = user.email || '';

        const leadName = lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'il contatto';
        const leadInfo = [
            lead.jobTitle && `Ruolo: ${lead.jobTitle}`,
            lead.companyName && `Azienda: ${lead.companyName}`,
            lead.companyIndustry && `Settore: ${lead.companyIndustry}`,
            lead.companyCity && `Citta': ${lead.companyCity}`,
            lead.companyCountry && `Paese: ${lead.companyCountry}`,
            lead.companySize && `Dimensione: ${lead.companySize} dipendenti`,
            lead.companyWebsite && `Sito: ${lead.companyWebsite}`,
            lead.notes && `Note: ${lead.notes}`,
            (lead as any).revenueYear3 && `Fatturato ultimo anno: ${(lead as any).revenueYear3}`,
        ].filter(Boolean).join('\n');

        const prompt = `Sei un esperto di cold email B2B. Genera un'email personalizzata.

CHI MANDA L'EMAIL:
- Nome: ${senderName || 'N/A'}
- Email: ${senderEmail}
- Azienda: ${companyName}

A CHI E' DIRETTA:
- Nome: ${leadName}
${leadInfo}

REGOLE:
- Scrivi in italiano
- L'email deve essere un GANCIO: breve, diretta, personalizzata
- Riferisciti specificamente alla loro azienda, settore e ruolo
- Proponi valore concreto basato su chi sono loro e cosa fa "${companyName}"
- Max 5-6 righe nel corpo, tono professionale ma umano
- NON usare frasi generiche tipo "mi permetto di contattarLa"
- Includi una call to action specifica (breve call, demo, ecc.)
- La prima riga deve catturare l'attenzione riferendosi a qualcosa di specifico del lead
- Firma l'email con il nome del mittente${senderName ? ` (${senderName})` : ''} e l'azienda (${companyName})

Rispondi SOLO in questo formato JSON esatto:
{"subject": "oggetto email", "body": "corpo email (usa \\n per a capo)"}`;

        const { getAiProviderAction } = await import('@/actions/ai-settings');
        const { provider, claudeCliModel } = await getAiProviderAction();

        let text = '';

        if (provider === 'claude-cli') {
            const { runClaudeCliSync } = await import('@/ai/providers/claude-cli-provider');
            const result = await runClaudeCliSync({
                model: claudeCliModel || 'claude-sonnet-4-6',
                systemPrompt: "Rispondi SOLO in formato JSON.",
                userPrompt: prompt,
            });
            text = result.text || '';
        } else {
            // Get user's OpenRouter API key
            const apiKey = (user as any).openRouterApiKey;
            if (!apiKey) return { error: "Configura la API key OpenRouter nelle Impostazioni per generare l'email con questo provider." };

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: (user as any).openRouterModel || 'google/gemini-2.0-flash-001',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 500,
                }),
            });

            if (!response.ok) {
                const err = await response.text();
                return { error: `Errore AI: ${err}` };
            }

            const data = await response.json();
            text = data.choices?.[0]?.message?.content || '';
        }

        // Parse JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*"subject"[\s\S]*"body"[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return { subject: parsed.subject, body: parsed.body };
            } catch {
                // If JSON parse fails, try to extract manually
            }
        }

        // Fallback: use raw text
        return { subject: `Proposta per ${lead.companyName || leadName}`, body: text };
    } catch (error: any) {
        console.error('Generate lead email error:', error);
        return { error: `Errore generazione: ${error.message}` };
    }
}
