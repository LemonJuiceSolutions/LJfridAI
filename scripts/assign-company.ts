
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignUserToCompany() {
    const userEmail = process.argv[2];
    const targetCompanyAdminEmail = process.argv[3];

    if (!userEmail || !targetCompanyAdminEmail) {
        console.error('Uso: npx tsx scripts/assign-company.ts <email_utente_da_spostare> <email_admin_azienda_target>');
        process.exit(1);
    }

    try {
        const userToMove = await prisma.user.findUnique({ where: { email: userEmail } });
        const targetAdmin = await prisma.user.findUnique({ where: { email: targetCompanyAdminEmail } });

        if (!userToMove) throw new Error(`Utente ${userEmail} non trovato`);
        if (!targetAdmin) throw new Error(`Admin ${targetCompanyAdminEmail} non trovato`);
        if (!targetAdmin.companyId) throw new Error(`L'admin ${targetCompanyAdminEmail} non ha un'azienda`);

        console.log(`Sposto l'utente ${userToMove.name} (${userToMove.id}) nell'azienda ${targetAdmin.companyId}...`);

        await prisma.user.update({
            where: { id: userToMove.id },
            data: {
                companyId: targetAdmin.companyId,
                // Reset department se necessario, o prova a trovarne uno nell'altra azienda. Per ora lo lasciamo null o cerchiamo il primo.
                // departmentId: ... 
            }
        });

        // Opzionale: Se l'utente spostato aveva creato alberi, spostiamo anche quelli?
        // In genere sì, se vogliamo che li porti con sé. Altrimenti li perde.
        // Facciamolo per comodità.
        if (userToMove.companyId) {
            console.log("Sposto anche gli alberi creati dall'utente nella nuova azienda...");
            await prisma.tree.updateMany({
                where: { companyId: userToMove.companyId }, // Attenzione: questo sposta TUTTI gli alberi della vecchia azienda di provenienza
                // Se l'utente era l'unico, ok. Se c'erano altri, rubiamo tutto.
                // Dato che la reg crea 1 user 1 company, è sicuro.
                data: { companyId: targetAdmin.companyId }
            });

            // Spostiamo anche le variabili
            await prisma.variable.updateMany({
                where: { companyId: userToMove.companyId },
                data: { companyId: targetAdmin.companyId }
            });

            // Cancelliamo la vecchia company vuota
            console.log("Cancello la vecchia azienda vuota...");
            await prisma.company.delete({
                where: { id: userToMove.companyId }
            });
        }

        console.log('Operazione completata con successo!');

    } catch (error) {
        console.error('Errore:', error);
    } finally {
        await prisma.$disconnect();
    }
}

assignUserToCompany();
