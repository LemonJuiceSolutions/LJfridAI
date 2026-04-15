
import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

const EMAIL = "manuele.zanoni@gmail.com";
const PASSWORD = "password123";

async function main() {
    console.log("----------------------------------------");
    console.log(`Creating/Updating User: ${EMAIL}`);
    console.log("----------------------------------------");

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    const user = await db.user.upsert({
        where: { email: EMAIL },
        update: {
            password: hashedPassword,
            role: "admin", // Giving admin access to unblock
            emailVerified: new Date(),
        },
        create: {
            email: EMAIL,
            name: "Manuele Zanoni",
            password: hashedPassword,
            role: "admin",
            emailVerified: new Date(),
            company: { create: { name: "Default Company" } },
        }
    });

    console.log(`[SUCCESS] User ${user.email} is ready.`);
    console.log(`Password set to: ${PASSWORD}`);
    console.log("----------------------------------------");
}

main().catch(console.error);
