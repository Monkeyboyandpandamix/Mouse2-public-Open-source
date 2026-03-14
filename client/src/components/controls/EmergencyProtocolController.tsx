import { useEffect, useRef } from "react";

interface TelemetryEvent {
  batteryPercent?: number;
  gpsStatus?: string;
  source?: string;
}

interface LandingZoneEvent {
  safe: boolean;
  clearScore: number;
  blockedBy?: string[];
  roadRisk?: "low" | "medium" | "high" | "unknown";
}

const LOW_BATTERY_THRESHOLD = 18;
const CRITICAL_BATTERY_THRESHOLD = 10;
const ACTION_COOLDOWN_MS = 12000;

export function EmergencyProtocolController() {
  const armedRef = useRef(false);
  const batteryRef = useRef(100);
  const gpsOkRef = useRef(false);
  const telemetryTsRef = useRef(0);
  const landingZoneRef = useRef<LandingZoneEvent>({
    safe: false,
    clearScore: 0,
    blockedBy: [],
    roadRisk: "unknown",
  });
  const lastActionTsRef = useRef(0);

  useEffect(() => {
    const onArm = (e: CustomEvent<{ armed: boolean }>) => {
      armedRef.current = Boolean(e.detail?.armed);
    };

    const onTelemetry = (e: CustomEvent<TelemetryEvent>) => {
      const d = e.detail || {};
      telemetryTsRef.current = Date.now();
      if (typeof d.batteryPercent === "number") {
        batteryRef.current = Math.max(0, Math.min(100, d.batteryPercent));
      }
      gpsOkRef.current = d.gpsStatus === "3d_fix" || d.gpsStatus === "2d_fix";
    };

    const onLandingZone = (e: CustomEvent<LandingZoneEvent>) => {
      if (!e.detail) return;
      landingZoneRef.current = e.detail;
    };

    window.addEventListener("arm-state-changed" as any, onArm);
    window.addEventListener("telemetry-update" as any, onTelemetry);
    window.addEventListener("landing-zone-update" as any, onLandingZone);
    return () => {
      window.removeEventListener("arm-state-changed" as any, onArm);
      window.removeEventListener("telemetry-update" as any, onTelemetry);
      window.removeEventListener("landing-zone-update" as any, onLandingZone);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!armedRef.current) return;
      const now = Date.now();
      if (now - lastActionTsRef.current < ACTION_COOLDOWN_MS) return;

      const battery = batteryRef.current;
      const landing = landingZoneRef.current;
      const telemetryLost = now - telemetryTsRef.current > 5000;

      if (telemetryLost) {
        lastActionTsRef.current = now;
        window.dispatchEvent(
          new CustomEvent("system-error", {
            detail: {
              id: `telemetry-loss-${now}`,
              type: "critical",
              title: "Telemetry Link Lost",
              message: "No telemetry for 5s. Triggering autonomous safety recovery.",
              timestamp: new Date(),
            },
          }),
        );
        window.dispatchEvent(new CustomEvent("flight-command", { detail: { command: "backtrace", source: "emergency_protocol" } }));
        return;
      }

      if (battery <= CRITICAL_BATTERY_THRESHOLD) {
        lastActionTsRef.current = now;
        if (landing.safe && (landing.roadRisk === "low" || landing.roadRisk === "unknown")) {
          window.dispatchEvent(
            new CustomEvent("system-error", {
              detail: {
                id: `critical-battery-land-${now}`,
                type: "critical",
                title: "Critical Battery",
                message: `Battery at ${Math.round(battery)}%. Landing in detected clear zone.`,
                timestamp: new Date(),
              },
            }),
          );
          window.dispatchEvent(new CustomEvent("flight-command", { detail: { command: "land", source: "emergency_protocol" } }));
        } else if (gpsOkRef.current) {
          window.dispatchEvent(new CustomEvent("flight-command", { detail: { command: "rtl", source: "emergency_protocol" } }));
        } else {
          window.dispatchEvent(new CustomEvent("flight-command", { detail: { command: "backtrace", source: "emergency_protocol" } }));
        }
        return;
      }

      if (battery <= LOW_BATTERY_THRESHOLD) {
        lastActionTsRef.current = now;
        window.dispatchEvent(
          new CustomEvent("system-error", {
            detail: {
              id: `low-battery-${now}`,
              type: "warning",
              title: "Low Battery Failsafe",
              message: `Battery at ${Math.round(battery)}%. Executing autonomous recovery plan.`,
              timestamp: new Date(),
            },
          }),
        );
        if (gpsOkRef.current) {
          window.dispatchEvent(new CustomEvent("flight-command", { detail: { command: "rtl", source: "emergency_protocol" } }));
        } else {
          window.dispatchEvent(new CustomEvent("flight-command", { detail: { command: "backtrace", source: "emergency_protocol" } }));
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return null;
}
