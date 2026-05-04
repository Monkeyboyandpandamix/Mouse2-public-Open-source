import { toast } from "sonner";
import { reportApiError } from "@/lib/apiErrors";

export interface FenceSyncOptions {
  connectionString: string;
  zones?: any[];
}

export async function uploadFenceToFc({ connectionString, zones = [] }: FenceSyncOptions) {
  if (!connectionString) {
    toast.error("No flight controller connection configured. Set in Drone Selection panel.");
    return { success: false };
  }
  try {
    const enabledZones = zones.filter((z: any) => z.enabled !== false);
    if (enabledZones.length > 1) {
      toast.warning(
        "FC supports a single polygon fence. Only the first enabled zone will be uploaded.",
        { duration: 5000 }
      );
    }
    const res = await fetch("/api/mavlink/fence/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionString, zones }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
    toast.success(`Uploaded FC fence (${data.uploadedPoints || 0} points)`);
    return { success: true, ...data };
  } catch (e: any) {
    toast.error(e.message || "Failed to upload fence to FC");
    return { success: false };
  }
}

export async function downloadFenceFromFc({ connectionString }: FenceSyncOptions) {
  if (!connectionString) {
    toast.error("No flight controller connection configured. Set in Drone Selection panel.");
    return { success: false };
  }
  try {
    const res = await fetch(
      `/api/mavlink/fence/download?connectionString=${encodeURIComponent(connectionString)}`
    );
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Download failed");
    const points = Array.isArray(data.points) ? data.points : [];
    if (points.length < 3) {
      toast.error("No valid polygon fence found on FC");
      return { success: false };
    }
    toast.success(`Imported ${points.length} fence points from FC`);
    return { success: true, points, action: data.action, minAltitude: data.minAltitude, maxAltitude: data.maxAltitude };
  } catch (e: any) {
    reportApiError(e, "Failed to download fence from FC");
    return { success: false };
  }
}

export async function downloadMissionFromFc({ connectionString }: FenceSyncOptions) {
  if (!connectionString) {
    toast.error("No flight controller connection configured.");
    return { success: false };
  }
  try {
    const res = await fetch(
      `/api/mavlink/mission/download?connectionString=${encodeURIComponent(connectionString)}`
    );
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Download failed");
    toast.success(`Downloaded ${data.waypoints?.length || 0} waypoints from FC`);
    return { success: true, ...data };
  } catch (e: any) {
    toast.error(e.message || "Failed to download mission from FC");
    return { success: false };
  }
}

export async function uploadMissionToFc({ connectionString, waypoints = [] }: FenceSyncOptions & { waypoints?: any[] }) {
  if (!connectionString) {
    toast.error("No flight controller connection configured.");
    return { success: false };
  }
  try {
    const res = await fetch("/api/mavlink/mission/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionString, waypoints }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
    toast.success(`Uploaded ${waypoints.length} waypoints to FC`);
    return { success: true, ...data };
  } catch (e: any) {
    toast.error(e.message || "Failed to upload mission to FC");
    return { success: false };
  }
}
