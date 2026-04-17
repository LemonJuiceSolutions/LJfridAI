/**
 * SQL safety guard — shared across raw-SQL entrypoints (update-commessa
 * proxy mode, internal/query-db). Blocks DDL/system statements after
 * normalization so comment-leading and multi-statement bypasses fail.
 */

export const BLOCKED_KEYWORDS_RE =
    /\b(DROP|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE|xp_|sp_|OPENROWSET|OPENQUERY|OPENDATASOURCE|BULK\s+INSERT|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE|GRANT|REVOKE|DENY|INTO\s+OUTFILE|DBCC|WAITFOR|USE\s+\w)\b/i;

/**
 * Strip block/line comments, split on unquoted `;`, test each segment against
 * the blocked-keyword regex.
 *
 * @returns first offending segment (truncated to 80 chars) or `null` if safe.
 */
export function rejectDangerousSql(raw: string): string | null {
    let q = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
    q = q.replace(/--[^\n\r]*/g, ' ');
    q = q.replace(/\s+/g, ' ').trim();
    const segments = q.split(';').map(s => s.trim()).filter(Boolean);
    for (const seg of segments) {
        if (BLOCKED_KEYWORDS_RE.test(seg)) {
            return seg.slice(0, 80);
        }
    }
    return null;
}
