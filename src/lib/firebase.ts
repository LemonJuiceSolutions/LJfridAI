
// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
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

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };
