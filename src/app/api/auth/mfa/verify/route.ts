import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/totp";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/verify
 *
 * Confirms the TOTP setup by verifying a token from the user's
 * authenticator app. On success, mfaEnabled is set to true.
 *
 * Body: { token: string }
 */
export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.email) {
            return NextResponse.json(
                { error: "Non autenticato" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { token } = body;

        if (!token || typeof token !== "string") {
            return NextResponse.json(
                { error: "Token MFA obbligatorio" },
                { status: 400 },
            );
        }

        const userId = (session.user as any).id as string;

        const rl = await rateLimit(`mfa-verify:${userId}`, 5, 10 * 60 * 1000);
        if (!rl.allowed) {
            const mins = Math.ceil((rl.retryAfterMs || 0) / 60000);
            return NextResponse.json(
                { error: `Troppi tentativi MFA. Riprova tra ${mins} minuti.` },
                { status: 429 },
            );
        }

        const user = await db.user.findUnique({
            where: { id: userId },
            select: { mfaSecret: true },
        });

        if (!user?.mfaSecret) {
            return NextResponse.json(
                { error: "MFA non ancora configurato. Chiama prima /api/auth/mfa/setup" },
                { status: 400 },
            );
        }

        const isValid = verifyToken(user.mfaSecret, token);

        if (!isValid) {
            return NextResponse.json(
                { error: "Token MFA non valido" },
                { status: 400 },
            );
        }

        await db.user.update({
            where: { id: userId },
            data: {
                mfaEnabled: true,
                mfaVerifiedAt: new Date(),
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[mfa/verify] error:", error);
        return NextResponse.json(
            { error: "Errore durante la verifica MFA" },
            { status: 500 },
        );
    }
}
