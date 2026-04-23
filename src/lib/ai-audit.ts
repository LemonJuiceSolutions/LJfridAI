import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

/**
 * AI Decision Audit Log — AI Act Art. 12 compliance.
 *
 * Appends one JSON-line per AI decision to `logs/ai-decisions.jsonl`.
 * Designed for easy ingestion by SIEM / log-aggregation tools.
 */

export interface AiDecisionLog {
  timestamp: string;
  userId: string;
  companyId: string;
  flowName: string;        // e.g. 'sql-agent', 'python-agent', 'detai', 'generate-tree'
  model: string;           // e.g. 'gemini-2.0-flash-001'
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
  inputSummary: string;    // first 200 chars of user input (PII-redacted)
  outputSummary: string;   // first 200 chars of AI output
  action: 'generated' | 'executed' | 'rejected' | 'modified';
  metadata?: Record<string, unknown>;
}

const LOGS_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOGS_DIR, 'ai-decisions.jsonl');

let dirEnsured = false;

/**
 * Basic PII redaction: mask email addresses and sequences that look like
 * phone numbers or fiscal codes. This is a best-effort scrub -- production
 * deployments should layer a dedicated PII scanner on top.
 */
function redactPii(text: string): string {
  return text
    // emails
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // phone-like sequences (7+ digits, optionally with separators)
    .replace(/(\+?\d[\d\s\-().]{6,}\d)/g, '[PHONE]');
}

function summarize(text: string | undefined | null, maxLen = 200): string {
  if (!text) return '';
  const oneLine = text.replace(/\n/g, ' ').trim();
  const redacted = redactPii(oneLine);
  return redacted.length > maxLen ? redacted.slice(0, maxLen) + '...' : redacted;
}

/**
 * Log an AI decision to the JSONL audit file.
 *
 * The function is fire-and-forget safe: errors are caught and logged to
 * stderr so they never break the calling request.
 */
export async function logAiDecision(log: AiDecisionLog): Promise<void> {
  try {
    if (!dirEnsured) {
      await mkdir(LOGS_DIR, { recursive: true });
      dirEnsured = true;
    }

    const entry: AiDecisionLog = {
      ...log,
      inputSummary: summarize(log.inputSummary),
      outputSummary: summarize(log.outputSummary),
    };

    await appendFile(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[ai-audit] Failed to write decision log:', err);
  }
}

/**
 * Helper to build a partial log entry with timing info.
 * Call `startTimer()` before the AI call, then spread the result into
 * `logAiDecision()` after the response completes.
 */
export function startAiTimer(): { durationMs: () => number } {
  const start = Date.now();
  return { durationMs: () => Date.now() - start };
}
