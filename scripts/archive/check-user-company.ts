
import { db } from "../src/lib/db";

const EMAIL = "manuele.zanoni@gmail.com";

async function main() {
    console.log("Checking user and company status...");

    // Check User
    const user = await db.user.findUnique({
        where: { email: EMAIL },
        include: { company: true }
    });

    if (!user) {
        console.log("User not found.");
        return;
    }

    console.log(`User: ${user.name} (${user.email})`);
    console.log(`Company ID: ${user.companyId}`);
    console.log(`Company Name: ${user.company?.name || "NONE"}`);

    // Check if new company "QUID" exists
    const quid = await db.company.findFirst({
        where: { name: { contains: "QUID" } } // flexible match
    });

    if (quid) {
        console.log(`Found company match in DB: ${quid.name} (${quid.id})`);
    } else {
        console.log("Company 'QUID' not found in DB yet.");
    }
}

main().catch(console.error);
