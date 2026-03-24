import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transcribeAudioWithGroq } from '@/lib/groq-whisper';
import { sendWhatsAppMessage, downloadWhatsAppMedia } from '@/lib/whatsapp-send';

export const maxDuration = 60;

// ─── GET: Meta webhook verification ─────────────────────────────────────────
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
        return new NextResponse('Bad Request', { status: 400 });
    }

    // Find a WhatsApp connector with this verify token
    const connector = await db.connector.findFirst({
        where: { type: 'WHATSAPP' },
    });

    if (!connector) {
        console.warn('[WhatsApp Webhook] No WHATSAPP connector found during verification');
        return new NextResponse('Forbidden', { status: 403 });
    }

    let conf: any = {};
    try { conf = JSON.parse(connector.config); } catch { /* ignore */ }

    if (conf.verifyToken !== token) {
        console.warn('[WhatsApp Webhook] Verify token mismatch');
        return new NextResponse('Forbidden', { status: 403 });
    }

    console.log('[WhatsApp Webhook] ✅ Webhook verified!');
    return new NextResponse(challenge, { status: 200 });
}

// ─── POST: Receive messages ──────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return new NextResponse('Bad Request', { status: 400 });
    }

    // Meta sends an array of entry changes
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const messages = change?.messages;

    if (!messages || messages.length === 0) {
        return new NextResponse('OK', { status: 200 });
    }

    const message = messages[0];
    const from: string = message.from; // sender phone number
    const phoneNumberId: string = change?.metadata?.phone_number_id;

    if (!from || !phoneNumberId) {
        return new NextResponse('OK', { status: 200 });
    }

    // Find the matching WHATSAPP connector
    const connector = await db.connector.findFirst({
        where: { type: 'WHATSAPP' },
    });

    if (!connector) {
        console.error('[WhatsApp Webhook] No WHATSAPP connector found');
        return new NextResponse('OK', { status: 200 });
    }

    let conf: any = {};
    try { conf = JSON.parse(connector.config); } catch {
        return new NextResponse('OK', { status: 200 });
    }

    const { accessToken, hubspotConnectorId } = conf;

    // Load Groq key: prefer company DB setting, fallback to env
    const company = await db.company.findUnique({
        where: { id: connector.companyId },
        select: { leadGenApiKeys: true },
    });
    const companyKeys = (company?.leadGenApiKeys as any) || {};
    const groqApiKey = companyKeys.groq || process.env.GROQ_API_KEY || '';

    // ─── Extract text from message ──────────────────────────────────────────
    let userText = '';

    try {
        if (message.type === 'text') {
            userText = message.text?.body || '';
        } else if (message.type === 'audio') {
            const mediaId = message.audio?.id;
            if (mediaId && accessToken) {
                console.log('[WhatsApp Webhook] Downloading audio media:', mediaId);
                const { buffer, mimeType, filename } = await downloadWhatsAppMedia(mediaId, accessToken);
                console.log('[WhatsApp Webhook] Transcribing audio with Groq Whisper...');
                userText = await transcribeAudioWithGroq(buffer, filename);
                console.log('[WhatsApp Webhook] Transcription:', userText);
            }
        } else {
            // Unsupported message type
            await sendWhatsAppMessage(phoneNumberId, accessToken, from, 
                'Ciao! Posso ricevere solo messaggi di testo o note vocali. 🎙️');
            return new NextResponse('OK', { status: 200 });
        }
    } catch (err: any) {
        console.error('[WhatsApp Webhook] Error processing message:', err.message);
        await sendWhatsAppMessage(phoneNumberId, accessToken, from,
            'Si è verificato un errore durante l\'elaborazione del messaggio. Riprova tra poco.');
        return new NextResponse('OK', { status: 200 });
    }

    if (!userText.trim()) {
        return new NextResponse('OK', { status: 200 });
    }

    // ─── Load or create session ─────────────────────────────────────────────
    let session = await db.whatsAppSession.findUnique({
        where: { phoneNumber_connectorId: { phoneNumber: from, connectorId: connector.id } },
    });

    if (!session) {
        session = await db.whatsAppSession.create({
            data: {
                phoneNumber: from,
                connectorId: connector.id,
                companyId: connector.companyId,
                messages: [],
                collectedData: {},
                status: 'collecting',
            },
        });
    }

    // Add user message to history
    const messages_history: any[] = Array.isArray(session.messages) ? session.messages : [];
    messages_history.push({ role: 'user', content: userText, timestamp: new Date().toISOString() });

    const collectedData: any = typeof session.collectedData === 'object' ? session.collectedData : {};

    // ─── AI Agent: Extract lead data and decide response ────────────────────
    const { reply, updatedData, isComplete } = await runLeadAgent(
        userText,
        messages_history,
        collectedData,
        hubspotConnectorId,
        connector.companyId
    );

    // Add assistant reply to history
    messages_history.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });

    // Save updated session
    await db.whatsAppSession.update({
        where: { id: session.id },
        data: {
            messages: messages_history,
            collectedData: updatedData,
            status: isComplete ? 'completed' : 'collecting',
        },
    });

    // Send reply on WhatsApp
    await sendWhatsAppMessage(phoneNumberId, accessToken, from, reply);

    return new NextResponse('OK', { status: 200 });
}

