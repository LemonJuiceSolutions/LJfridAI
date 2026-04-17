import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export type SessionUser = {
    id: string;
    name?: string | null;
    email?: string | null;
    companyId: string;
    departmentId?: string | null;
    role?: 'user' | 'admin' | 'superadmin';
};

/**
 * Returns the authenticated user or null. Use for server actions / components
 * where absence is a valid state (public pages, graceful fallbacks).
 */
export async function getAuthenticatedUser(): Promise<SessionUser | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    return session.user as SessionUser;
}

/**
 * API route helper: returns { user } or a ready-made 401 Response.
 * Usage:
 *   const got = await requireApiSession();
 *   if ('response' in got) return got.response;
 *   const { user } = got;
 */
export async function requireApiSession(): Promise<
    { user: SessionUser } | { response: NextResponse }
> {
    const user = await getAuthenticatedUser();
    if (!user) {
        return { response: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) };
    }
    return { user };
}

/**
 * Stricter variant: requires a non-empty companyId. Returns 400 if the user
 * exists but has no company attached (edge case after provisioning errors).
 */
export async function requireApiCompanyUser(): Promise<
    { user: SessionUser } | { response: NextResponse }
> {
    const user = await getAuthenticatedUser();
    if (!user) {
        return { response: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) };
    }
    if (!user.companyId) {
        return { response: NextResponse.json({ error: 'Utente senza azienda associata' }, { status: 400 }) };
    }
    return { user };
}

/**
 * Role-gated variant. Allowed roles are matched case-insensitively.
 * Returns 403 for authenticated users outside the allow-list.
 */
export async function requireApiRole(
    allowed: Array<'user' | 'admin' | 'superadmin'>,
): Promise<{ user: SessionUser } | { response: NextResponse }> {
    const gate = await requireApiCompanyUser();
    if ('response' in gate) return gate;
    if (!gate.user.role || !allowed.includes(gate.user.role)) {
        return { response: NextResponse.json({ error: 'Permessi insufficienti' }, { status: 403 }) };
    }
    return gate;
}
