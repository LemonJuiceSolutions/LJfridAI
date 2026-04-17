/**
 * PII redaction for outbound LLM prompts.
 *
 * GDPR + data minimization: prevents leaking customer email/phone/CF/IBAN/IP
 * to OpenRouter / Anthropic / Google / etc. when SQL agent / Super agent
 * embed live DB rows in prompts.
 *
 * Apply at the boundary BEFORE any fetch() to a third-party LLM provider.
 *
 * Strategy:
 * - String pass: regex replace EU email, IT mobile/landline, IBAN, IT CF,
 *   partita IVA, IPv4, credit-card-like 13-19 digit runs.
 * - Row pass: detect PII columns by header name, replace cell values.
 *
 * Toggle per-company via the future "Strict anonymization mode" setting.
 * For now applied unconditionally to outbound prompts.
 */
import "server-only";

// ─── Patterns ────────────────────────────────────────────────────────────────

const PATTERNS: { name: string; re: RegExp; tag: string }[] = [
    {
        name: "email",
        re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        tag: "<redacted:email>",
    },
    {
        name: "iban",
        // IBAN: 2-letter country + 2 check digits + up to 30 alphanumerics
        re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
        tag: "<redacted:iban>",
    },
    {
        name: "codice-fiscale-it",
        // Italian CF: 6 letters + 2 digits + 1 letter + 2 digits + 1 letter + 3 digits + 1 letter
        re: /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi,
        tag: "<redacted:codice-fiscale>",
    },
    {
        name: "italian-phone",
        // IT mobile +39 3xx xxxxxxx or landline +39 0xx xxxxxxxx
        re: /(?:\+?39[\s.-]?)?(?:3\d{2}|0\d{1,3})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g,
        tag: "<redacted:phone>",
    },
    {
        name: "credit-card",
        // 13-19 digit runs separated by optional spaces/dashes
        re: /\b(?:\d[ -]*?){13,19}\b/g,
        tag: "<redacted:card>",
    },
    {
        name: "ipv4",
        re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
        tag: "<redacted:ip>",
    },
];

// ─── String redaction ────────────────────────────────────────────────────────

/**
 * Redact PII patterns from a single string.
 * Order matters: longest/most-specific patterns first to avoid partial matches.
 */
export function redactPII(text: string): string {
    if (!text || typeof text !== "string") return text;
    let out = text;
    for (const { re, tag } of PATTERNS) {
        out = out.replace(re, tag);
    }
    return out;
}

// ─── Row / object redaction ─────────────────────────────────────────────────

/**
 * Column name patterns that indicate the cell value is PII regardless of
 * whether the value matches a regex (e.g. names, addresses).
 */
const PII_COLUMN_PATTERNS: { re: RegExp; tag: string }[] = [
    { re: /\b(email|e-?mail|mail)\b/i, tag: "<redacted:email>" },
    { re: /\b(phone|tel|telefono|mobile|cellulare)\b/i, tag: "<redacted:phone>" },
    { re: /\b(name|nome|cognome|surname|fullname|nominativo)\b/i, tag: "<redacted:name>" },
    { re: /\b(address|indirizzo|via|street|cap|zip|postal)\b/i, tag: "<redacted:address>" },
    { re: /\b(cf|codice.?fiscale|fiscalcode|tax.?id)\b/i, tag: "<redacted:codice-fiscale>" },
    { re: /\b(piva|p.?iva|partita.?iva|vat)\b/i, tag: "<redacted:vat>" },
    { re: /\b(iban|bic|swift)\b/i, tag: "<redacted:iban>" },
    { re: /\b(card|cardnumber|pan|cvv)\b/i, tag: "<redacted:card>" },
];

function isPIIColumn(columnName: string): { match: boolean; tag: string } {
    for (const { re, tag } of PII_COLUMN_PATTERNS) {
        if (re.test(columnName)) return { match: true, tag };
    }
    return { match: false, tag: "" };
}

/**
 * Redact PII from an array of result rows (from SQL queries).
 * Replaces cell values for known PII columns; runs string redaction on
 * remaining string values.
 */
export function redactRows<T extends Record<string, any>>(rows: T[]): T[] {
    if (!Array.isArray(rows) || rows.length === 0) return rows;

    return rows.map(row => {
        const out: any = {};
        for (const [key, value] of Object.entries(row)) {
            const piiCheck = isPIIColumn(key);
            if (piiCheck.match && value != null) {
                out[key] = piiCheck.tag;
            } else if (typeof value === "string") {
                out[key] = redactPII(value);
            } else {
                out[key] = value;
            }
        }
        return out as T;
    });
}

// ─── High-level wrapper ─────────────────────────────────────────────────────

/**
 * Redact PII from a generic payload (string / array / nested object) before
 * sending to an external LLM. Walks recursively.
 */
export function redactForLLM(payload: any): any {
    if (payload == null) return payload;
    if (typeof payload === "string") return redactPII(payload);
    if (Array.isArray(payload)) {
        // If looks like rows (objects with same shape), use row redaction
        if (payload.length > 0 && typeof payload[0] === "object" && !Array.isArray(payload[0])) {
            return redactRows(payload as any);
        }
        return payload.map(redactForLLM);
    }
    if (typeof payload === "object") {
        const out: any = {};
        for (const [k, v] of Object.entries(payload)) {
            out[k] = redactForLLM(v);
        }
        return out;
    }
    return payload;
}

// ─── Toggle (env-gated) ─────────────────────────────────────────────────────

/** Master switch — disable redaction by setting LLM_PII_REDACT=false (default: enabled). */
export function isRedactionEnabled(): boolean {
    return process.env.LLM_PII_REDACT !== "false";
}

/** Conditional helper — call this from LLM callsites. */
export function maybeRedact<T>(payload: T): T {
    if (!isRedactionEnabled()) return payload;
    return redactForLLM(payload);
}
