import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transcribeAudioWithGroq } from '@/lib/groq-whisper';
import { downloadWhatsAppMedia } from '@/lib/whatsapp-send';

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
                userText = await transcribeAudioWithGroq(buffer, filename);
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

