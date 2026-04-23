import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db, dbRaw } from "@/lib/db";
import bcrypt from "bcryptjs";
import { rateLimit } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
    // Use raw client — PrismaAdapter inspects internal Prisma state that the
    // $extends proxy can interfere with. User/Account/Session have no PII
    // fields registered for encryption, so bypassing the extension is safe.
    adapter: PrismaAdapter(dbRaw) as any,
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error("Email e password sono obbligatori");
                }

                // SECURITY M-06: rate limit login attempts — 5 per 15 min per email
                const rl = await rateLimit(`login:${credentials.email.toLowerCase()}`, 5, 15 * 60 * 1000);
                if (!rl.allowed) {
                    const mins = Math.ceil((rl.retryAfterMs || 0) / 60000);
                    throw new Error(`Troppi tentativi di login. Riprova tra ${mins} minuti.`);
                }

                const user = await db.user.findUnique({
                    where: { email: credentials.email },
                    include: {
                        company: true,
                        department: true,
                    }
                });

                if (!user || !user.password) {
                    throw new Error("Credenziali non valide");
                }

                const isPasswordValid = await bcrypt.compare(
                    credentials.password,
                    user.password
                );

                if (!isPasswordValid) {
                    throw new Error("Credenziali non valide");
                }

                // TODO: Implement email verification flow (NIS2 Art. 21(2)(a))
                // Currently emailVerified is not set during registration.
                // Until a full verification flow is implemented, block privileged
                // roles from logging in without a verified email.
                if (
                    (user.role === 'admin' || user.role === 'superadmin') &&
                    !user.emailVerified
                ) {
                    console.warn(
                        `[auth] Login blocked: ${user.email} has role "${user.role}" but emailVerified is null`,
                    );
                    throw new Error(
                        "Il tuo account richiede la verifica dell'email. Contatta l'amministratore.",
                    );
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    companyId: user.companyId,
                    departmentId: user.departmentId,
                };
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = (user as any).role;
                token.companyId = (user as any).companyId;
                token.departmentId = (user as any).departmentId;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).id = token.id;
                (session.user as any).role = token.role;
                (session.user as any).companyId = token.companyId;
                (session.user as any).departmentId = token.departmentId;
            }
            return session;
        }
    },
    pages: {
        signIn: "/auth/signin",
    },
    session: {
        strategy: "jwt",
        maxAge: 8 * 60 * 60, // 8 hours
    },
    jwt: {
        maxAge: 8 * 60 * 60, // 8 hours
    },
    secret: process.env.NEXTAUTH_SECRET,
};
