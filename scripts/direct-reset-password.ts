
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

const EMAIL = "manuele.zanoni@gmail.com";
const NEW_PASSWORD = "NuovaPassword123";

async function main() {
    console.log("----------------------------------------");
    console.log(`Direct Password Reset for: ${EMAIL}`);
    console.log("----------------------------------------");

    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);

    const user = await db.user.update({
        where: { email: EMAIL },
        data: { password: hashedPassword }
    });

    console.log(`[SUCCESS] Password reset for ${user.email}`);
    console.log(`New password: ${NEW_PASSWORD}`);
    console.log("----------------------------------------");
}

main().catch(console.error);
