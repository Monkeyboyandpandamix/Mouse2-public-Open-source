import { randomBytes } from "node:crypto";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirebaseAdminDb, getFirebaseAdminRtdb, getFirebaseAdminStorage } from "./firebaseAdmin";

type SessionInfo = {
  userId?: string | null;
  role?: string | null;
  name?: string | null;
} | null;

type Visibility = "shared" | "admin" | "dm";

interface SyncMeta {
  source?: string;
  visibility?: Visibility;
  recipientId?: string | null;
  recipientName?: string | null;
  session?: SessionInfo;
}

function toSafeFirestoreValue(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((v) => toSafeFirestoreValue(v));
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toSafeFirestoreValue(v);
    }
    return out;
  }
  return value;
}

function makeMeta(meta?: SyncMeta) {
  return {
    source: meta?.source || "mouse-backend",
    visibility: meta?.visibility || "shared",
    recipientId: meta?.recipientId || null,
    recipientName: meta?.recipientName || null,
    actor: {
      userId: meta?.session?.userId || null,
      role: meta?.session?.role || null,
      name: meta?.session?.name || null,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function cloudSyncEnabled(): boolean {
  return Boolean(getFirebaseAdminDb());
}

export async function syncCloudDocument(
  collection: string,
  docId: string,
  payload: any,
  meta?: SyncMeta,
) {
  const db = getFirebaseAdminDb();
  if (!db) return;
  await db.collection(collection).doc(String(docId)).set(
    {
      ...toSafeFirestoreValue(payload),
      __meta: makeMeta(meta),
    },
    { merge: true },
  );
}

export async function appendCloudDocument(
  collection: string,
  payload: any,
  meta?: SyncMeta,
) {
  const db = getFirebaseAdminDb();
  if (!db) return;
  await db.collection(collection).add({
    ...toSafeFirestoreValue(payload),
    __meta: makeMeta(meta),
  });
}

export async function deleteCloudDocument(
  collection: string,
  docId: string,
) {
  const db = getFirebaseAdminDb();
  if (!db) return;
  await db.collection(collection).doc(String(docId)).delete();
}

export async function publishCloudRealtime(channel: string, payload: any, meta?: SyncMeta) {
  const rtdb = getFirebaseAdminRtdb();
  if (!rtdb) return;
  const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  await rtdb.ref(`events/${channel}/${id}`).set({
    data: toSafeFirestoreValue(payload),
    __meta: makeMeta(meta),
  });
}

export async function uploadCloudStorageObject(
  objectPath: string,
  bytes: Buffer,
  contentType = "application/octet-stream",
): Promise<{ ok: boolean; objectPath: string; gsUri?: string; error?: string }> {
  try {
    const storage = getFirebaseAdminStorage();
    if (!storage) {
      return { ok: false, objectPath, error: "Firebase storage unavailable" };
    }
    const bucket = storage.bucket();
    const file = bucket.file(objectPath);
    await file.save(bytes, {
      contentType,
      resumable: false,
      metadata: {
        contentType,
        cacheControl: "private, max-age=0, no-transform",
      },
    });
    return { ok: true, objectPath, gsUri: `gs://${bucket.name}/${objectPath}` };
  } catch (error: any) {
    return { ok: false, objectPath, error: error?.message || String(error) };
  }
}

function mapDocs(docs: QueryDocumentSnapshot[]) {
  return docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRecentCloudDocs(collection: string, limit = 50) {
  const db = getFirebaseAdminDb();
  if (!db) return [];
  const snap = await db.collection(collection).limit(Math.max(1, Math.min(limit, 500))).get();
  return mapDocs(snap.docs).sort((a: any, b: any) => {
    const at = new Date(a?.__meta?.updatedAt || 0).getTime();
    const bt = new Date(b?.__meta?.updatedAt || 0).getTime();
    return bt - at;
  });
}
