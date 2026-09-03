import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBvUpGz3Wuoq9BFOcfgt-JFDrdHwKwZZAc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "nunu-1ab34.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "nunu-1ab34",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "nunu-1ab34.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "172651428182",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:172651428182:web:3ad0a3dea884f09e46fef7",
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;
export const googleProvider = new GoogleAuthProvider();

if (auth) {
  setPersistence(auth, browserLocalPersistence);
}
