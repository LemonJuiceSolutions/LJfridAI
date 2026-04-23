import * as OTPAuth from "otpauth";

const ISSUER = "FridAI";

/**
 * Generates a new TOTP secret and the corresponding otpauth:// URI
 * suitable for QR-code scanning.
 */
export function generateSecret(email: string): { secret: string; uri: string } {
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        label: email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
    });

    return {
        secret: totp.secret.base32,
        uri: totp.toString(),
    };
}

/**
 * Verifies a 6-digit TOTP code against the stored base32 secret.
 * Allows a 1-step window (previous + current + next period) to
 * accommodate clock drift.
 */
export function verifyToken(secret: string, token: string): boolean {
    const totp = new OTPAuth.TOTP({
        issuer: ISSUER,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
    });

    // delta returns null on failure, or a number indicating the step offset
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
}
