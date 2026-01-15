
import { db } from "../src/lib/db";

async function main() {
    console.log("----------------------------------------");
    console.log("Listing Password Reset Tokens");
    console.log("----------------------------------------");

    const tokens = await db.passwordResetToken.findMany();

    if (tokens.length === 0) {
        console.log("No reset tokens found in the database.");
    } else {
        console.log(`Found ${tokens.length} token(s):`);
        tokens.forEach((t, index) => {
            console.log(`${index + 1}. Email: ${t.email} | Token: ${t.token} | Expires: ${t.expires.toLocaleString()}`);
        });
    }
    console.log("----------------------------------------");
}

main().catch(console.error);
