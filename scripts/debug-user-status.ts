import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserStatus() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'manuele.zanoni@gmail.com' },
            include: {
                company: true
            }
        });

        if (!user) {
            console.log('❌ Utente non trovato');
            return;
        }

        console.log('\n📋 STATUS UTENTE:');
        console.log('==================');
        console.log('Email:', user.email);
        console.log('Nome:', user.name);
        console.log('Company ID:', user.companyId || '❌ NULL');
        console.log('Company Name:', user.company?.name || '❌ Nessuna azienda');

        // Check connectors
        if (user.companyId) {
            const connectors = await prisma.connector.findMany({
                where: { companyId: user.companyId }
            });

            console.log('\n📦 CONNETTORI:');
            console.log('==================');
            console.log(`Totale connettori: ${connectors.length}`);
            connectors.forEach(c => {
                console.log(`  - ${c.name} (${c.type})`);
            });
        }

    } catch (error) {
        console.error('Errore:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUserStatus();
