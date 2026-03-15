/**
 * Session store with Firebase Firestore persistence.
 * When Firebase is configured, sessions are stored in Firestore for multi-instance support.
 * Falls back to in-memory + file when Firebase is not available.
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { getFirebaseAdminDb } from "./firebaseAdmin";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COLLECTION = "gcs_sessions";

export interface ServerSession {
  userId: string;
  role: string;
  name: string;
  createdAt: number;
}

const memoryCache = new Map<string, ServerSession>();
const DATA_DIR = process.env.DATA_DIR || "./data";
const RUNTIME_SESSIONS_FILE = path.join(DATA_DIR, "runtime_sessions.json");

function isExpired(session: ServerSession): boolean {
  return Date.now() - session.createdAt > SESSION_TTL_MS;
}

/** Get session from memory, then Firestore on cache miss (for multi-instance). */
export async function getSession(token: string | undefined): Promise<ServerSession | null> {
  if (!token) return null;

  const cached = memoryCache.get(token);
  if (cached) {
    if (isExpired(cached)) {
      memoryCache.delete(token);
      void deleteSessionFirestore(token);
      return null;
    }
    return cached;
  }

  const db = getFirebaseAdminDb();
  if (db) {
    try {
      const doc = await db.collection(COLLECTION).doc(token).get();
      if (doc.exists) {
        const data = doc.data() as ServerSession;
        if (data && !isExpired(data)) {
          memoryCache.set(token, data);
          return data;
        }
        void db.collection(COLLECTION).doc(token).delete().catch(console.error);
      }
    } catch (err) {
      console.warn("[sessionStore] Firestore get failed:", err);
    }
  }

  return null;
}

async function setSessionFirestore(token: string, session: ServerSession): Promise<void> {
  const db = getFirebaseAdminDb();
  if (!db) return;
  try {
    await db.collection(COLLECTION).doc(token).set({
      ...session,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("[sessionStore] Firestore set failed:", err);
  }
}

async function deleteSessionFirestore(token: string): Promise<void> {
  const db = getFirebaseAdminDb();
  if (!db) return;
  try {
    await db.collection(COLLECTION).doc(token).delete();
  } catch (err) {
    console.warn("[sessionStore] Firestore delete failed:", err);
  }
}

/** Set session in memory, Firestore, and file. */
export async function setSession(token: string, session: ServerSession): Promise<void> {
  memoryCache.set(token, session);
  void setSessionFirestore(token, session);
  void persistToFile();
}

/** Delete session from all stores. */
export async function deleteSession(token: string): Promise<boolean> {
  const had = memoryCache.has(token);
  memoryCache.delete(token);
  if (had) {
    void deleteSessionFirestore(token);
    void persistToFile();
  }
  return had;
}

export function getSessionMap(): Map<string, ServerSession> {
  return memoryCache;
}

export function revokeUserSessions(userId: string): void {
  const normalized = String(userId || "").trim();
  if (!normalized) return;
  for (const [token, session] of Array.from(memoryCache.entries())) {
    if (String(session.userId || "").trim() === normalized) {
      memoryCache.delete(token);
      void deleteSessionFirestore(token);
    }
  }
  void persistToFile();
}

export function refreshUserSessions(userId: string, updates: Partial<Pick<ServerSession, "role" | "name">>): void {
  const normalized = String(userId || "").trim();
  if (!normalized) return;
  for (const [token, session] of Array.from(memoryCache.entries())) {
    if (String(session.userId || "").trim() !== normalized) continue;
    const updated = {
      ...session,
      role: updates.role != null ? String(updates.role) : session.role,
      name: updates.name != null ? String(updates.name) : session.name,
    };
    memoryCache.set(token, updated);
    void setSessionFirestore(token, updated);
  }
  void persistToFile();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function persistToFile(): Promise<void> {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        activeSessions: Object.fromEntries(memoryCache.entries()),
      };
      await writeFile(RUNTIME_SESSIONS_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err) {
      console.warn("[sessionStore] file persist failed:", err);
    }
  }, 250);
}

/** Load sessions at startup: Firestore first (when configured), else file. */
export async function loadSessionsAtStartup(): Promise<void> {
  const db = getFirebaseAdminDb();
  if (db) {
    try {
      const snapshot = await db.collection(COLLECTION).get();
      const now = Date.now();
      let loaded = 0;
      for (const doc of snapshot.docs) {
        const data = doc.data() as ServerSession & { updatedAt?: number };
        if (!data || !data.userId || !data.createdAt) continue;
        if (now - data.createdAt > SESSION_TTL_MS) {
          void doc.ref.delete().catch(() => {});
          continue;
        }
        memoryCache.set(doc.id, {
          userId: data.userId,
          role: data.role || "viewer",
          name: data.name || "User",
          createdAt: data.createdAt,
        });
        loaded++;
      }
      if (loaded > 0) {
        console.log(`[sessionStore] Loaded ${loaded} sessions from Firestore`);
      }
      return;
    } catch (err) {
      console.warn("[sessionStore] Firestore load failed, falling back to file:", err);
    }
  }

  try {
    if (!existsSync(RUNTIME_SESSIONS_FILE)) return;
    const raw = await readFile(RUNTIME_SESSIONS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as { activeSessions?: Record<string, ServerSession> };
    const sessions = parsed?.activeSessions && typeof parsed.activeSessions === "object" ? parsed.activeSessions : {};
    const now = Date.now();
    for (const [token, session] of Object.entries(sessions)) {
      const createdAt = Number((session as any)?.createdAt || 0);
      if (!token || !session || !createdAt) continue;
      if (now - createdAt > SESSION_TTL_MS) continue;
      memoryCache.set(token, {
        userId: String((session as any).userId || ""),
        role: String((session as any).role || "viewer"),
        name: String((session as any).name || "User"),
        createdAt,
      });
    }
  } catch (err) {
    console.warn("[sessionStore] file load failed:", err);
  }
}
