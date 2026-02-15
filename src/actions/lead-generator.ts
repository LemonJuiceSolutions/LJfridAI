'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import nodemailer from 'nodemailer';

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
    keys: { apollo?: string; hunter?: string; serpApi?: string; apify?: string }
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
    keys?: { apollo?: string; hunter?: string; serpApi?: string; apify?: string };
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
 * Get all lead searches for the company
 */
export async function getLeadSearchesAction(): Promise<{
    searches?: any[];
    error?: string;
}> {
    const user = await getAuthUser();
    if (!user) return { error: "Non autorizzato" };

    try {
        const searches = await db.leadSearch.findMany({
            where: { companyId: user.company!.id },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { leads: true } } },
        });
        return { searches };
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
            tls: { rejectUnauthorized: false },
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

        // Get user's OpenRouter API key
        const apiKey = (user as any).openRouterApiKey;
        if (!apiKey) return { error: "Configura la API key OpenRouter nelle Impostazioni." };

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
        const text = data.choices?.[0]?.message?.content || '';

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
