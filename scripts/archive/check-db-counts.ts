
import { db } from "../src/lib/db";

async function main() {
    console.log("----------------------------------------");
    console.log("Checking Database Content Stats");
    console.log("----------------------------------------");

    const users = await db.user.count();
    const companies = await db.company.count();
    const products = await db.product.count();
    const orders = await db.order.count();
    const connectors = await db.connector.count();

    console.log(`Users:      ${users}`);
    console.log(`Companies:  ${companies}`);
    console.log(`Products:   ${products}`);
    console.log(`Orders:     ${orders}`);
    console.log(`Connectors: ${connectors}`);
    console.log("----------------------------------------");

    if (companies === 0) {
        console.log("[INFO] Database seems mostly empty (except for users).");
    } else {
        console.log("[INFO] Database contains business data.");
    }
}

main().catch(console.error);
