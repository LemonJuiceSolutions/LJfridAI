import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * Script per creare il primo utente admin e la prima company
 * Esegui con: npx tsx scripts/create-admin.ts
 */

async function createAdmin() {
    try {
        // Check if admin already exists
        const existing = await db.user.findUnique({ where: { email: 'admin@demo.com' } });
        if (existing) {
            console.log('⚠️  Utente admin@demo.com esiste già. Nessuna modifica effettuata.');
            return;
        }

        // Crea la prima company
        const company = await db.company.create({
            data: {
                name: 'Azienda Demo',
            },
        });

        console.log('✅ Company creata:', company.name);

        // Crea il reparto IT
        const department = await db.department.create({
            data: {
                name: 'IT',
                companyId: company.id,
            },
        });

        console.log('✅ Reparto creato:', department.name);

        // Hash della password
        const hashedPassword = await bcrypt.hash('admin', 10);

        // Crea l'utente admin
        const admin = await db.user.create({
            data: {
                email: 'admin@demo.com',
                password: hashedPassword,
                name: 'Admin',
                role: 'admin',
                companyId: company.id,
                departmentId: department.id,
            },
        });

        console.log('✅ Utente admin creato:');
        console.log('   Email:', admin.email);
        console.log('   Password: admin');
        console.log('   Azienda:', company.name);
        console.log('   Reparto:', department.name);
        console.log('\n🎉 Setup completato! Ora puoi fare login con le credenziali sopra.');

    } catch (error) {
        console.error('❌ Errore durante la creazione:', error);
    } finally {
        await db.$disconnect();
    }
}

createAdmin();
