import { describe, it, expect } from 'vitest';
import { detectMagicType, isMagicCompatible } from '@/lib/upload-validation';

function buf(...bytes: number[]): Buffer {
    return Buffer.from(bytes);
}

function textBuf(s: string): Buffer {
    return Buffer.from(s, 'utf8');
}

describe('detectMagicType', () => {
    it('detects JPEG', () => {
        expect(detectMagicType(buf(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    });
    it('detects PNG', () => {
        expect(detectMagicType(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    });
    it('detects GIF', () => {
        expect(detectMagicType(buf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif');
    });
    it('detects WEBP', () => {
        expect(detectMagicType(buf(
            0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
            0x57, 0x45, 0x42, 0x50
        ))).toBe('image/webp');
    });
    it('detects PDF', () => {
        expect(detectMagicType(Buffer.from('%PDF-1.7', 'utf8'))).toBe('application/pdf');
    });
    it('detects ZIP / OOXML', () => {
        expect(detectMagicType(buf(0x50, 0x4b, 0x03, 0x04))).toBe('application/zip');
    });
    it('detects OLE (legacy xls)', () => {
        expect(detectMagicType(buf(0xd0, 0xcf, 0x11, 0xe0))).toBe('application/vnd.ms-office');
    });
    it('detects MP4 ftyp', () => {
        expect(detectMagicType(buf(
            0x00, 0x00, 0x00, 0x20,
            0x66, 0x74, 0x79, 0x70,
            0x69, 0x73, 0x6f, 0x6d
        ))).toBe('video/mp4');
    });
    it('detects WebM/Matroska', () => {
        expect(detectMagicType(buf(0x1a, 0x45, 0xdf, 0xa3))).toBe('video/webm');
    });
    it('detects MP3 via ID3', () => {
        expect(detectMagicType(buf(0x49, 0x44, 0x33, 0x03))).toBe('audio/mpeg');
    });
    it('returns null for unknown', () => {
        expect(detectMagicType(buf(0xde, 0xad, 0xbe, 0xef))).toBeNull();
    });
    it('returns null for short buffer', () => {
        expect(detectMagicType(buf(0x89))).toBeNull();
    });
});

describe('isMagicCompatible', () => {
    describe('binary formats', () => {
        it('accepts declared PNG matching PNG bytes', () => {
            const png = buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
            expect(isMagicCompatible('image/png', png)).toBe(true);
        });

        it('rejects HTML masqueraded as PNG', () => {
            const polyglot = textBuf('<!doctype html><script>alert(1)</script>');
            expect(isMagicCompatible('image/png', polyglot)).toBe(false);
        });

        it('accepts xlsx as OOXML ZIP', () => {
            const zip = buf(0x50, 0x4b, 0x03, 0x04);
            expect(isMagicCompatible(
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                zip,
            )).toBe(true);
        });

        it('accepts legacy xls as OLE', () => {
            const ole = buf(0xd0, 0xcf, 0x11, 0xe0);
            expect(isMagicCompatible('application/vnd.ms-excel', ole)).toBe(true);
        });

        it('rejects declared PDF with JPEG bytes', () => {
            const jpg = buf(0xff, 0xd8, 0xff, 0xe0);
            expect(isMagicCompatible('application/pdf', jpg)).toBe(false);
        });
    });

    describe('text formats', () => {
        it('accepts plain CSV', () => {
            expect(isMagicCompatible('text/csv', textBuf('name,value\nfoo,1\n'))).toBe(true);
        });

        it('accepts plain JSON', () => {
            expect(isMagicCompatible('application/json', textBuf('{"a": 1}'))).toBe(true);
        });

        it('accepts plain text', () => {
            expect(isMagicCompatible('text/plain', textBuf('hello world'))).toBe(true);
        });

        it('rejects HTML disguised as CSV', () => {
            expect(isMagicCompatible('text/csv', textBuf('<!DOCTYPE html><html>x</html>'))).toBe(false);
        });

        it('rejects <script> inside txt', () => {
            expect(isMagicCompatible('text/plain', textBuf('<script>alert(1)</script>'))).toBe(false);
        });

        it('rejects SVG disguised as CSV', () => {
            expect(isMagicCompatible('text/csv', textBuf('<svg xmlns="..."><script>x</script></svg>'))).toBe(false);
        });

        it('rejects XML prolog inside json', () => {
            expect(isMagicCompatible('application/json', textBuf('<?xml version="1.0"?>'))).toBe(false);
        });
    });
});
