"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { generatePasswordResetToken, getPasswordResetTokenByToken } from "@/lib/tokens";
import { sendPasswordResetEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rate-limit";

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
    password: z.string().min(8, {
        message: "Minimo 8 caratteri richiesti",
    }).regex(/[A-Z]/, { message: "Almeno una lettera maiuscola" })
      .regex(/[a-z]/, { message: "Almeno una lettera minuscola" })
      .regex(/[0-9]/, { message: "Almeno un numero" }),
});

export const resetPassword = async (values: z.infer<typeof ResetSchema>) => {
    const validatedFields = ResetSchema.safeParse(values);

    if (!validatedFields.success) {
        return { error: "Email non valida!" };
    }

    const { email } = validatedFields.data;

    // SECURITY M-06: rate limit — 3 reset requests per hour per email
    const rl = await rateLimit(`reset:${email.toLowerCase()}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
        const mins = Math.ceil((rl.retryAfterMs || 0) / 60000);
        return { error: `Troppi tentativi. Riprova tra ${mins} minuti.` };
    }

    const existingUser = await db.user.findUnique({
        where: { email }
    });

    if (!existingUser) {
        // Return success even if user doesn't exist to prevent enumeration
        return { success: "Email di reset inviata!" };
    }

    const passwordResetToken = await generatePasswordResetToken(email);

    // Send Email
    let ephemeralConfig = undefined;

    if (validatedFields.data.smtpHost && validatedFields.data.smtpUser && validatedFields.data.smtpPass) {
        ephemeralConfig = {
            host: validatedFields.data.smtpHost,
            user: validatedFields.data.smtpUser,
            pass: validatedFields.data.smtpPass,
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

    const existingToken = await getPasswordResetTokenByToken(token);

    if (!existingToken) {
        return { error: "Token non valido!" };
    }

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
