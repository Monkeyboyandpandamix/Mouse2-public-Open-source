import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { BME688_THRESHOLDS } from "@shared/schema";
import { apiFetch } from "@/lib/api";

/**
 * Watches BME688 air-quality + IMU vibration telemetry. When any critical
 * threshold trips, automatically engages ML stabilization by writing
 * `enabled=true` to the shared config in localStorage and dispatching
 * `ml-stabilization-config-changed` so the engine reloads. Mounts at the app
 * root with no UI of its own.
 *
 * Cooldown: ML stabilization can only be auto-engaged once every 60s to avoid
 * thrashing. Manual disengage via the Stabilization panel is respected.
 */
export function SensorAnomalyMonitor() {
  const lastEngagedAtRef = useRef(0);
  const lastReasonRef = useRef<string | null>(null);

  useEffect(() => {
    const COOLDOWN_MS = 60_000;

    const engageMlStabilization = (reason: string) => {
      const now = Date.now();
      if (now - lastEngagedAtRef.current < COOLDOWN_MS) return;

      // If the user has explicitly disabled it within the last 30s, respect
      // that — encoded in localStorage by StabilizationPanel.
      const userDisabledAt = Number(localStorage.getItem("mouse_ml_stabilization_user_disabled_at") || "0");
      if (userDisabledAt && now - userDisabledAt < 30_000) return;

      try {
        const raw = localStorage.getItem("mouse_ml_stabilization_config");
        const cfg = raw ? JSON.parse(raw) : {};
        if (cfg.enabled === true) {
          // Already on; just remember the reason.
          lastEngagedAtRef.current = now;
          lastReasonRef.current = reason;
          return;
        }
        const next = { ...cfg, enabled: true };
        localStorage.setItem("mouse_ml_stabilization_config", JSON.stringify(next));
        window.dispatchEvent(new CustomEvent("ml-stabilization-config-changed", { detail: next }));
        lastEngagedAtRef.current = now;
        lastReasonRef.current = reason;
        toast.warning(`ML stabilization auto-engaged — ${reason}`, { duration: 6000 });

        // Inform the backend of the mode change so flight log + remote
        // operators see it. Best-effort — endpoint may not exist in all builds.
        // Use apiFetch so the X-Session-Token header is attached.
        void apiFetch("/api/drone/stabilization-mode", {
          method: "POST",
          body: JSON.stringify({ mlStabilization: true, reason }),
        }).catch(() => {});
      } catch (err) {
        console.warn("[SensorAnomalyMonitor] engage failed", err);
      }
    };

    // --- IMU vibration anomaly via telemetry-update events ---
    // Vibration over ~30 m/s² is the conventional "high" threshold in
    // ArduPilot — we use 25 to engage a bit earlier.
    const VIB_THRESHOLD = 25;
    const onTelemetry = (e: Event) => {
      const d = (e as CustomEvent<any>).detail || {};
      const vx = Number(d.vibrationX ?? d.vibration_x ?? 0);
      const vy = Number(d.vibrationY ?? d.vibration_y ?? 0);
      const vz = Number(d.vibrationZ ?? d.vibration_z ?? 0);
      const peak = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
      if (peak > VIB_THRESHOLD) {
        engageMlStabilization(`IMU vibration ${peak.toFixed(1)} m/s² over threshold`);
      }
    };
    window.addEventListener("telemetry-update", onTelemetry as any);

    // --- BME688 air-quality anomaly polling ---
    let cancelled = false;
    const pollBme = async () => {
      try {
        const data = await apiFetch<any>("/api/bme688/read");
        const iaq = Number(data?.iaqScore ?? data?.iaq ?? data?.iaq_score ?? NaN);
        const co = Number(data?.coPpm ?? data?.co_ppm ?? NaN);
        const co2 = Number(data?.co2Ppm ?? data?.co2_ppm ?? NaN);

        if (Number.isFinite(co) && co >= BME688_THRESHOLDS.CO_CRITICAL) {
          engageMlStabilization(`CO ${co.toFixed(1)} ppm — critical`);
        } else if (Number.isFinite(iaq) && iaq >= BME688_THRESHOLDS.IAQ_POOR) {
          engageMlStabilization(`Air quality IAQ ${iaq.toFixed(0)} — poor`);
        } else if (Number.isFinite(co2) && co2 >= BME688_THRESHOLDS.CO2_HIGH) {
          engageMlStabilization(`CO₂ ${co2.toFixed(0)} ppm — elevated`);
        }
      } catch {
        /* sensor offline; nothing to do */
      }
    };
    void pollBme();
    const bmeTimer = window.setInterval(() => {
      if (!cancelled) void pollBme();
    }, 7000);

    return () => {
      cancelled = true;
      window.removeEventListener("telemetry-update", onTelemetry as any);
      window.clearInterval(bmeTimer);
    };
  }, []);

  return null;
}
