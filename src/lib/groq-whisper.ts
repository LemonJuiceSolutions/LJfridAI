/**
 * Groq Whisper audio transcription helper.
 * Uses Groq's OpenAI-compatible API (whisper-large-v3) - free tier.
 * @see https://console.groq.com/docs/speech-text
 */

export async function transcribeAudioWithGroq(
    audioBuffer: Buffer,
    filename: string = 'audio.ogg',
    language: string = 'it'
): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY non configurata. Aggiungila al tuo .env.local (console.groq.com).');
    }

    const formData = new FormData();
    const arrayBuffer = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', language);
    formData.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        throw new Error(`Groq Whisper error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.text?.trim() || '';
}
