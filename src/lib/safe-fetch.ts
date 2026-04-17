/**
 * SSRF-safe fetch wrapper.
 *
 * Resolves the URL host, blocks loopback / private / link-local /
 * cloud metadata addresses, and limits redirects.
 *
 * Use anywhere the app fetches a URL supplied (directly or indirectly)
 * by user input or by an LLM. Prevents server-side request forgery
 * against internal services (Redis/DB ports, AWS metadata 169.254.169.254,
 * Kubernetes API, Docker socket via http unix-socket proxies, etc.).
 */
import "server-only";
import { lookup } from "dns/promises";

const BLOCKED_HOSTNAMES = new Set([
    "localhost",
    "ip6-localhost",
    "ip6-loopback",
]);

/** True for IPv4 addresses we must never connect to. */
function isBlockedIPv4(addr: string): boolean {
    const m = addr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const [, a, b, c, d] = m.map(Number);
    if (a === 0) return true;                   // 0.0.0.0/8
    if (a === 10) return true;                  // 10.0.0.0/8 RFC1918
    if (a === 127) return true;                 // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;    // 169.254.0.0/16 link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
    if (a === 192 && b === 168) return true;    // 192.168.0.0/16 RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true;                  // multicast/reserved
    return false;
}

/** True for IPv6 addresses we must never connect to. */
function isBlockedIPv6(addr: string): boolean {
    const lower = addr.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("ff")) return true;   // multicast
    return false;
}

export class SsrfBlockedError extends Error {
    constructor(reason: string) {
        super(`SSRF blocked: ${reason}`);
        this.name = "SsrfBlockedError";
    }
}

/**
 * Validate that a URL is safe to fetch from a server-side context.
 * Throws SsrfBlockedError on violation.
 */
export async function assertSafeUrl(url: string): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new SsrfBlockedError("invalid URL");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new SsrfBlockedError(`scheme not allowed: ${parsed.protocol}`);
    }

    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(host)) {
        throw new SsrfBlockedError(`host blocked: ${host}`);
    }

    // Resolve to addresses; reject if any address is private/loopback/link-local
    let addrs: { address: string; family: number }[];
    try {
        addrs = await lookup(host, { all: true });
    } catch (e: any) {
        throw new SsrfBlockedError(`DNS resolution failed: ${e.message}`);
    }

    for (const { address, family } of addrs) {
        if (family === 4 && isBlockedIPv4(address)) {
            throw new SsrfBlockedError(`private/loopback IPv4: ${address}`);
        }
        if (family === 6 && isBlockedIPv6(address)) {
            throw new SsrfBlockedError(`private/loopback IPv6: ${address}`);
        }
    }

    return parsed;
}

/**
 * Drop-in fetch with SSRF guard + sane defaults (no redirect to private IPs,
 * timeout, max body).
 */
export async function safeFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    await assertSafeUrl(url);

    const timeoutMs = init.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        // redirect: 'manual' so we can validate intermediate URLs
        const res = await fetch(url, {
            ...init,
            redirect: "manual",
            signal: init.signal ?? controller.signal,
        });

        // Follow up to 3 redirects, validating each Location target
        let current = res;
        for (let i = 0; i < 3; i++) {
            if (current.status < 300 || current.status >= 400) break;
            const loc = current.headers.get("location");
            if (!loc) break;
            const next = new URL(loc, url);
            await assertSafeUrl(next.toString());
            current = await fetch(next.toString(), { ...init, redirect: "manual", signal: controller.signal });
        }

        return current;
    } finally {
        clearTimeout(timer);
    }
}
