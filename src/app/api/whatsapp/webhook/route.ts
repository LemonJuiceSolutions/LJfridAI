import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { transcribeAudioWithGroq } from '@/lib/groq-whisper';
import { downloadWhatsAppMedia } from '@/lib/whatsapp-send';

export const maxDuration = 60;

/**
 * Verify Meta's X-Hub-Signature-256 HMAC against the App Secret.
 * Returns true if signature matches the raw body, false otherwise.
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
    if (!signatureHeader || !appSecret) return false;
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    try {
        const a = Buffer.from(signatureHeader);
        const b = Buffer.from(expected);
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

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
    // SECURITY CRITICAL: read raw body for HMAC verification (do not parse first)
    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        return new NextResponse('Bad Request', { status: 400 });
    }

    let body: any;
    try {
        body = JSON.parse(rawBody);
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

    // SECURITY CRITICAL: match connector by phoneNumberId (was findFirst — cross-tenant routing risk)
    const candidates = await db.connector.findMany({
        where: { type: 'WHATSAPP' },
    });
    let connector: typeof candidates[number] | null = null;
    let conf: any = null;
    for (const c of candidates) {
        try {
            const cfg = JSON.parse(c.config);
            if (cfg.phoneNumberId === phoneNumberId) {
                connector = c;
                conf = cfg;
                break;
            }
        } catch { /* skip malformed */ }
    }

    if (!connector || !conf) {
        console.error(`[WhatsApp Webhook] No WHATSAPP connector matches phoneNumberId ${phoneNumberId}`);
        return new NextResponse('OK', { status: 200 });
    }

    // SECURITY CRITICAL: verify Meta HMAC signature against App Secret.
    // Without this, anyone who knows the URL can forge events.
    const appSecret = conf.appSecret || process.env.WHATSAPP_APP_SECRET || '';
    if (appSecret) {
        const sigHeader = request.headers.get('x-hub-signature-256');
        if (!verifyMetaSignature(rawBody, sigHeader, appSecret)) {
            console.warn('[WhatsApp Webhook] Invalid HMAC signature — rejecting');
            return new NextResponse('Forbidden', { status: 403 });
        }
    } else {
        console.warn('[WhatsApp Webhook] No appSecret configured — signature check disabled (set conf.appSecret or WHATSAPP_APP_SECRET)');
    }

    const { accessToken } = conf;

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
            if (mediaId && accessToken && groqApiKey) {
                console.log('[WhatsApp Webhook] Downloading audio media:', mediaId);
                const { buffer, mimeType, filename } = await downloadWhatsAppMedia(mediaId, accessToken);
                console.log('[WhatsApp Webhook] Transcribing audio with Groq Whisper...');
                userText = await transcribeAudioWithGroq(buffer, filename, 'it', groqApiKey);
                console.log('[WhatsApp Webhook] Transcription:', userText);
            } else {
                userText = '[Nota vocale ricevuta]';
            }
        } else {
            userText = `[${message.type || 'media'} ricevuto]`;
        }
    } catch (err: any) {
        console.error('[WhatsApp Webhook] Error processing message:', err.message);
        userText = '[Errore elaborazione messaggio]';
    }

    if (!userText.trim()) {
        return new NextResponse('OK', { status: 200 });
    }

    // ─── Save message to session (log only, no auto-reply) ──────────────────
    try {
        let session = await db.whatsAppSession.findUnique({
            where: { phoneNumber_connectorId: { phoneNumber: from, connectorId: connector.id } },
        });

        const msgEntry = { role: 'user', content: userText, timestamp: new Date().toISOString() };

        if (session) {
            const msgs: any[] = Array.isArray(session.messages) ? session.messages : [];
            msgs.push(msgEntry);
            await db.whatsAppSession.update({
                where: { id: session.id },
                data: { messages: msgs },
            });
        } else {
            await db.whatsAppSession.create({
                data: {
                    phoneNumber: from,
                    connectorId: connector.id,
                    companyId: connector.companyId,
                    messages: [msgEntry],
                    collectedData: {},
                    status: 'collecting',
                },
            });
        }

        console.log(`[WhatsApp Webhook] Message saved from ${from}: "${userText.substring(0, 50)}"`);
    } catch (err: any) {
        console.error('[WhatsApp Webhook] Failed to save message:', err.message);
    }

    return new NextResponse('OK', { status: 200 });
}

