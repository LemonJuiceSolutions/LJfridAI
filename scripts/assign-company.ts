
import { db } from "../src/lib/db";

const EMAIL = "manuele.zanoni@gmail.com";

async function main() {
    console.log("----------------------------------------");
    console.log(`Checking company assignment for: ${EMAIL}`);
    console.log("----------------------------------------");

    // Get user
    const user = await db.user.findUnique({
        where: { email: EMAIL },
        select: { id: true, companyId: true }
    });

    if (!user) {
        console.log("User not found!");
        return;
    }

    console.log("Current companyId:", user.companyId || "(null)");

    if (user.companyId) {
        console.log("User already has a company!");
        return;
    }

    // Find or create a company
    let company = await db.company.findFirst();

    if (!company) {
        console.log("No company found, creating one...");
        company = await db.company.create({
            data: { name: "Default Company" }
        });
    }

    // Assign user to company
    await db.user.update({
        where: { id: user.id },
        data: { companyId: company.id }
    });

    console.log(`[SUCCESS] User assigned to company: ${company.name} (${company.id})`);
    console.log("----------------------------------------");
}

main().catch(console.error);
