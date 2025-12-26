
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listUsers() {
    try {
        const users = await prisma.user.findMany({
            include: {
                company: true
            },
            orderBy: { createdAt: 'desc' }
        });

        console.log('\n--- UTENTI E AZIENDE ---');
        console.table(users.map(u => ({
            ID: u.id.substring(0, 8) + '...',
            Name: u.name,
            Email: u.email,
            Company: u.company?.name || 'N/A',
            CompanyID: u.company?.id || 'N/A'
        })));
        console.log('------------------------\n');

    } catch (error) {
        console.error('Errore:', error);
    } finally {
        await prisma.$disconnect();
    }
}

listUsers();
