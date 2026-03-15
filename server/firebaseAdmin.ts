import admin from "firebase-admin";
import fs from "node:fs";

let warnedMissingConfig = false;

function readServiceAccountFromEnv() {
  const fromJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fromJson) {
    return JSON.parse(fromJson);
  }

  const fromBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (fromBase64) {
    const decoded = Buffer.from(fromBase64, "base64").toString("utf8");
    return JSON.parse(decoded);
  }

  const fromPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (fromPath && fs.existsSync(fromPath)) {
    const raw = fs.readFileSync(fromPath, "utf8");
    return JSON.parse(raw);
  }

  return null;
}

function ensureFirebaseAdminApp() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccount = readServiceAccountFromEnv();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!serviceAccount || !projectId) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn("[firebase-admin] not configured. Set FIREBASE_PROJECT_ID and a service account env value.");
    }
    return null;
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
    databaseURL,
    storageBucket,
  });
}

export function getFirebaseAdminApp() {
  return ensureFirebaseAdminApp();
}

export function getFirebaseAdminDb() {
  const app = ensureFirebaseAdminApp();
  if (!app) return null;
  return admin.firestore(app);
}

export function getFirebaseAdminRtdb() {
  const app = ensureFirebaseAdminApp();
  if (!app) return null;
  return admin.database(app);
}

export function getFirebaseAdminStorage() {
  const app = ensureFirebaseAdminApp();
  if (!app) return null;
  return admin.storage(app);
}
