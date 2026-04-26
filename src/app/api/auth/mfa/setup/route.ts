import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSecret } from "@/lib/totp";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/setup
 *
 * Generates a new TOTP secret for the authenticated user.
 * The secret is persisted but MFA stays disabled until the user
 * confirms with a valid token via /api/auth/mfa/verify.
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email) {
            return NextResponse.json(
                { error: "Non autenticato" },
                { status: 401 },
            );
        }

        const userId = (session.user as any).id as string;

        const rl = await rateLimit(`mfa-setup:${userId}`, 5, 10 * 60 * 1000);
        if (!rl.allowed) {
            const mins = Math.ceil((rl.retryAfterMs || 0) / 60000);
            return NextResponse.json(
                { error: `Troppe richieste MFA. Riprova tra ${mins} minuti.` },
                { status: 429 },
            );
        }

        const { secret, uri } = generateSecret(session.user.email);

        await db.user.update({
            where: { id: userId },
            data: {
                mfaSecret: secret,
                mfaEnabled: false,
                mfaVerifiedAt: null,
            },
        });

        return NextResponse.json({ secret, uri });
    } catch (error) {
        console.error("[mfa/setup] error:", error);
        return NextResponse.json(
            { error: "Errore durante la configurazione MFA" },
            { status: 500 },
        );
    }
}
