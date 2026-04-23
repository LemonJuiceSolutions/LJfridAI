import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/totp";

/**
 * POST /api/auth/mfa/validate
 *
 * Used during the login flow (after password check). The client
 * calls this when the authorize callback signals MFA_REQUIRED.
 *
 * Body: { email: string, token: string }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, token } = body;

        if (!email || typeof email !== "string") {
            return NextResponse.json(
                { error: "Email obbligatoria" },
                { status: 400 },
            );
        }

        if (!token || typeof token !== "string") {
            return NextResponse.json(
                { error: "Token MFA obbligatorio" },
                { status: 400 },
            );
        }

        const user = await db.user.findUnique({
            where: { email },
            select: { mfaSecret: true, mfaEnabled: true },
        });

        if (!user?.mfaEnabled || !user.mfaSecret) {
            return NextResponse.json(
                { error: "MFA non abilitato per questo utente" },
                { status: 400 },
            );
        }

        const valid = verifyToken(user.mfaSecret, token);

        return NextResponse.json({ valid });
    } catch (error) {
        console.error("[mfa/validate] error:", error);
        return NextResponse.json(
            { error: "Errore durante la validazione MFA" },
            { status: 500 },
        );
    }
}
