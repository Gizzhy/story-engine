// Firebase client (browser). These NEXT_PUBLIC_* web-config values are
// public-safe by design — security is enforced by Firestore/Functions rules,
// not by hiding the config.
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Reuse the app across hot reloads / multiple imports.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);

// Callable Functions are deployed to europe-west3; pin the client to match.
export const functions = getFunctions(app, "europe-west3");
