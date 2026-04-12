'use server';

import { getAuthenticatedUser as getAuthUserSession } from "@/lib/session";

export async function getAuthenticatedUser() {
    const user = await getAuthUserSession();
    if (!user) {
        throw new Error("Non autorizzato. Effettua il login.");
    }
    return user;
}
