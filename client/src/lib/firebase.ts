import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

const required = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
];

export const firebaseEnabled = required.every((v) => typeof v === "string" && v.trim().length > 0);

let app: FirebaseApp | null = null;
let analyticsInstance: Analytics | null = null;
let analyticsInitStarted = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseEnabled) return null;
  if (app) return app;
  app = initializeApp(firebaseConfig);
  return app;
}

export async function getFirebaseAnalyticsSafe(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance;
  if (analyticsInitStarted) return null;
  if (!firebaseEnabled || typeof window === "undefined") return null;
  analyticsInitStarted = true;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) return null;
    analyticsInstance = getAnalytics(firebaseApp);
    return analyticsInstance;
  } catch {
    return null;
  }
}
