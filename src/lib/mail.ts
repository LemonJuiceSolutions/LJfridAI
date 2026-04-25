import { db } from "@/lib/db";
import nodemailer from "nodemailer";
import { Resend } from "resend";

function getDomainUrl() {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    // Fallback based on NODE_ENV if not set
    if (process.env.NODE_ENV === "production") {
        return "https://likeaisaid.com"; // Replace with actual production domain if known
    }
    return "http://localhost:9002";
}

export const sendPasswordResetEmail = async (
    email: string,
    token: string,
    ephemeralConfig?: { host: string; user: string; pass: string; port?: number }
) => {
    const confirmLink = `${getDomainUrl()}/auth/new-password?token=${token}`;
    const subject = "Reimposta la tua password";
    const plainText = `Clicca qui per reimpostare la password: ${confirmLink}`;
    const htmlBody = `
        <p>Hai richiesto il reset della password per il tuo account.</p>
        <p>Clicca sul link sottostante per reimpostarla:</p>
        <p><a href="${confirmLink}">Reimposta Password</a></p>
        <p>Se non hai richiesto tu il reset, ignora questa email.</p>
    `;

    // SECURITY: mask email in logs to avoid PII leakage
    const emailDomainOnly = email.split('@')[1] || 'unknown';
    const maskedEmail = `*@${emailDomainOnly}`;

    try {
        console.log(`[MAIL] Attempting to send password reset email to ${maskedEmail}`);

        // 1. Find the user to get Company ID (for Connector lookup)
        const user = await db.user.findUnique({
            where: { email },
            select: { companyId: true }
        });

        // ---------------------------------------------------------
        // PRIORITY 1: RESEND (if API Key is present in .env)
        // ---------------------------------------------------------
        if (process.env.RESEND_API_KEY) {
            console.log("[MAIL] Found RESEND_API_KEY. Using Resend service.");
            try {
                const resend = new Resend(process.env.RESEND_API_KEY);
                const fromAddress = process.env.RESEND_FROM || "onboarding@resend.dev";

                const data = await resend.emails.send({
                    from: fromAddress,
                    to: email,
                    subject: subject,
                    html: htmlBody,
                    text: plainText
                });

                if (data.error) {
                    console.error("[MAIL] Resend API Error:", data.error);
                    // If Resend fails, we might want to fall back, but for now let's just return error
                    return { success: false, error: data.error.message };
                }

                console.log(`[MAIL] Email sent via Resend. ID: ${data.data?.id}`);
                return { success: true };

            } catch (resendError: any) {
                console.error("[MAIL] Resend SDK Exception:", resendError);
                // Fall through to try SMTP if Resend crashes? 
                // Or return error? Let's return error to be clear.
                return { success: false, error: resendError.message || "Resend failed" };
            }
        }

        let transporter: nodemailer.Transporter | null = null;
        let fromAddress = process.env.SMTP_FROM || "noreply@example.com";
        let configSource = "NONE";

        // 0. Priority: Ephemeral Config (passed from UI)
        if (ephemeralConfig) {
            console.log("[MAIL] DEBUG: Found Ephemeral Config");
            configSource = "EPHEMERAL";
            console.log(`[MAIL] Config: Host=${ephemeralConfig.host}, User=${ephemeralConfig.user}, Port=${ephemeralConfig.port}`);
            transporter = nodemailer.createTransport({
                host: ephemeralConfig.host,
                port: ephemeralConfig.port || 587,
                secure: (ephemeralConfig.port || 587) === 465,
                auth: {
                    user: ephemeralConfig.user,
                    pass: ephemeralConfig.pass,
                },
                tls: {
                    rejectUnauthorized: process.env.NODE_ENV === 'production'
                }
            });
            fromAddress = ephemeralConfig.user;
        }

        // 2. Try to find SMTP Connector for this company (if no ephemeral)
        if (!transporter && user?.companyId) {
            const smtpConnector = await db.connector.findFirst({
                where: {
                    companyId: user.companyId,
                    type: "SMTP"
                }
            });

            if (smtpConnector) {
                try {
                    console.log("[MAIL] Found SMTP Connector, using it.");
                    configSource = "CONNECTOR";
                    
                    // Validate config before parsing
                    if (!smtpConnector.config || typeof smtpConnector.config !== 'string') {
                        console.error("[MAIL] Invalid SMTP connector config:", smtpConnector.config);
                        throw new Error("Configurazione SMTP non valida");
                    }
                    
                    const conf = JSON.parse(smtpConnector.config);
                    console.log(`[MAIL] Config: Host=${conf.host}, User=${conf.user}, Port=${conf.port}`);

                    transporter = nodemailer.createTransport({
                        host: conf.host,
                        port: parseInt(conf.port) || 587,
                        secure: (parseInt(conf.port) === 465),
                        auth: {
                            user: conf.user,
                            pass: conf.password,
                        },
                        tls: {
                            rejectUnauthorized: process.env.NODE_ENV === 'production'
                        }
                    });

                    fromAddress = conf.from || conf.user;
                } catch (err: any) {
                    console.error("[MAIL] Failed to parse SMTP Connector config:", err.message);
                    // Fallback to env vars will happen below
                }
            }
        }

        // 3. Fallback to Environment Variables
        if (!transporter) {
            if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
                console.log("[MAIL] Using Environment Variables for SMTP.");
                configSource = "ENV";
                console.log(`[MAIL] Config: Host=${process.env.SMTP_HOST}, User=${process.env.SMTP_USER}, Port=${process.env.SMTP_PORT}`);
                transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT || "587"),
                    secure: parseInt(process.env.SMTP_PORT || "587") === 465,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASSWORD,
                    },
                    tls: {
                        rejectUnauthorized: process.env.NODE_ENV === 'production'
                    }
                });
            } else {
                console.warn("[MAIL] No SMTP configuration found (neither Connector nor Env).");
                // SECURITY: do NOT log full email or reset link (sensitive PII + token)
                const emailDomain = email.split('@')[1] || 'unknown';
                console.log(`[MAIL] Would have sent reset email to *@${emailDomain} (subject: ${subject})`);

                // Return special status so UI can prompt for credentials
                return { success: false, missingSmtp: true };
            }
        }

        // 4. Send Email
        console.log(`[MAIL] Sending via source: ${configSource}...`);
        const info = await transporter.sendMail({
            from: fromAddress,
            to: email,
            subject: subject,
            text: plainText,
            html: htmlBody,
        });

        console.log(`[MAIL] Password reset email sent successfully to ${maskedEmail}`);
        console.log(`[MAIL] MessageID: ${info.messageId}`);
        return { success: true };

    } catch (error: any) {
        console.error("[MAIL] Error sending password reset email:", error);
        // Return the specific error message to help the user debug (e.g. "Invalid login", "ETIMEDOUT")
        return { success: false, error: error.message || "Failed to send email" };
    }
};

