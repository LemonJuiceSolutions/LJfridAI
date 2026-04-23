/**
 * Declarative map of model → fields containing PII that must be encrypted at
 * rest. Used by the Prisma client extension in `db.ts`.
 *
 * SCOPE NOTE — only NON-indexed, NON-unique fields are listed here. Indexed
 * fields (Lead.email, WhatsAppContact.phoneNumber, User.email) need a
 * deterministic-encryption-or-HMAC strategy to preserve lookups; that is a
 * follow-up migration tracked separately. Encrypting them blindly with a
 * random-IV scheme would break:
 *   - NextAuth login (User.email lookup)
 *   - Lead deduplication by email
 *   - WhatsApp session keying
 *   - The @@index/@@unique constraints in schema.prisma
 *
 * Add fields here only when you've confirmed they are not used in `where`
 * clauses for equality matches or in unique constraints.
 */
import "server-only";

export const PII_FIELDS_BY_MODEL: Record<string, readonly string[]> = {
    Lead: ["phone", "linkedinUrl", "notes"],
    Connector: ["config"],
    User: ["openRouterApiKey", "mfaSecret"],
    WhatsAppContact: ["notes"],
};

/** Reverse lookup helper for the extension. */
export function getPiiFields(modelName: string | undefined): readonly string[] | null {
    if (!modelName) return null;
    return PII_FIELDS_BY_MODEL[modelName] ?? null;
}
