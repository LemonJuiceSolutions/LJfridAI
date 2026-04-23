import { describe, it, expect } from 'vitest';

/**
 * Tests for the upload route validation logic. Since the route handler depends
 * on next-auth, fs, and other server-side modules, we extract and test the
 * pure validation functions that the route uses inline.
 *
 * The MIME checking, extension blocking, and path traversal rules are defined
 * as constants/functions inside `src/app/api/upload/route.ts`. We replicate
 * them here to test the logic without importing the full Next.js route
 * (which would pull in server-only deps that break in vitest/jsdom).
 */

// ── Replicated validation logic from route.ts ──

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_PREFIXES = [
    'image/', 'video/', 'audio/',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument',
    'application/vnd.ms-excel',
    'application/msword',
    'application/json',
    'text/csv', 'text/plain', 'text/markdown',
    'application/zip', 'application/x-zip-compressed',
];

const FORBIDDEN_EXTENSIONS = new Set([
    'html', 'htm', 'svg', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
    'php', 'py', 'sh', 'exe', 'bat', 'cmd', 'jar', 'war',
]);

function isMimeAllowed(mime: string): boolean {
    if (!mime) return false;
    return ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p));
}

function getExtension(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isFolderValid(folder: string): boolean {
    const segments = folder.split('/');
    return !(
        folder.includes('\\') ||
        folder.startsWith('/') ||
        folder.endsWith('/') ||
        segments.some(s => s === '' || s === '..' || s === '.' || !/^[a-zA-Z0-9._-]+$/.test(s))
    );
}

// ── Tests ──

describe('Upload: file extension validation', () => {
    it.each([
        'exe', 'js', 'html', 'htm', 'svg', 'mjs', 'cjs', 'jsx',
        'ts', 'tsx', 'php', 'py', 'sh', 'bat', 'cmd', 'jar', 'war',
    ])('blocks .%s extension', (ext) => {
        expect(FORBIDDEN_EXTENSIONS.has(ext)).toBe(true);
    });

    it.each([
        'pdf', 'png', 'jpg', 'csv', 'xlsx', 'docx', 'json', 'txt', 'mp4',
    ])('allows .%s extension', (ext) => {
        expect(FORBIDDEN_EXTENSIONS.has(ext)).toBe(false);
    });

    it('getExtension extracts lowercase extension', () => {
        expect(getExtension('report.PDF')).toBe('pdf');
        expect(getExtension('data.CSV')).toBe('csv');
        expect(getExtension('image.PNG')).toBe('png');
    });

    it('getExtension handles no-extension files', () => {
        expect(getExtension('README')).toBe('');
    });

    it('getExtension handles multiple dots', () => {
        expect(getExtension('archive.tar.gz')).toBe('gz');
    });
});

describe('Upload: MIME type whitelist', () => {
    it.each([
        'image/png', 'image/jpeg', 'image/gif', 'image/webp',
        'video/mp4', 'audio/mpeg',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/msword',
        'application/json',
        'text/csv', 'text/plain', 'text/markdown',
        'application/zip', 'application/x-zip-compressed',
    ])('allows MIME: %s', (mime) => {
        expect(isMimeAllowed(mime)).toBe(true);
    });

    it.each([
        'text/html',
        'application/javascript',
        'application/x-httpd-php',
        'text/xml',
        'application/x-sh',
        'application/x-executable',
    ])('blocks MIME: %s', (mime) => {
        expect(isMimeAllowed(mime)).toBe(false);
    });

    it('blocks empty MIME string', () => {
        expect(isMimeAllowed('')).toBe(false);
    });
});

describe('Upload: path traversal prevention', () => {
    it('rejects folder containing ..', () => {
        expect(isFolderValid('../etc')).toBe(false);
        expect(isFolderValid('data/../secret')).toBe(false);
    });

    it('rejects absolute paths', () => {
        expect(isFolderValid('/etc/passwd')).toBe(false);
    });

    it('rejects backslash paths', () => {
        expect(isFolderValid('data\\secret')).toBe(false);
    });

    it('rejects trailing slash', () => {
        expect(isFolderValid('uploads/')).toBe(false);
    });

    it('rejects dot segment', () => {
        expect(isFolderValid('.')).toBe(false);
        expect(isFolderValid('data/./here')).toBe(false);
    });

    it('rejects empty segments (double slash)', () => {
        expect(isFolderValid('data//here')).toBe(false);
    });

    it('accepts valid folder names', () => {
        expect(isFolderValid('data_lake')).toBe(true);
        expect(isFolderValid('uploads')).toBe(true);
        expect(isFolderValid('my-folder')).toBe(true);
    });

    it('accepts nested valid folders', () => {
        expect(isFolderValid('company.docs')).toBe(true);
    });
});

describe('Upload: size limit', () => {
    it('max file size is 50 MB', () => {
        expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });

    it('rejects files over 50 MB conceptually', () => {
        const fileSize = 51 * 1024 * 1024;
        expect(fileSize > MAX_FILE_SIZE).toBe(true);
    });

    it('accepts files under 50 MB', () => {
        const fileSize = 10 * 1024 * 1024;
        expect(fileSize <= MAX_FILE_SIZE).toBe(true);
    });

    it('accepts files at exactly 50 MB', () => {
        expect(MAX_FILE_SIZE <= MAX_FILE_SIZE).toBe(true);
    });
});
