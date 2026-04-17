/**
 * Upload content validation — magic-byte sniffing to block polyglot files
 * (HTML/JS disguised as .png, etc.). Pure functions for testability.
 */

/**
 * Sniff actual file type from magic bytes. Returns the MIME string for known
 * signatures or null if no known magic bytes are detected.
 */
export function detectMagicType(buf: Buffer): string | null {
    if (buf.length < 4) return null;
    const b = buf;
    // JPEG: FF D8 FF
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    // PNG: 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    // GIF: "GIF"
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    // WEBP: "RIFF" ... "WEBP"
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b.length >= 12 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    // PDF: "%PDF-"
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
    // ZIP / OOXML: "PK\x03\x04"
    if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'application/zip';
    // OLE/CFBF (xls/doc legacy): D0 CF 11 E0
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'application/vnd.ms-office';
    // MP4/M4V "ftyp" at offset 4
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';
    // WebM/Matroska: 1A 45 DF A3
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
    // MP3: "ID3" or FF Fx
    if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) ||
        (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    return null;
}

const TEXT_TYPES = new Set(['text/csv', 'text/plain', 'text/markdown', 'application/json']);

/**
 * Check declared MIME vs sniffed magic bytes. Text formats have no magic
 * signature, so we reject only if the first KB looks like HTML/SVG/XML.
 */
export function isMagicCompatible(declared: string, buf: Buffer): boolean {
    const sniffed = detectMagicType(buf);

    if (TEXT_TYPES.has(declared)) {
        const head = buf.slice(0, 1024).toString('utf8').toLowerCase();
        if (head.includes('<!doctype html') || head.includes('<html') ||
            head.includes('<script') || head.includes('<svg') || head.includes('<?xml')) {
            return false;
        }
        return true;
    }

    if (!sniffed) return false;

    // OOXML containers (docx/xlsx/pptx) are ZIP under the hood.
    if (sniffed === 'application/zip' && (
        declared.startsWith('application/vnd.openxmlformats-officedocument') ||
        declared === 'application/zip' ||
        declared === 'application/x-zip-compressed'
    )) return true;

    if (sniffed === 'application/vnd.ms-office' && (
        declared === 'application/vnd.ms-excel' ||
        declared === 'application/msword'
    )) return true;

    return declared.startsWith(sniffed.split('/')[0]) || declared === sniffed;
}
