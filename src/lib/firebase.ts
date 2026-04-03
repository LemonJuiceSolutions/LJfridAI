
// Import the functions you need from the SDKs you need
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAxNXFmxcrcI7aCKGZGP-jbuFpDcvNO0Mw",
  authDomain: "rulesage-a1b15.firebaseapp.com",
  projectId: "rulesage-a1b15",
  storageBucket: "rulesage-a1b15.firebasestorage.app",
  messagingSenderId: "169130992695",
  appId: "1:169130992695:web:782b59294b398ddf550bb2",
  measurementId: "G-93NJXM9QMY"
};

// Lazy initialization – Firebase SDKs are only loaded on first use
let _app: FirebaseApp | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (!_app) {
    const { initializeApp, getApp, getApps } = await import("firebase/app");
    _app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  }
  return _app;
}

export async function getFirestoreDb(): Promise<Firestore> {
  if (!_db) {
    const app = await getFirebaseApp();
    const { getFirestore } = await import("firebase/firestore");
    _db = getFirestore(app);
  }
  return _db;
}

export async function getFirebaseStorage(): Promise<FirebaseStorage> {
  if (!_storage) {
    const app = await getFirebaseApp();
    const { getStorage } = await import("firebase/storage");
    _storage = getStorage(app);
  }
  return _storage;
}
