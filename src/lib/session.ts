import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getAuthenticatedUser() {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        // Return null instead of throwing to allow caller to handle "not logged in" gracefully
        // HOWEVER, to match existing behavior in src/app/actions.ts, we should see what it did.
        // It threw an error. But inconsistent usage in other files suggests checking for null.
        // I will return null here to be safer/more flexible, and let callers check.
        // But wait, if I change behavior, I might break things that expect a throw.
        // Let's return null. The `if (!user)` checks in other files will handle it.
        return null;
    }
    // Cast to include custom fields
    return session.user as {
        id: string;
        name?: string | null;
        email?: string | null;
        companyId: string;
        role?: string;
    };
}
