/**
 * AES-256-GCM encryption helpers for data at rest.
 *
 * Addresses C-03 (OpenRouter API keys), M-03 (connector credentials),
 * H-05 (lead PII) from 2026-04-14 audit.
 *
 * ## Setup
 *
 * 1. Generate a 32-byte key:
 *    `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 *
 * 2. Add to `.env`:
 *    `ENCRYPTION_KEY=<base64 string>`
 *
 * 3. Keep a rotation plan: to rotate, decrypt all rows with old key, re-encrypt
 *    with new key, then switch env var.
 *
 * ## Format
 *
 * Ciphertext format (base64 of concatenated bytes):
 *   [version (1B)] [iv (12B)] [authTag (16B)] [ciphertext]
 *
 * Version byte lets us migrate algorithms later without breaking old rows.
 * All stored values are prefixed with `enc:v1:` so we can tell apart encrypted
 * from legacy plaintext during migration.
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;
const PREFIX = "enc:v1:";

function getKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "ENCRYPTION_KEY env var not set. Generate with: " +
                `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
        );
    }
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error(
            `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Regenerate with base64 of 32 random bytes.`
        );
    }
    return key;
}

/** Check if a value is already encrypted (has the enc: prefix). */
export function isEncrypted(value: string | null | undefined): boolean {
    return !!value && value.startsWith(PREFIX);
}

/**
 * Encrypt a string. Returns `enc:v1:<base64>` or the input unchanged
 * if input is null/empty.
 */
export function encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === "") return plaintext ?? null;
    if (isEncrypted(plaintext)) return plaintext; // already encrypted

    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([Buffer.from([VERSION]), iv, authTag, ciphertext]);
    return PREFIX + payload.toString("base64");
}

/**
 * Decrypt a string. Accepts unencrypted legacy values (returns them as-is)
 * so migration can happen incrementally.
 */
export function decrypt(ciphertext: string | null | undefined): string | null {
    if (ciphertext == null || ciphertext === "") return ciphertext ?? null;
    if (!isEncrypted(ciphertext)) return ciphertext; // legacy plaintext

    try {
        const payload = Buffer.from(ciphertext.slice(PREFIX.length), "base64");
        const version = payload[0];
        if (version !== VERSION) {
            throw new Error(`Unsupported encryption version: ${version}`);
        }
        const iv = payload.subarray(1, 1 + IV_LENGTH);
        const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
        const data = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);

        const key = getKey();
        const decipher = createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
        return plaintext.toString("utf8");
    } catch (e: any) {
        throw new Error(`Decryption failed: ${e.message}`);
    }
}

/**
 * Safe decrypt — returns null on failure instead of throwing.
 * Use when reading fields where corruption should degrade gracefully.
 */
export function tryDecrypt(ciphertext: string | null | undefined): string | null {
    try {
        return decrypt(ciphertext);
    } catch {
        return null;
    }
}
