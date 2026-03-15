/**
 * Server-side queue for cloud sync operations that fail due to network unavailability.
 * When Firebase/cloud is unreachable, operations are stored locally and automatically
 * retried when the connection is restored.
 */

import path from "path";
import { existsSync, mkdirSync } from "fs";
import { readFile, writeFile } from "fs/promises";

const DATA_DIR = process.env.DATA_DIR || "./data";
const QUEUE_FILE = path.join(DATA_DIR, "cloud_pending_queue.json");
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_QUEUE_SIZE = 10000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - drop items older than this

interface QueuedOp {
  id: string;
  type: "sync" | "append" | "delete";
  collection: string;
  docId?: string;
  payload?: any;
  meta?: any;
  queuedAt: string;
  attempts: number;
}

let queue: QueuedOp[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

async function loadQueue(): Promise<QueuedOp[]> {
  try {
    if (!existsSync(QUEUE_FILE)) return [];
    const raw = await readFile(QUEUE_FILE, "utf-8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQueue(): Promise<void> {
  try {
    mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    await writeFile(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf-8");
  } catch (err) {
    console.error("[cloudRetryQueue] failed to save queue:", err);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Add a failed sync operation to the retry queue. */
export async function enqueueCloudOp(op: Omit<QueuedOp, "id" | "queuedAt" | "attempts">): Promise<void> {
  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn("[cloudRetryQueue] queue full, dropping oldest");
    queue = queue.slice(-Math.floor(MAX_QUEUE_SIZE * 0.9));
  }
  const item: QueuedOp = {
    ...op,
    id: generateId(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  queue.push(item);
  await saveQueue();
}

/** Process queued operations when cloud is available. */
async function flushQueue(): Promise<void> {
  const cloudSync = await import("./cloudSync");
  if (!cloudSync.cloudSyncEnabled() || queue.length === 0 || flushing) return;
  flushing = true;
  const now = Date.now();
  const maxAge = MAX_AGE_MS;
  const remaining: QueuedOp[] = [];
  let flushed = 0;

  for (const item of queue) {
    const age = now - new Date(item.queuedAt).getTime();
    if (age > maxAge) continue; // skip expired

    try {
      if (item.type === "sync" && item.docId != null && item.payload != null) {
        await cloudSync.syncCloudDocumentImpl(item.collection, item.docId, item.payload, item.meta);
        flushed++;
      } else if (item.type === "append" && item.payload != null) {
        await cloudSync.appendCloudDocumentImpl(item.collection, item.payload, item.meta);
        flushed++;
      } else if (item.type === "delete" && item.docId != null) {
        await cloudSync.deleteCloudDocumentImpl(item.collection, item.docId);
        flushed++;
      } else {
        remaining.push(item);
      }
    } catch (err) {
      remaining.push({ ...item, attempts: item.attempts + 1 });
      cloudSync.logCloudErr(err);
    }
  }

  queue = remaining;
  await saveQueue(); // always persist (failed items have incremented attempts)
  if (flushed > 0) {
    console.log(`[cloudRetryQueue] flushed ${flushed} items, ${queue.length} remaining`);
  }
  flushing = false;
}

/** Start the background flush timer. Call once at server startup. */
export function startCloudRetryQueue(): void {
  if (flushTimer) return;
  void loadQueue().then((loaded) => {
    queue = loaded;
    if (queue.length > 0) {
      console.log(`[cloudRetryQueue] loaded ${queue.length} pending items`);
    }
  });
  flushTimer = setInterval(() => void flushQueue(), FLUSH_INTERVAL_MS);
  console.log("[cloudRetryQueue] started (flush every 5 min)");
}

/** Stop the background flush timer. */
export function stopCloudRetryQueue(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/** Get current queue length (for diagnostics). */
export function getCloudQueueLength(): number {
  return queue.length;
}
