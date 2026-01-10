'use client';
import {
  Auth, // Import Auth type for type hinting
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  // Assume getAuth and app are initialized elsewhere
} from 'firebase/auth';
import { setDocumentNonBlocking } from './non-blocking-updates';
import { doc, getFirestore } from 'firebase/firestore';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth) {
  return signInAnonymously(authInstance);
}

/** Initiate email/password sign-up (non-blocking). */
export async function initiateEmailSignUp(
  authInstance: Auth,
  email: string,
  password: string,
  firstName: string,
  lastName: string,
): Promise<void> {
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    const user = userCredential.user;

    if (user) {
        await updateProfile(user, {
            displayName: `${firstName} ${lastName}`
        });

        // Create tenant and userAccount documents
        const firestore = getFirestore(authInstance.app);
        const tenantId = user.uid;

        const tenantRef = doc(firestore, 'tenants', tenantId);
        setDocumentNonBlocking(tenantRef, {
            id: tenantId,
            name: `${firstName}'s Team`,
            ownerId: tenantId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        const userAccountRef = doc(firestore, 'tenants', tenantId, 'userAccounts', user.uid);
        setDocumentNonBlocking(userAccountRef, {
            id: user.uid,
            tenantId: tenantId,
            email: user.email,
            firstName: firstName,
            lastName: lastName,
            role: 'admin', // First user is admin
            permissions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            avatarUrl: user.photoURL
        }, { merge: true });
    }
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string) {
  return signInWithEmailAndPassword(authInstance, email, password);
}

/** Initiate password reset (non-blocking). */
export async function initiatePasswordReset(authInstance: Auth, email: string): Promise<void> {
    try {
        await sendPasswordResetEmail(authInstance, email);
    } catch (error) {
        // Log the error for debugging, but re-throw it so the UI can handle it.
        console.error("Firebase sendPasswordResetEmail error:", error);
        throw error;
    }
}
