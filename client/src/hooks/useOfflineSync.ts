import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface BacklogItem {
  id?: string;
  clientRequestId: string;
  droneId?: number | string | null;
  dataType: 'telemetry' | 'media' | 'event' | 'sensor';
  data: any;
  priority: number;
  localFilePath?: string;
  fileChecksum?: string;
  recordedAt: string;
}

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  syncErrors: string[];
}

const SYNC_INTERVAL = 30000;
const HEARTBEAT_INTERVAL = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const LOCAL_STORAGE_KEY = 'mouse_offline_backlog';

/**
 * Offline sync hook for telemetry, media, and events.
 * When network/internet is unavailable (GPS-denied, WiFi-denied ops), data is queued to localStorage.
 * isOnline = backend reachability (fetch to /api); when GCS backend runs locally, it works without internet.
 * Queued items sync automatically when connection is restored.
 */
function makeClientRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const segment = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${segment()}${segment()}-${segment()}-4${segment().slice(1)}-a${segment().slice(1)}-${segment()}${segment()}${segment()}`;
}

export function useOfflineSync(droneId?: number) {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    syncErrors: [],
  });
  
  const localBacklog = useRef<BacklogItem[]>([]);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastImmediatePostFailureToastRef = useRef<number>(0);

  const loadLocalBacklog = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        localBacklog.current = JSON.parse(stored);
        setSyncState(prev => ({ ...prev, pendingCount: localBacklog.current.length }));
      }
    } catch (e) {
      console.error('Failed to load local backlog:', e);
    }
  }, []);

  const saveLocalBacklog = useCallback(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localBacklog.current));
    } catch (e) {
      console.error('Failed to save local backlog:', e);
    }
  }, []);

  const queueData = useCallback((item: Omit<BacklogItem, 'recordedAt' | 'clientRequestId'> & { clientRequestId?: string }) => {
    const clientRequestId = item.clientRequestId || makeClientRequestId();
    const newItem: BacklogItem = {
      ...item,
      id: item.id || clientRequestId,
      clientRequestId,
      droneId: item.droneId == null ? null : String(item.droneId),
      recordedAt: new Date().toISOString(),
    };
    
    localBacklog.current.push(newItem);
    saveLocalBacklog();
    setSyncState(prev => ({ ...prev, pendingCount: localBacklog.current.length }));
    
    if (syncState.isOnline) {
      fetch('/api/backlog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          syncStatus: 'pending',
          syncAttempts: 0,
        }),
      }).catch((err) => {
        console.warn("[useOfflineSync] backlog POST failed:", err);
        const now = Date.now();
        if (!lastImmediatePostFailureToastRef.current || now - lastImmediatePostFailureToastRef.current > 15000) {
          lastImmediatePostFailureToastRef.current = now;
          toast.warning("Data saved locally - will sync when connection is stable");
        }
      });
    }
    
    return newItem;
  }, [saveLocalBacklog, syncState.isOnline]);

  const queueTelemetry = useCallback((telemetryData: any, priority = 5) => {
    return queueData({
      droneId,
      dataType: 'telemetry',
      data: telemetryData,
      priority,
    });
  }, [droneId, queueData]);

  const queueMedia = useCallback((mediaData: any, localFilePath?: string, priority = 8) => {
    return queueData({
      droneId,
      dataType: 'media',
      data: mediaData,
      priority,
      localFilePath,
    });
  }, [droneId, queueData]);

  const queueSensorData = useCallback((sensorData: any, priority = 6) => {
    return queueData({
      droneId,
      dataType: 'sensor',
      data: sensorData,
      priority,
    });
  }, [droneId, queueData]);

  const queueEvent = useCallback((eventData: any, priority = 7) => {
    return queueData({
      droneId,
      dataType: 'event',
      data: eventData,
      priority,
    });
  }, [droneId, queueData]);

  const syncBacklog = useCallback(async () => {
    if (syncState.isSyncing || localBacklog.current.length === 0) {
      return;
    }
    
    setSyncState(prev => ({ ...prev, isSyncing: true, syncErrors: [] }));
    
    try {
      const itemsToSync = [...localBacklog.current].sort((a, b) => b.priority - a.priority);
      
      const response = await fetch('/api/backlog/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSync }),
      });
      
      if (response.ok) {
        const result = await response.json();
        const syncedIds = new Set(
          result.results
            .filter((r: any) => r.status === 'synced' || r.status === 'duplicate')
            .map((r: any) => r.clientRequestId || r.id)
            .filter(Boolean)
        );
        
        const failedItems = result.results.filter((r: any) => r.status === 'failed');
        
        localBacklog.current = localBacklog.current.filter(
          (item) => !syncedIds.has(item.clientRequestId) && !syncedIds.has(item.id)
        );
        saveLocalBacklog();
        
        const syncedCount = result.results.filter((r: any) => r.status === 'synced' || r.status === 'duplicate').length;
        
        if (syncedCount > 0) {
          toast.success(`Synced ${syncedCount} backlog items`);
        }
        if (failedItems.length > 0) {
          toast.error(`${failedItems.length} item(s) failed to sync - will retry later`);
        }
        
        setSyncState(prev => ({
          ...prev,
          isSyncing: false,
          pendingCount: localBacklog.current.length,
          lastSyncTime: new Date(),
          syncErrors: failedItems.map((f: any) => f.error),
        }));
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      toast.error('Failed to sync backlog - will retry when connection is stable');
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        syncErrors: ['Failed to sync backlog'],
      }));
    }
  }, [syncState.isSyncing, saveLocalBacklog]);

  const checkConnectivity = useCallback(async () => {
    try {
      const response = await fetch('/api/runtime-config', {
        method: 'GET',
        cache: 'no-cache',
      });
      
      const isOnline = response.ok;
      
      setSyncState(prev => {
        if (!prev.isOnline && isOnline) {
          toast.success('Connection restored - syncing backlog...');
          setTimeout(syncBacklog, 1000);
        } else if (prev.isOnline && !isOnline) {
          toast.warning('Connection lost - data will be saved locally');
        }
        return { ...prev, isOnline };
      });
    } catch {
      setSyncState(prev => {
        if (prev.isOnline) {
          toast.warning('Connection lost - data will be saved locally');
        }
        return { ...prev, isOnline: false };
      });
    }
  }, [syncBacklog]);

  const clearSyncedItems = useCallback(async () => {
    try {
      await fetch(`/api/backlog/clear${droneId ? `?droneId=${droneId}` : ''}`, {
        method: 'DELETE',
      });
      toast.success('Cleared synced backlog items');
    } catch {
      toast.error('Failed to clear backlog');
    }
  }, [droneId]);

  useEffect(() => {
    loadLocalBacklog();
    
    const handleOnline = () => {
      setSyncState(prev => ({ ...prev, isOnline: true }));
      toast.success('Connection restored');
      syncBacklog();
    };
    
    const handleOffline = () => {
      setSyncState(prev => ({ ...prev, isOnline: false }));
      toast.warning('Offline - data will be saved locally');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    heartbeatRef.current = setInterval(checkConnectivity, HEARTBEAT_INTERVAL);
    
    syncIntervalRef.current = setInterval(() => {
      if (syncState.isOnline && localBacklog.current.length > 0) {
        syncBacklog();
      }
    }, SYNC_INTERVAL);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [loadLocalBacklog, checkConnectivity, syncBacklog, syncState.isOnline]);

  useEffect(() => {
    (window as any).__offlineSync = {
      queueTelemetry,
      queueMedia,
      queueSensorData,
      queueEvent,
      syncBacklog,
      isOnline: syncState.isOnline,
    };
  }, [queueTelemetry, queueMedia, queueSensorData, queueEvent, syncBacklog, syncState.isOnline]);

  return {
    ...syncState,
    queueTelemetry,
    queueMedia,
    queueSensorData,
    queueEvent,
    syncBacklog,
    clearSyncedItems,
  };
}

export function useTelemetryWithBacklog(droneId?: number) {
  const offlineSync = useOfflineSync(droneId);
  
  const sendTelemetry = useCallback(async (telemetryData: any) => {
    (window as any).__currentTelemetry = telemetryData;
    
    if (!offlineSync.isOnline) {
      offlineSync.queueTelemetry(telemetryData);
      return { queued: true };
    }
    
    try {
      const response = await fetch('/api/flight-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telemetryData),
      });
      
      if (!response.ok) {
        offlineSync.queueTelemetry(telemetryData);
        return { queued: true };
      }
      
      return { sent: true };
    } catch {
      offlineSync.queueTelemetry(telemetryData);
      return { queued: true };
    }
  }, [offlineSync]);
  
  return {
    sendTelemetry,
    ...offlineSync,
  };
}
