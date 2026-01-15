
import { db } from "../src/lib/db";

const EMAIL = "manuele.zanoni@gmail.com";
const TARGET_TOKEN = "TEST-TOKEN-123"; // Retrieve the token I sent in the test email

async function main() {
    console.log("----------------------------------------");
    console.log(`Patching Reset Token for: ${EMAIL}`);
    console.log(`Setting Token to: ${TARGET_TOKEN}`);
    console.log("----------------------------------------");

    const expires = new Date(new Date().getTime() + 3600 * 1000); // 1 hour

    // Delete existing to avoid unique constraint if any
    await db.passwordResetToken.deleteMany({
        where: { email: EMAIL }
    });

    await db.passwordResetToken.create({
        data: {
            email: EMAIL,
            token: TARGET_TOKEN,
            expires
        }
    });

    console.log("[SUCCESS] Token updated. The link in your email should now work.");
    console.log("----------------------------------------");
}

main().catch(console.error);
