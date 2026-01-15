
import { db } from "../src/lib/db";

async function main() {
    console.log("----------------------------------------");
    console.log("Listing All Users in Database");
    console.log("----------------------------------------");

    const users = await db.user.findMany({
        select: {
            email: true,
            name: true,
            role: true,
            companyId: true
        }
    });

    if (users.length === 0) {
        console.log("No users found in the database.");
    } else {
        console.log(`Found ${users.length} user(s):`);
        users.forEach((u, index) => {
            console.log(`${index + 1}. Email: ${u.email} | Name: ${u.name || "(none)"} | Role: ${u.role}`);
        });
    }
    console.log("----------------------------------------");
}

main().catch(console.error);
