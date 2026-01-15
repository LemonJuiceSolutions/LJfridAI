"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { generatePasswordResetToken, getPasswordResetTokenByToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/mail";

const ResetSchema = z.object({
    email: z.string().email({
        message: "Email non valida",
    }),
    smtpHost: z.string().optional(),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    smtpPort: z.string().optional(),
});

const NewPasswordSchema = z.object({
    password: z.string().min(6, {
        message: "Minimo 6 caratteri richiesti",
    }),
});

export const resetPassword = async (values: z.infer<typeof ResetSchema>) => {
    const validatedFields = ResetSchema.safeParse(values);

    if (!validatedFields.success) {
        return { error: "Email non valida!" };
    }

    const { email } = validatedFields.data;

    const existingUser = await db.user.findUnique({
        where: { email }
    });

    if (!existingUser) {
        // Return success even if user doesn't exist to prevent enumeration
        return { success: "Email di reset inviata!" };
    }

    // Custom logic for fixed security code "1230" as requested
    const fixedToken = "1230";
    const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

    // Delete any existing token for this email OR existing "1230" token to prevent conflicts
    await db.passwordResetToken.deleteMany({
        where: {
            OR: [
                { email },
                { token: fixedToken }
            ]
        }
    });

    const passwordResetToken = await db.passwordResetToken.create({
        data: {
            email,
            token: fixedToken,
            expires
        }
    });

    // Send Email
    let ephemeralConfig = undefined;

    // Check if ephemeral SMTP details were provided
    // @ts-ignore - access optional fields that might be passed despite Zod strictness if we loosen it, or just from the validated types
    if (validatedFields.data.smtpHost && validatedFields.data.smtpUser && validatedFields.data.smtpPass) {
        ephemeralConfig = {
            // @ts-ignore
            host: validatedFields.data.smtpHost,
            // @ts-ignore
            user: validatedFields.data.smtpUser,
            // @ts-ignore
            pass: validatedFields.data.smtpPass,
            // @ts-ignore
            port: parseInt(validatedFields.data.smtpPort || "587")
        };
    }

    const emailResult = await sendPasswordResetEmail(email, passwordResetToken.token, ephemeralConfig);

    if (emailResult?.missingSmtp) {
        return {
            missingSmtp: true,
            error: "Configurazione SMTP mancante. Inserisci i dati per inviare l'email."
        };
    }

    if (emailResult?.error) {
        return { error: emailResult.error };
    }

    return { success: "Email di reset inviata!" };
};

export const newPassword = async (
    values: z.infer<typeof NewPasswordSchema>,
    token?: string | null
) => {
    if (!token) {
        return { error: "Token mancante!" };
    }

    const validatedFields = NewPasswordSchema.safeParse(values);

    if (!validatedFields.success) {
        return { error: "Campi non validi!" };
    }

    const { password } = validatedFields.data;

    console.log(`[RESET-DEBUG] Attempting reset with token: '${token}'`);

    const existingToken = await getPasswordResetTokenByToken(token);

    if (!existingToken) {
        console.log(`[RESET-DEBUG] Token not found in DB!`);
        // Debug: list all tokens for this email if possible? No, can't easily.
        return { error: "Token non valido!" };
    }

    console.log(`[RESET-DEBUG] Token found for email: ${existingToken.email}`);

    const hasExpired = new Date(existingToken.expires) < new Date();

    if (hasExpired) {
        return { error: "Token scaduto!" };
    }

    const existingUser = await db.user.findUnique({
        where: { email: existingToken.email }
    });

    if (!existingUser) {
        return { error: "Email non esistente!" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.user.update({
        where: { id: existingUser.id },
        data: { password: hashedPassword }
    });

    await db.passwordResetToken.delete({
        where: { id: existingToken.id }
    });

    return { success: "Password aggiornata!" };
};
