/**
 * Session shim for the standalone scheduler-service.
 *
 * The scheduler always runs with _bypassAuth=true, so getAuthenticatedUser()
 * is never actually called in the execution paths. This stub replaces the
 * real implementation (which imports next-auth/next/headers) to avoid
 * pulling in Next.js-specific runtime dependencies.
 */

export async function getAuthenticatedUser(): Promise<null> {
  // Never reached in scheduler context — all calls use _bypassAuth=true
  return null;
}
