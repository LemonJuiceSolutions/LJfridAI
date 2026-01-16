import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserSettings() {
    try {
        const user = await prisma.user.findUnique({
            where: { email: 'manuele.zanoni@gmail.com' },
            select: {
                email: true,
                openRouterApiKey: true,
                openRouterModel: true,
                openRouterAgentModel: true
            }
        });

        if (!user) {
            console.log('❌ Utente non trovato');
            return;
        }

        console.log('\n⚙️ IMPOSTAZIONI AI UTENTE:');
        console.log('==================');
        console.log('Email:', user.email);
        console.log('API Key:', user.openRouterApiKey ? '✅ Presente' : '❌ Non impostata');
        console.log('Modello OpenRouter:', user.openRouterModel || '❌ Non impostato');
        console.log('Modello FridAI Agent:', user.openRouterAgentModel || '❌ Non impostato (default: google/gemini-2.0-flash-001)');

    } catch (error) {
        console.error('Errore:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUserSettings();
