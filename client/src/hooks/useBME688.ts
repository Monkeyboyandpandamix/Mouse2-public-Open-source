/**
 * Shared BME688 sensor hook using React Query.
 * Consolidates polling so TelemetryPanel and BME688Panel share the same cache and avoid duplicate requests.
 */
import { useQuery } from "@tanstack/react-query";

const BME688_READ_KEY = ["/api/bme688/read"] as const;
const BME688_STATUS_KEY = ["/api/bme688/status"] as const;
const POLL_INTERVAL_MS = 3000;

async function fetchBME688Read() {
  const res = await fetch("/api/bme688/read");
  if (!res.ok) throw new Error(`BME688 read failed: ${res.status}`);
  return res.json();
}

async function fetchBME688Status() {
  const res = await fetch("/api/bme688/status");
  if (!res.ok) throw new Error(`BME688 status failed: ${res.status}`);
  return res.json();
}

export function useBME688Read(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: BME688_READ_KEY,
    queryFn: fetchBME688Read,
    refetchInterval: options?.refetchInterval ?? POLL_INTERVAL_MS,
  });
}

export function useBME688Status() {
  return useQuery({
    queryKey: BME688_STATUS_KEY,
    queryFn: fetchBME688Status,
    refetchInterval: false,
  });
}
