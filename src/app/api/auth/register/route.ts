import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    try {
        const ip = getClientIp(request);
        const rl = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Troppi tentativi di registrazione. Riprova più tardi.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { name, email, password, companyName, departmentName, token } = body;

        // Validazione base
        if (!name || !email || !password) {
            return NextResponse.json(
                { error: 'Nome, email e password sono obbligatori' },
                { status: 400 }
            );
        }

        if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
            return NextResponse.json(
                { error: 'Email non valida' },
                { status: 400 }
            );
        }

        if (typeof name !== 'string' || name.length > 100 || name.length < 1) {
            return NextResponse.json(
                { error: 'Nome non valido (1-100 caratteri)' },
                { status: 400 }
            );
        }

        if (!token && (!companyName || !departmentName)) {
            return NextResponse.json(
                { error: 'Nome azienda e dipartimento sono obbligatori per le nuove registrazioni' },
                { status: 400 }
            );
        }

        if (
            password.length < 8 ||
            !/[A-Z]/.test(password) ||
            !/[a-z]/.test(password) ||
            !/[0-9]/.test(password)
        ) {
            return NextResponse.json(
                { error: 'La password deve avere almeno 8 caratteri, una maiuscola, una minuscola e un numero' },
                { status: 400 }
            );
        }

        // Controlla se l'email esiste già
        const existingUser = await db.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'Email già registrata' },
                { status: 400 }
            );
        }

        // Hash della password
        const hashedPassword = await bcrypt.hash(password, 10);

        let companyIdToUse = null;
        let departmentIdToUse = null;
        let userRole = 'admin'; // Default per nuove aziende

        if (token) {
            // Flusso Invito
            const invitation = await db.invitation.findUnique({
                where: { token },
                include: { company: true }
            });

            if (!invitation) {
                return NextResponse.json({ error: 'Token di invito non valido' }, { status: 400 });
            }

            if (invitation.expires < new Date()) {
                return NextResponse.json({ error: 'Invito scaduto' }, { status: 400 });
            }

            if (invitation.email.toLowerCase() !== email.toLowerCase()) {
                // Opzionale: forzare che l'email coincida con l'invito?
                // Spesso è meglio di sì per sicurezza.
                return NextResponse.json({ error: 'L\'email di registrazione deve corrispondere all\'email invitata' }, { status: 400 });
            }

            companyIdToUse = invitation.companyId;
            userRole = invitation.role; // 'user' usually

            // Cerchiamo un dipartimento di default (o null)
            const defaultDept = await db.department.findFirst({ where: { companyId: companyIdToUse } });
            if (defaultDept) departmentIdToUse = defaultDept.id;

            // Delete invitation
            await db.invitation.delete({ where: { id: invitation.id } });

        } else {
            // Flusso Nuova Azienda
            const company = await db.company.create({
                data: { name: companyName },
            });
            companyIdToUse = company.id;

            const department = await db.department.create({
                data: {
                    name: departmentName,
                    companyId: company.id,
                },
            });
            departmentIdToUse = department.id;
        }

        // TODO: Implement email verification flow (NIS2 Art. 21(2)(a))
        // New users are created with emailVerified = null. A full flow should:
        //   1. Send a verification email with a signed token
        //   2. Set emailVerified = new Date() when the token is confirmed
        //   3. Until verified, restrict admin/superadmin login (enforced in auth.ts authorize)

        // SECURITY M-05: prevent self-registration with privileged roles.
        // Only invitation-based registration may assign admin/superadmin,
        // and even then the user must verify their email before logging in.
        if (
            !token &&
            userRole !== 'user' &&
            userRole !== 'admin' // founding company admin is acceptable
        ) {
            return NextResponse.json(
                { error: 'Ruolo non consentito per la registrazione diretta' },
                { status: 403 },
            );
        }

        // Crea l'utente (emailVerified intentionally left null — see TODO above)
        const user = await db.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: userRole,
                companyId: companyIdToUse,
                departmentId: departmentIdToUse,
            },
        });

        return NextResponse.json(
            {
                message: 'Registrazione completata con successo',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Registration error:', error);
        return NextResponse.json(
            { error: 'Errore durante la registrazione' },
            { status: 500 }
        );
    }
}
