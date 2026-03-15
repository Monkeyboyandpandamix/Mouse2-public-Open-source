// Firebase config shim.
// Secrets and project-specific values must come from environment or runtime config.
// This file intentionally contains no credentials.

const envValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = typeof process !== "undefined" ? process.env?.[key] : undefined;
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

export const HARDCODED_FIREBASE_PROJECT = {
  projectId: envValue("FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
  projectNumber: envValue("FIREBASE_PROJECT_NUMBER", "VITE_FIREBASE_PROJECT_NUMBER"),
  databaseURL: envValue("FIREBASE_DATABASE_URL", "VITE_FIREBASE_DATABASE_URL"),
  storageBucket: envValue("FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"),
  authDomain: envValue("FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
  messagingSenderId: envValue("FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
  serviceAccountPath: envValue("FIREBASE_SERVICE_ACCOUNT_PATH"),
} as const;

export const HARDCODED_FIREBASE_WEB_APPS = {
  primary: {
    apiKey: envValue("VITE_FIREBASE_API_KEY"),
    authDomain: envValue("VITE_FIREBASE_AUTH_DOMAIN"),
    databaseURL: envValue("VITE_FIREBASE_DATABASE_URL"),
    projectId: envValue("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: envValue("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: envValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: envValue("VITE_FIREBASE_APP_ID"),
    measurementId: envValue("VITE_FIREBASE_MEASUREMENT_ID"),
  },
  secondary: {
    apiKey: envValue("VITE_FIREBASE_SECONDARY_API_KEY", "VITE_FIREBASE_API_KEY"),
    authDomain: envValue("VITE_FIREBASE_SECONDARY_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"),
    databaseURL: envValue("VITE_FIREBASE_SECONDARY_DATABASE_URL", "VITE_FIREBASE_DATABASE_URL"),
    projectId: envValue("VITE_FIREBASE_SECONDARY_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"),
    storageBucket: envValue("VITE_FIREBASE_SECONDARY_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: envValue("VITE_FIREBASE_SECONDARY_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: envValue("VITE_FIREBASE_SECONDARY_APP_ID", "VITE_FIREBASE_APP_ID"),
    measurementId: envValue("VITE_FIREBASE_SECONDARY_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID"),
  },
} as const;
