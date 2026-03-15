import { useEffect, useRef } from "react";

interface GpsDeniedConfig {
  enabled: boolean;
  method: "visual" | "dead" | "hybrid";
  useFlightHistory: boolean;
  useVisualMatching: boolean;
  gpsLostTimeoutSec: number;
  minSatellites: number;
}

interface TelemetryLike {
  position?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  heading?: number;
  groundSpeed?: number;
  altitude?: number;
  gpsSatellites?: number;
  source?: string;
}

interface VisualOdomUpdate {
  dx: number;
  dy: number;
  confidence: number;
  frameWidth: number;
  frameHeight: number;
  timestamp: number;
}

interface Pose {
  lat: number;
  lng: number;
}

const DEFAULT_CONFIG: GpsDeniedConfig = {
  enabled: true,
  method: "hybrid",
  useFlightHistory: true,
  useVisualMatching: true,
  gpsLostTimeoutSec: 10,
  minSatellites: 6,
};

const EARTH_RADIUS_M = 6371000;
const MAX_BREADCRUMBS = 500;

function metersToLatLonDelta(northM: number, eastM: number, atLat: number) {
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = (eastM / (EARTH_RADIUS_M * Math.cos((atLat * Math.PI) / 180))) * (180 / Math.PI);
  return { dLat, dLng };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function GpsDeniedNavigationController() {
  const configRef = useRef<GpsDeniedConfig>(DEFAULT_CONFIG);
  const poseRef = useRef<Pose | null>(null);
  const breadcrumbsRef = useRef<Pose[]>([]);
  const lastTelemetryTsRef = useRef<number>(Date.now());
  const lastGpsFixTsRef = useRef<number>(Date.now());
  const lastVioRef = useRef<VisualOdomUpdate | null>(null);
  const backtraceIndexRef = useRef<number | null>(null);
  const backtraceLastStepTsRef = useRef<number>(0);

  useEffect(() => {
    const loadConfig = () => {
      const raw = localStorage.getItem("mouse_gps_denied_config");
      if (!raw) {
        configRef.current = DEFAULT_CONFIG;
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        configRef.current = {
          enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
          method: parsed.method ?? DEFAULT_CONFIG.method,
          useFlightHistory: parsed.useFlightHistory ?? DEFAULT_CONFIG.useFlightHistory,
          useVisualMatching: parsed.useVisualMatching ?? DEFAULT_CONFIG.useVisualMatching,
          gpsLostTimeoutSec: Number(parsed.gpsLostTimeoutSec ?? DEFAULT_CONFIG.gpsLostTimeoutSec),
          minSatellites: Number(parsed.minSatellites ?? DEFAULT_CONFIG.minSatellites),
        };
      } catch {
        configRef.current = DEFAULT_CONFIG;
      }
    };

    loadConfig();
    window.addEventListener("gps-denied-config-changed", loadConfig as EventListener);
    return () => window.removeEventListener("gps-denied-config-changed", loadConfig as EventListener);
  }, []);

  useEffect(() => {
    const onTelemetry = (e: CustomEvent<TelemetryLike>) => {
      const d = e.detail || {};
      lastTelemetryTsRef.current = Date.now();

      const gpsPosition =
        d.position ||
        (typeof d.latitude === "number" && typeof d.longitude === "number"
          ? { lat: d.latitude, lng: d.longitude }
          : null);

      const gpsSatellites = d.gpsSatellites ?? 99;
      const hasReliableGps =
        !!gpsPosition &&
        (d.source !== "sim" || gpsSatellites >= configRef.current.minSatellites);
      const canBootstrapPose = !!gpsPosition && !poseRef.current;

      if ((hasReliableGps || canBootstrapPose) && gpsPosition) {
        poseRef.current = gpsPosition;
        if (hasReliableGps) {
          lastGpsFixTsRef.current = Date.now();
        }

        if (
          breadcrumbsRef.current.length === 0 ||
          Math.abs(breadcrumbsRef.current[breadcrumbsRef.current.length - 1].lat - gpsPosition.lat) > 0.00001 ||
          Math.abs(breadcrumbsRef.current[breadcrumbsRef.current.length - 1].lng - gpsPosition.lng) > 0.00001
        ) {
          breadcrumbsRef.current.push(gpsPosition);
          if (breadcrumbsRef.current.length > MAX_BREADCRUMBS) {
            breadcrumbsRef.current = breadcrumbsRef.current.slice(-MAX_BREADCRUMBS);
          }
        }
      }
    };

    const onVisualOdom = (e: CustomEvent<VisualOdomUpdate>) => {
      lastVioRef.current = e.detail;
    };

    const onNavCommand = (e: CustomEvent<{ command?: string }>) => {
      const cmd = e.detail?.command;
      if ((cmd === "backtrace" || cmd === "backtrace_request") && breadcrumbsRef.current.length > 1) {
        backtraceIndexRef.current = breadcrumbsRef.current.length - 2;
        backtraceLastStepTsRef.current = 0;
      }
      if (cmd === "abort" || cmd === "land") {
        backtraceIndexRef.current = null;
      }
    };

    window.addEventListener("telemetry-update" as any, onTelemetry);
    window.addEventListener("visual-odometry-update" as any, onVisualOdom);
    window.addEventListener("ml-nav-command" as any, onNavCommand);
    return () => {
      window.removeEventListener("telemetry-update" as any, onTelemetry);
      window.removeEventListener("visual-odometry-update" as any, onVisualOdom);
      window.removeEventListener("ml-nav-command" as any, onNavCommand);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const cfg = configRef.current;
      if (!cfg.enabled || !poseRef.current) return;

      const now = Date.now();
      const gpsLost = now - lastGpsFixTsRef.current > cfg.gpsLostTimeoutSec * 1000;
      const telemetryAgeMs = now - lastTelemetryTsRef.current;
      const dtSec = clamp(telemetryAgeMs / 1000, 0.1, 1.0);

      let currentPose = poseRef.current;

      if (gpsLost) {
        // Pull most recent telemetry snapshot from the browser-global cache if available.
        const telemetry = ((window as any).__currentTelemetry || {}) as TelemetryLike;
        const headingDeg = telemetry.heading ?? 0;
        const speedMps = telemetry.groundSpeed ?? 0;
        const altitude = telemetry.altitude ?? 20;

        const headingRad = (headingDeg * Math.PI) / 180;
        const northM = Math.cos(headingRad) * speedMps * dtSec;
        const eastM = Math.sin(headingRad) * speedMps * dtSec;
        const dead = metersToLatLonDelta(northM, eastM, currentPose.lat);

        let vio = { dLat: 0, dLng: 0 };
        if (cfg.useVisualMatching && lastVioRef.current && now - lastVioRef.current.timestamp < 1500) {
          // Convert pixel-frame drift into approximate local displacement.
          const pxDx = lastVioRef.current.dx;
          const pxDy = lastVioRef.current.dy;
          const frameW = Math.max(1, lastVioRef.current.frameWidth);
          const frameH = Math.max(1, lastVioRef.current.frameHeight);
          const confidence = clamp(lastVioRef.current.confidence, 0, 1);

          const footprintM = Math.max(8, altitude * 1.2);
          const eastFromVioM = -(pxDx / frameW) * footprintM * confidence;
          const northFromVioM = -(pxDy / frameH) * footprintM * confidence;
          vio = metersToLatLonDelta(northFromVioM, eastFromVioM, currentPose.lat);
        }

        let fusedLat = currentPose.lat;
        let fusedLng = currentPose.lng;

        if (cfg.method === "dead") {
          fusedLat += dead.dLat;
          fusedLng += dead.dLng;
        } else if (cfg.method === "visual") {
          fusedLat += vio.dLat;
          fusedLng += vio.dLng;
        } else {
          fusedLat += dead.dLat * 0.6 + vio.dLat * 0.4;
          fusedLng += dead.dLng * 0.6 + vio.dLng * 0.4;
        }

        currentPose = { lat: fusedLat, lng: fusedLng };
        poseRef.current = currentPose;

        if (cfg.useFlightHistory) {
          const prev = breadcrumbsRef.current[breadcrumbsRef.current.length - 1];
          if (
            !prev ||
            Math.abs(prev.lat - currentPose.lat) > 0.000003 ||
            Math.abs(prev.lng - currentPose.lng) > 0.000003
          ) {
            breadcrumbsRef.current.push(currentPose);
            if (breadcrumbsRef.current.length > MAX_BREADCRUMBS) {
              breadcrumbsRef.current = breadcrumbsRef.current.slice(-MAX_BREADCRUMBS);
            }
          }
        }
      }

      // Drive local backtrace output as guided waypoints in reverse breadcrumb order.
      if (backtraceIndexRef.current != null && now - backtraceLastStepTsRef.current > 1000) {
        const idx = backtraceIndexRef.current;
        const target = breadcrumbsRef.current[idx];
        if (target) {
          window.dispatchEvent(
            new CustomEvent("ml-nav-guidance", {
              detail: {
                command: "guided-waypoint",
                source: "gps_denied_backtrace",
                target,
              },
            }),
          );
          backtraceLastStepTsRef.current = now;
          backtraceIndexRef.current = idx > 0 ? idx - 1 : null;
        } else {
          backtraceIndexRef.current = null;
        }
      }

      window.dispatchEvent(
        new CustomEvent("gps-denied-position-update", {
          detail: {
            active: gpsLost && cfg.enabled,
            method: cfg.method,
            estimatedPosition: currentPose,
            breadcrumbs: breadcrumbsRef.current,
            backtracing: backtraceIndexRef.current != null,
          },
        }),
      );
    }, 250);

    return () => clearInterval(timer);
  }, []);

  return null;
}
