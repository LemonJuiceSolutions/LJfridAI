import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/precheck
 *
 * Checks if a user requires MFA without actually signing them in.
 * Returns:
 *   { mfaRequired: true }  — user has MFA enabled, needs code
 *   { needsSetup: true }   — admin/superadmin without MFA, needs to configure it
 *   { mfaRequired: false }  — no MFA needed (or invalid credentials)
 */
export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ mfaRequired: false });
        }

        const keyEmail = String(email).toLowerCase().trim();
        const [ipLimit, emailLimit] = await Promise.all([
            rateLimit(`mfa-precheck:ip:${ip}`, 20, 60 * 1000),
            rateLimit(`mfa-precheck:email:${keyEmail}`, 10, 15 * 60 * 1000),
        ]);
        if (!ipLimit.allowed || !emailLimit.allowed) {
            return NextResponse.json(
                { mfaRequired: false, error: "Troppi tentativi. Riprova più tardi." },
                { status: 429 },
            );
        }

        const user = await db.user.findUnique({
            where: { email },
            select: { password: true, mfaEnabled: true, role: true },
        });

        if (!user || !user.password) {
            return NextResponse.json({ mfaRequired: false });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ mfaRequired: false });
        }

        if (user.mfaEnabled) {
            return NextResponse.json({ mfaRequired: true });
        }

        // Admin/superadmin without MFA — needs setup
        if (user.role === 'admin' || user.role === 'superadmin') {
            return NextResponse.json({ mfaRequired: false, needsSetup: true });
        }

        return NextResponse.json({ mfaRequired: false });
    } catch {
        return NextResponse.json({ mfaRequired: false });
    }
}
