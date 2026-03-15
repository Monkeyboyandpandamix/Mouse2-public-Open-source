/**
 * Single subscription point for telemetry-update events.
 * Components use useTelemetry() instead of addEventListener to reduce duplicate listeners.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface TelemetryData {
  position?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  heading?: number;
  yaw?: number;
  groundSpeed?: number;
  speed?: number;
  batteryPercent?: number;
  battery?: number;
  armed?: boolean;
  gpsStatus?: string;
  gpsFixType?: number;
  [key: string]: unknown;
}

const TelemetryContext = createContext<TelemetryData | null>(null);

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<TelemetryData>).detail;
      if (detail && typeof detail === "object") {
        setTelemetry(detail);
      }
    };
    window.addEventListener("telemetry-update" as any, handler);
    return () => window.removeEventListener("telemetry-update" as any, handler);
  }, []);

  return (
    <TelemetryContext.Provider value={telemetry}>
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetry(): TelemetryData | null {
  return useContext(TelemetryContext);
}
