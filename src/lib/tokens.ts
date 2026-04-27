
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export const getPasswordResetTokenByToken = async (token: string) => {
    try {
        const passwordResetToken = await db.passwordResetToken.findUnique({
            where: { token }
        });

        return passwordResetToken;
    } catch {
        return null;
    }
}

export const getPasswordResetTokenByEmail = async (email: string) => {
    try {
        const passwordResetToken = await db.passwordResetToken.findFirst({
            where: { email }
        });

        return passwordResetToken;
    } catch {
        return null;
    }
}

export const generatePasswordResetToken = async (email: string) => {
    const token = randomUUID();
    const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

    const existingToken = await getPasswordResetTokenByEmail(email);

    if (existingToken) {
        await db.passwordResetToken.delete({
            where: { id: existingToken.id }
        });
    }

    const passwordResetToken = await db.passwordResetToken.create({
        data: {
            email,
            token,
            expires
        }
    });

    return passwordResetToken;
}
