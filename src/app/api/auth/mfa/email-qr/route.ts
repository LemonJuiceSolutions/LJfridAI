import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildUriFromSecret } from "@/lib/totp";
import { sendMfaSetupEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/email-qr
 *
 * Emails the MFA setup QR code (and manual base32 secret) to the
 * authenticated user. Requires the user to have already started MFA
 * setup (mfaSecret stored, mfaEnabled still false).
 */
export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
        }

        const userId = (session.user as any).id as string;

        // Rate-limit: 3 emails per 10 minutes per user — prevents abuse.
        const rl = await rateLimit(`mfa-email:${userId}`, 3, 10 * 60 * 1000);
        if (!rl.allowed) {
            const mins = Math.ceil((rl.retryAfterMs || 0) / 60000);
            return NextResponse.json(
                { error: `Troppe richieste. Riprova tra ${mins} minuti.` },
                { status: 429 },
            );
        }

        const user = await db.user.findUnique({
            where: { id: userId },
            select: { email: true, mfaSecret: true, mfaEnabled: true },
        });

        if (!user?.mfaSecret) {
            return NextResponse.json(
                { error: "Setup MFA non avviato. Ricarica la pagina e riprova." },
                { status: 400 },
            );
        }

        if (user.mfaEnabled) {
            return NextResponse.json(
                { error: "MFA è già attivo su questo account." },
                { status: 400 },
            );
        }

        const uri = buildUriFromSecret(user.mfaSecret, user.email);
        const result = await sendMfaSetupEmail(user.email, uri, user.mfaSecret);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Invio email fallito" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("[mfa/email-qr] error:", error);
        return NextResponse.json(
            { error: error?.message || "Errore durante l'invio email" },
            { status: 500 },
        );
    }
}
