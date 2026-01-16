import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function assignTreeToCompany() {
    try {
        // Get user and company
        const user = await prisma.user.findUnique({
            where: { email: 'manuele.zanoni@gmail.com' }
        });

        if (!user || !user.companyId) {
            console.log('❌ Utente o azienda non trovati');
            return;
        }

        console.log(`\n✅ Utente trovato: ${user.email}`);
        console.log(`✅ Azienda: ${user.companyId}`);

        // Find trees without company
        const orphanTrees = await prisma.tree.findMany({
            where: { companyId: null }
        });

        console.log(`\n🌳 Alberi senza azienda trovati: ${orphanTrees.length}`);

        if (orphanTrees.length === 0) {
            console.log('Nessun albero da assegnare.');
            return;
        }

        // Assign all orphan trees to user's company
        for (const tree of orphanTrees) {
            await prisma.tree.update({
                where: { id: tree.id },
                data: { companyId: user.companyId }
            });
            console.log(`  ✅ Assegnato "${tree.name}" all'azienda QUID`);
        }

        console.log('\n🎉 Operazione completata con successo!');

    } catch (error) {
        console.error('Errore:', error);
    } finally {
        await prisma.$disconnect();
    }
}

assignTreeToCompany();
