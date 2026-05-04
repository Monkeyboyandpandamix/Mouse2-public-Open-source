import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  appConfigDefaults,
  appConfigKey,
  type AppConfigSnapshot,
} from "@shared/appConfig";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const SNAPSHOT_KEY = ["/api/app-config"] as const;

interface SnapshotResponse {
  success: boolean;
  snapshot: AppConfigSnapshot;
  keys: string[];
}

/**
 * Single source-of-truth React hook for the unified app config snapshot. The
 * snapshot is loaded once on mount, cached by TanStack Query, and live-updated
 * by the WS event `app_config_updated` (handled in TopBar.tsx — it dispatches
 * an `app-config-updated` CustomEvent that this hook listens for).
 *
 * Reads return the merged snapshot (defaults overlaid with persisted values).
 * Writes call PUT /api/app-config/<key> which mirrors to Postgres + Firebase
 * RTDB + WS-broadcasts to every connected client.
 */
export function useAppConfig() {
  const qc = useQueryClient();
  const query = useQuery<SnapshotResponse>({
    queryKey: SNAPSHOT_KEY,
    queryFn: () => apiFetch<SnapshotResponse>("/api/app-config"),
    staleTime: 60_000,
  });

  // Live updates from other clients / RTDB / this client's own writes.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string; value?: unknown }>).detail;
      if (!detail?.key) return;
      qc.setQueryData<SnapshotResponse>(SNAPSHOT_KEY, (prev) => {
        const next = prev?.snapshot ? { ...prev.snapshot } : appConfigDefaults();
        next[detail.key!] = detail.value;
        return {
          success: true,
          snapshot: next,
          keys: prev?.keys ?? Object.keys(next),
        };
      });
    };
    window.addEventListener("app-config-updated", handler as EventListener);
    return () => window.removeEventListener("app-config-updated", handler as EventListener);
  }, [qc]);

  const snapshot: AppConfigSnapshot = query.data?.snapshot ?? appConfigDefaults();

  return {
    snapshot,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Read a single value from the central config. */
export function useAppConfigValue<T = unknown>(key: string, fallback?: T): T {
  const { snapshot } = useAppConfig();
  if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)) {
    const v = snapshot[key];
    return (v === undefined || v === null ? (fallback as T) : (v as T));
  }
  const def = appConfigKey(key)?.default;
  return (def === undefined || def === null ? (fallback as T) : (def as T));
}

/**
 * Mutation hook for persisting one config value. The optimistic update writes
 * to the cache immediately (so UI is snappy) and then PUT /api/app-config/<key>
 * makes it durable + fans out to other clients.
 */
export function useUpdateAppConfig() {
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const def = appConfigKey(key);
      if (!def) throw new Error(`Unknown app config key: ${key}`);
      // Optimistic local update so the UI is snappy.
      queryClient.setQueryData<SnapshotResponse>(SNAPSHOT_KEY, (prev) => {
        const next = prev?.snapshot ? { ...prev.snapshot } : appConfigDefaults();
        next[key] = value;
        return {
          success: true,
          snapshot: next,
          keys: prev?.keys ?? Object.keys(next),
        };
      });
      const res = await apiFetch<{ success: boolean; key: string; value: unknown }>(
        `/api/app-config/${encodeURIComponent(key)}`,
        { method: "PUT", body: JSON.stringify({ value }) },
      );
      return res;
    },
    onError: () => {
      // Roll back to whatever the server has.
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    },
  });
}

/**
 * Local-storage migration helper. Run once at app start to copy any legacy
 * localStorage entries into the central store. Safe to call repeatedly: only
 * keys NOT yet in the snapshot are uploaded, and the original localStorage
 * entry is preserved as an offline fallback.
 */
export async function migrateLegacyLocalStorageKeys(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const snap = await apiFetch<SnapshotResponse>("/api/app-config");
    const present = new Set<string>();
    for (const [k, v] of Object.entries(snap.snapshot || {})) {
      if (v !== null && v !== undefined) present.add(k);
    }
    const { APP_CONFIG_KEYS } = await import("@shared/appConfig");
    const patch: Record<string, unknown> = {};
    for (const def of APP_CONFIG_KEYS) {
      if (!def.legacyLocalStorageKey) continue;
      if (present.has(def.key)) continue;
      const raw = localStorage.getItem(def.legacyLocalStorageKey);
      if (raw == null) continue;
      // Try JSON.parse; if it fails treat as a plain string.
      let value: unknown = raw;
      try {
        value = JSON.parse(raw);
      } catch {
        /* keep raw string */
      }
      patch[def.key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await apiFetch("/api/app-config", {
        method: "PATCH",
        body: JSON.stringify({ patch }),
      });
      // Refresh the cache so consumers see the migrated values.
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
    }
  } catch (err) {
    // Auth not yet present, or backend offline — try again next time.
    console.debug("[appConfig] migrate skipped:", (err as Error)?.message);
  }
}
