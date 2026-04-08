/**
 * Centralized Python backend URL helper.
 *
 * In Docker (docker-compose) the env var PYTHON_BACKEND_URL is set to
 * "http://python-backend:5005" so that the Next.js container reaches the
 * Python container by service name. In local development without Docker,
 * it falls back to "http://localhost:5005".
 */
export function getPythonBackendUrl(): string {
  return process.env.PYTHON_BACKEND_URL || 'http://localhost:5005';
}
