'use server';

import { db } from "@/lib/db";
import { getAuthenticatedUser } from "../actions";
import { nanoid } from 'nanoid';

export async function createInvitationAction(email: string) {
    try {
        const user = await getAuthenticatedUser();

        if (!user.companyId) {
            throw new Error("Devi appartenere a un'azienda per invitare utenti.");
        }

        if (!email) throw new Error("Email mancante.");

        // Check se email esiste già come utente
        const existingUser = await db.user.findUnique({ where: { email } });
        if (existingUser) {
            return { error: "Questa email è già registrata ad un utente esistente. Usa lo script di merge se necessario." }; // Messaggio chiaro
        }

        // Check se invito esiste già
        const existingInv = await db.invitation.findFirst({
            where: { email, companyId: user.companyId }
        });

        if (existingInv) {
            // Aggiorniamo token e data o errore?
            // Cancelliamo vecchio e ricreiamo, o errore. 
            // Errore è più semplice.
            return { error: "Esiste già un invito pendente per questa email." };
        }

        const token = nanoid(32);
        const expires = new Date();
        expires.setDate(expires.getDate() + 7); // 7 giorni

        const invitation = await db.invitation.create({
            data: {
                email,
                companyId: user.companyId,
                token,
                expires
            }
        });

        return { success: true, token, invitation };

    } catch (e) {
        console.error("Error createInvitationAction", e);
        return { error: e instanceof Error ? e.message : "Errore sconosciuto" };
    }
}

export async function getInvitationsAction() {
    try {
        const user = await getAuthenticatedUser();
        if (!user.companyId) return { data: [] };

        const invitations = await db.invitation.findMany({
            where: { companyId: user.companyId },
            orderBy: { createdAt: 'desc' }
        });

        // Convert dates to ISO strings for client components if needed, or return raw dates (Server Actions can return dates now in recent Nextjs but safe to serialize)
        // Serialize manually just in case
        const serialized = invitations.map(inv => ({
            ...inv,
            createdAt: inv.createdAt.toISOString(),
            expires: inv.expires.toISOString()
        }));

        return { data: serialized };
    } catch (e) {
        console.error(e);
        return { error: "Errore recupero inviti" };
    }
}

export async function revokeInvitationAction(id: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user.companyId) throw new Error("No company");

        const inv = await db.invitation.findUnique({ where: { id } });
        if (!inv || inv.companyId !== user.companyId) {
            throw new Error("Invito non trovato o accesso negato");
        }

        await db.invitation.delete({ where: { id } });
        return { success: true };
    } catch (e) {
        return { error: "Errore cancellazione invito" };
    }
}
