import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTrees() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'manuele.zanoni@gmail.com' }
        });

        if (!user) {
            console.log('❌ Utente non trovato');
            return;
        }

        console.log('\n📋 UTENTE:');
        console.log('==================');
        console.log('Email:', user.email);
        console.log('Company ID:', user.companyId || '❌ NULL');

        // Check all trees
        const allTrees = await prisma.tree.findMany({
            select: {
                id: true,
                name: true,
                companyId: true,
                createdAt: true
            }
        });

        console.log('\n🌳 TUTTI GLI ALBERI NEL DATABASE:');
        console.log('==================');
        console.log(`Totale alberi: ${allTrees.length}`);

        if (allTrees.length > 0) {
            allTrees.forEach(tree => {
                const isCompanyTree = tree.companyId === user.companyId;
                console.log(`\n  ID: ${tree.id}`);
                console.log(`  Nome: ${tree.name}`);
                console.log(`  CompanyId: ${tree.companyId || '❌ NULL'}`);
                console.log(`  Match azienda: ${isCompanyTree ? '✅' : '❌'}`);
            });
        }

        // Check trees FOR THIS USER's company
        if (user.companyId) {
            const companyTrees = await prisma.tree.findMany({
                where: { companyId: user.companyId }
            });

            console.log('\n\n🏢 ALBERI DELLA TUA AZIENDA:');
            console.log('==================');
            console.log(`Totale: ${companyTrees.length}`);
            companyTrees.forEach(tree => {
                console.log(`  - ${tree.name} (${tree.id})`);
            });
        }

    } catch (error) {
        console.error('Errore:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTrees();
