/**
 * WhatsApp Business API messaging helper.
 * Sends text messages via Meta Graph API v22.
 */

const GRAPH_API_VERSION = 'v22.0';

export async function sendWhatsAppMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string
): Promise<void> {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body: text },
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            `WhatsApp send error ${response.status}: ${errorData?.error?.message || response.statusText}`
        );
    }
}

/**
 * Sends a WhatsApp template message (required to initiate outside of 24h window).
 */
export async function sendWhatsAppTemplateMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string = 'hello_world',
    languageCode: string = 'en_US'
): Promise<void> {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode
                }
            }
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
            `WhatsApp template send error ${response.status}: ${errorData?.error?.message || response.statusText}`
        );
    }
}

/**
 * Downloads a media file from Meta's CDN using a media ID.
 * Returns the file as a Buffer.
 */
export async function downloadWhatsAppMedia(
    mediaId: string,
    accessToken: string
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    // Step 1: Get the download URL
    const urlRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!urlRes.ok) {
        throw new Error(`Failed to get media URL for ${mediaId}: ${urlRes.statusText}`);
    }

    const urlData = await urlRes.json();
    const downloadUrl: string = urlData.url;
    const mimeType: string = urlData.mime_type || 'audio/ogg';

    // Step 2: Download the actual file
    const fileRes = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!fileRes.ok) {
        throw new Error(`Failed to download media: ${fileRes.statusText}`);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine extension from mime type
    const ext = mimeType.includes('ogg') ? 'ogg'
        : mimeType.includes('mp4') ? 'mp4'
        : mimeType.includes('mpeg') ? 'mp3'
        : mimeType.includes('webm') ? 'webm'
        : 'ogg';

    return { buffer, mimeType, filename: `audio_${mediaId}.${ext}` };
}