// ─── Lead Agent ──────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['firstName', 'lastName', 'companyName', 'email', 'phone'];
const FIELD_QUESTIONS: Record<string, string> = {
    firstName: 'Come ti chiami? (nome)',
    lastName: 'Qual è il tuo cognome?',
    companyName: 'Per quale azienda lavori?',
    email: 'Qual è la tua email?',
    phone: 'Qual è il tuo numero di telefono?',
};

async function runLeadAgent(
    userText: string,
    history: any[],
    collectedData: any,
    hubspotConnectorId: string | undefined,
    companyId: string
): Promise<{ reply: string; updatedData: any; isComplete: boolean }> {

    // Build conversation context for AI
    const historyText = history
        .slice(-10)
        .map((m: any) => `${m.role === 'user' ? 'Utente' : 'Assistente'}: ${m.content}`)
        .join('\n');

    const collectedSummary = Object.entries(collectedData)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');

    const missingFields = REQUIRED_FIELDS.filter(f => !collectedData[f]);

    // Call AI to extract data and compose reply
    const apiKey = process.env.GROQ_API_KEY;
    // Fallback: use OpenRouter if available
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    let updatedData = { ...collectedData };
    let reply = '';
    let isComplete = false;

    try {
        const systemPrompt = `Sei un assistente commerciale che raccoglie informazioni per inserire un lead nel CRM.
Devi estrarre dal messaggio dell'utente le seguenti informazioni se presenti: firstName (nome), lastName (cognome), companyName (azienda), email, phone (telefono), jobTitle (ruolo).
Rispondi SOLO con un JSON in questo formato:
{
  "extracted": { "firstName": "...", "lastName": "...", "companyName": "...", "email": "...", "phone": "...", "jobTitle": "..." },
  "reply": "messaggio amichevole in italiano da inviare all'utente"
}
Dati già raccolti: ${collectedSummary || 'nessuno'}
Campi ancora mancanti: ${missingFields.join(', ')}
Se mancano ancora campi obbligatori (${REQUIRED_FIELDS.join(', ')}), nel reply chiedi SOLO IL PRIMO campo mancante in modo naturale e cordiale.
Se hai tutti i campi obbligatori, nel reply di' all'utente che stai creando il lead e ringrazialo.
Non inventare dati. Estrai solo quello che l'utente ha detto esplicitamente.`;

        const userPrompt = `Storico conversazione:\n${historyText}\n\nUltimo messaggio utente: "${userText}"`;

        // Try Groq API first (also has chat completions)
        let aiResponse: any = null;
        if (apiKey) {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                    max_tokens: 500,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                aiResponse = JSON.parse(data.choices[0]?.message?.content || '{}');
            }
        }

        // Fallback to OpenRouter if Groq failed
        if (!aiResponse && openRouterKey) {
            const user = await db.user.findFirst({ where: { companyId } });
            const orKey = user?.openRouterApiKey || openRouterKey;
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-001',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    response_format: { type: 'json_object' },
                }),
            });
            if (res.ok) {
                const data = await res.json();
                aiResponse = JSON.parse(data.choices[0]?.message?.content || '{}');
            }
        }

        if (aiResponse) {
            // Merge extracted data
            const extracted = aiResponse.extracted || {};
            for (const [key, value] of Object.entries(extracted)) {
                if (value && typeof value === 'string' && value.trim() && value !== 'null') {
                    updatedData[key] = value.trim();
                }
            }
            reply = aiResponse.reply || '';
        }
    } catch (err: any) {
        console.error('[WhatsApp Agent] AI error:', err.message);
    }

    // Fallback reply if AI failed
    if (!reply) {
        const stillMissing = REQUIRED_FIELDS.filter(f => !updatedData[f]);
        if (stillMissing.length > 0) {
            reply = FIELD_QUESTIONS[stillMissing[0]] || 'Puoi fornirmi ulteriori informazioni?';
        } else {
            reply = 'Grazie! Sto creando il tuo profilo nel sistema. Ti ricontatteremo presto! 🎉';
        }
    }

    // Check if all required fields are collected
    const allCollected = REQUIRED_FIELDS.every(f => updatedData[f]);

    if (allCollected) {
        isComplete = true;
        // Create HubSpot lead if connector is configured
        if (hubspotConnectorId) {
            try {
                await createHubSpotContact(updatedData, hubspotConnectorId, companyId);
                console.log('[WhatsApp Agent] ✅ HubSpot contact created for:', updatedData.email);
            } catch (err: any) {
                console.error('[WhatsApp Agent] HubSpot creation failed:', err.message);
                // Don't fail the whole flow — just log
            }
        }
    }

    return { reply, updatedData, isComplete };
}

// ─── HubSpot Contact Creation ────────────────────────────────────────────────

async function createHubSpotContact(data: any, hubspotConnectorId: string, companyId: string): Promise<void> {
    const connector = await db.connector.findFirst({
        where: { id: hubspotConnectorId, companyId, type: 'HUBSPOT' },
    });

    if (!connector) throw new Error('HubSpot connector not found');

    const conf = JSON.parse(connector.config);
    const accessToken = conf.accessToken;

    const properties: Record<string, string> = {
        firstname: data.firstName || '',
        lastname: data.lastName || '',
        company: data.companyName || '',
        email: data.email || '',
        phone: data.phone || '',
        jobtitle: data.jobTitle || '',
        hs_lead_status: 'NEW',
        lifecyclestage: 'lead',
        lead_source: 'WhatsApp',
    };

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || `HubSpot API error: ${response.status}`);
    }
}
