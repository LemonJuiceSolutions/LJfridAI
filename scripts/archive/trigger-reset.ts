
import { resetPassword } from "../src/actions/reset-password";

const EMAIL = "manuele.zanoni@gmail.com";

async function main() {
    console.log("----------------------------------------");
    console.log(`Triggering Password Reset for: ${EMAIL}`);
    console.log("----------------------------------------");

    const result = await resetPassword({ email: EMAIL });

    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("----------------------------------------");
    console.log("If success, check your email for the reset link!");
}

main().catch(console.error);
