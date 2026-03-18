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

/** Logs cloud sync errors instead of swallowing them. Use in .catch(logCloudErr). */
export function logCloudErr(err: unknown): void {
  console.error("[cloud sync]", err);
}

/** Internal: Firestore sync, throws on failure. Used by cloudRetryQueue only. */
export async function syncCloudDocumentImpl(
  collection: string,
  docId: string,
  payload: any,
  meta?: SyncMeta,
): Promise<void> {
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

/** Internal: direct Firestore add, throws on failure. Used by cloudRetryQueue only. */
export async function appendCloudDocumentImpl(
  collection: string,
  payload: any,
  meta?: SyncMeta,
): Promise<void> {
  const db = getFirebaseAdminDb();
  if (!db) return;
  await db.collection(collection).add({
    ...toSafeFirestoreValue(payload),
    __meta: makeMeta(meta),
  });
}

/** Internal: direct Firestore delete, throws on failure. Used by cloudRetryQueue only. */
export async function deleteCloudDocumentImpl(collection: string, docId: string): Promise<void> {
  const db = getFirebaseAdminDb();
  if (!db) return;
  await db.collection(collection).doc(String(docId)).delete();
}

/** Sync document (merge). On failure, queues for retry when connection is restored. */
export async function syncCloudDocument(
  collection: string,
  docId: string,
  payload: any,
  meta?: SyncMeta,
) {
  try {
    await syncCloudDocumentImpl(collection, docId, payload, meta);
  } catch (err) {
    logCloudErr(err);
    const { enqueueCloudOp } = await import("./cloudRetryQueue");
    await enqueueCloudOp({ type: "sync", collection, docId, payload, meta }).catch(logCloudErr);
  }
}

/** Append document. On failure, queues for retry when connection is restored. */
export async function appendCloudDocument(
  collection: string,
  payload: any,
  meta?: SyncMeta,
) {
  try {
    await appendCloudDocumentImpl(collection, payload, meta);
  } catch (err) {
    logCloudErr(err);
    const { enqueueCloudOp } = await import("./cloudRetryQueue");
    await enqueueCloudOp({ type: "append", collection, payload, meta }).catch(logCloudErr);
  }
}

/** Delete document. On failure, queues for retry when connection is restored. */
export async function deleteCloudDocument(collection: string, docId: string) {
  try {
    await deleteCloudDocumentImpl(collection, docId);
  } catch (err) {
    logCloudErr(err);
    const { enqueueCloudOp } = await import("./cloudRetryQueue");
    await enqueueCloudOp({ type: "delete", collection, docId }).catch(logCloudErr);
  }
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
