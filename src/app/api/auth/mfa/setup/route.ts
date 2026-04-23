import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateSecret } from "@/lib/totp";

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
