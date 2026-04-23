/**
 * Centralized Python backend URL and fetch helper.
 *
 * In Docker (docker-compose) the env var PYTHON_BACKEND_URL is set to
 * "http://python-backend:5005" so that the Next.js container reaches the
 * Python container by service name. In local development without Docker,
 * it falls back to "http://localhost:5005".
 *
 * All outbound requests to the Python backend must carry the
 * X-Internal-Token header — the Flask app rejects anything without a valid
 * token (except /health). The dev default matches the one the Flask app
 * uses when PYTHON_BACKEND_TOKEN is unset in non-production environments;
 * production refuses to boot without the env var on both sides.
 */

const DEV_DEFAULT_TOKEN = 'dev-python-backend-token-local-only';

export function getPythonBackendUrl(): string {
  return process.env.PYTHON_BACKEND_URL || 'http://localhost:5005';
}

export function getPythonBackendToken(): string {
  const token = process.env.PYTHON_BACKEND_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PYTHON_BACKEND_TOKEN is required in production. Generate with: ' +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }
    return DEV_DEFAULT_TOKEN;
  }
  return token;
}

/**
 * Fetch the Python backend with the internal token automatically attached.
 * Pass only the path suffix (e.g. "/execute", "/scrape"). Any custom headers
 * you provide are merged on top of Content-Type + X-Internal-Token.
 */
export async function pythonFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { pythonBackendCircuit } = await import('@/lib/circuit-breaker');
  const url = `${getPythonBackendUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Internal-Token', getPythonBackendToken());

  return pythonBackendCircuit.call(async () => {
    const response = await fetch(url, { ...init, headers });
    // Treat 5xx as a failure so the circuit breaker can track backend outages
    if (response.status >= 500) {
      throw new Error(`Python backend returned ${response.status}: ${response.statusText}`);
    }
    return response;
  });
}