/**
 * Send the MFA setup QR code (and manual secret) to a user via email.
 * Used so users who can't scan the on-screen QR (e.g. on the same device
 * as the authenticator app) can open the email on their phone instead.
 *
 * Priority: Resend (RESEND_API_KEY) → SMTP env vars. Connector SMTP
 * is not consulted because this path runs before MFA is active and
 * we don't want to depend on per-tenant config for a security flow.
 */
export const sendMfaSetupEmail = async (
    email: string,
    otpauthUri: string,
    secret: string,
): Promise<{ success: boolean; error?: string }> => {
    const subject = "FridAI — Configurazione Autenticazione a Due Fattori";
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(otpauthUri)}`;
    const plainText =
        `Configurazione MFA per FridAI.\n\n` +
        `1. Apri la tua app di autenticazione (Google Authenticator, Authy, 1Password, ...).\n` +
        `2. Scansiona il QR code allegato (link: ${qrImageUrl}) oppure inserisci manualmente questo codice:\n\n` +
        `   ${secret}\n\n` +
        `3. Torna su FridAI e inserisci il codice a 6 cifre per completare l'attivazione.\n\n` +
        `Se non hai richiesto questa configurazione, contatta immediatamente l'amministratore.`;
    const htmlBody = `
        <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
            <h2 style="color: #4f46e5;">Configurazione Autenticazione a Due Fattori</h2>
            <p>Per completare la configurazione MFA del tuo account FridAI:</p>
            <ol>
                <li>Apri la tua app di autenticazione (Google Authenticator, Authy, 1Password, ecc.).</li>
                <li>Scansiona il QR code qui sotto.</li>
                <li>Torna su FridAI e inserisci il codice a 6 cifre per attivare MFA.</li>
            </ol>
            <p style="text-align: center;">
                <img src="${qrImageUrl}" alt="QR code MFA" width="300" height="300" style="border: 1px solid #e5e7eb; border-radius: 8px;" />
            </p>
            <p>Se non riesci a scansionare il QR, inserisci manualmente questo codice nell'app:</p>
            <p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all;">
                ${secret}
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #6b7280;">
                Se non hai richiesto questa configurazione, contatta immediatamente l'amministratore. Non condividere questo codice con nessuno.
            </p>
        </div>
    `;

    const emailDomainOnly = email.split('@')[1] || 'unknown';
    const maskedEmail = `*@${emailDomainOnly}`;

    try {
        if (process.env.RESEND_API_KEY) {
            const resend = new Resend(process.env.RESEND_API_KEY);
            const fromAddress = process.env.RESEND_FROM || "onboarding@resend.dev";
            const data = await resend.emails.send({
                from: fromAddress,
                to: email,
                subject,
                html: htmlBody,
                text: plainText,
            });
            if (data.error) {
                console.error("[MAIL] Resend MFA email error:", data.error);
                return { success: false, error: data.error.message };
            }
            console.log(`[MAIL] MFA setup email sent via Resend to ${maskedEmail} (id: ${data.data?.id})`);
            return { success: true };
        }

        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || "587"),
                secure: parseInt(process.env.SMTP_PORT || "587") === 465,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD,
                },
                tls: {
                    rejectUnauthorized: process.env.NODE_ENV === 'production',
                },
            });
            const info = await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject,
                text: plainText,
                html: htmlBody,
            });
            console.log(`[MAIL] MFA setup email sent via SMTP to ${maskedEmail} (id: ${info.messageId})`);
            return { success: true };
        }

        console.warn("[MAIL] No mail transport configured — set RESEND_API_KEY or SMTP_* env vars.");
        return { success: false, error: "Nessun trasporto email configurato. Imposta RESEND_API_KEY o le variabili SMTP_*." };
    } catch (error: any) {
        console.error("[MAIL] Error sending MFA setup email:", error);
        return { success: false, error: error.message || "Failed to send email" };
    }
};
