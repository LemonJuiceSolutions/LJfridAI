
import { sendPasswordResetEmail } from "../src/lib/mail";
import { db } from "../src/lib/db";

// Use the email from the user's request
const TEST_EMAIL = "manuele.zanoni@gmail.com";

async function main() {
    console.log("----------------------------------------");
    console.log("Test Script: Sending Password Reset Email");
    console.log(`Target: ${TEST_EMAIL}`);
    console.log("----------------------------------------");

    console.log("1. Checking Environment Variables...");
    console.log("SMTP_HOST:", process.env.SMTP_HOST || "(missing)");
    console.log("SMTP_USER:", process.env.SMTP_USER || "(missing)");
    console.log("SMTP_PORT:", process.env.SMTP_PORT || "(missing)");

    console.log("\n2. Checking Database for User & Company...");
    const user = await db.user.findUnique({
        where: { email: TEST_EMAIL },
        include: { company: true }
    });

    if (!user) {
        console.warn(`[WARN] User ${TEST_EMAIL} not found in database!`);
        console.warn("The real app might fail to find company logic.");
    } else {
        console.log(`[OK] User found. Company ID: ${user.companyId || "(none)"}`);
        if (user.companyId) {
            const connector = await db.connector.findFirst({
                where: { companyId: user.companyId, type: "SMTP" }
            });
            console.log(`[INFO] Custom SMTP Connector: ${connector ? "FOUND" : "NOT FOUND"}`);
        }
    }

    console.log("\n3. Attempting to Send Email via src/lib/mail.ts...");
    const result = await sendPasswordResetEmail(TEST_EMAIL, "TEST-TOKEN-123", undefined);

    console.log("\n----------------------------------------");
    console.log("RESULT:", JSON.stringify(result, null, 2));
    console.log("----------------------------------------");

}

main().catch(console.error);
