import { useEffect, useRef } from "react";

interface TelemetrySnapshot {
  attitude?: { pitch: number; roll: number; yaw: number };
  altitude?: number;
  groundSpeed?: number;
  heading?: number;
}

interface TrackingSnapshot {
  trackingActive: boolean;
  lockedCount: number;
  targetOffsetX?: number;
  targetOffsetY?: number;
  targetSizeRatio?: number;
  targetDistanceMeters?: number;
  confidence?: number;
}

interface ObstacleSnapshot {
  riskLevel: "none" | "low" | "medium" | "high";
  avoidanceYaw?: number;
  avoidanceForward?: number;
  avoidanceLateral?: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function AutoStabilizationController() {
  const armedRef = useRef(false);
  const telemetryRef = useRef<TelemetrySnapshot>({});
  const trackingRef = useRef<TrackingSnapshot>({ trackingActive: false, lockedCount: 0 });
  const obstacleRef = useRef<ObstacleSnapshot>({ riskLevel: "none" });
  const holdAltitudeRef = useRef<number | null>(null);
  const integratorRef = useRef({ roll: 0, pitch: 0, altitude: 0 });
  const lastErrorRef = useRef({ roll: 0, pitch: 0, altitude: 0 });
  const lastTickRef = useRef<number>(Date.now());
  const lastAltitudeRef = useRef<{ value: number; ts: number } | null>(null);
  const balanceBiasRef = useRef({ roll: 0, pitch: 0 });
  const disturbanceRef = useRef(0);

  useEffect(() => {
    const onArm = (e: CustomEvent<{ armed: boolean }>) => {
      const armed = Boolean(e.detail?.armed);
      armedRef.current = armed;
      if (!armed) {
        holdAltitudeRef.current = null;
      }
    };

    const onFlightCommand = (e: CustomEvent<{ command: string }>) => {
      const command = e.detail?.command;
      if (command === "takeoff" || command === "rtl") {
        holdAltitudeRef.current = telemetryRef.current.altitude ?? 20;
      }
      if (command === "land" || command === "abort") {
        holdAltitudeRef.current = null;
      }
    };

    const onTelemetry = (e: CustomEvent<TelemetrySnapshot>) => {
      telemetryRef.current = {
        ...telemetryRef.current,
        ...e.detail,
      };
      if (holdAltitudeRef.current == null && armedRef.current) {
        holdAltitudeRef.current = e.detail.altitude ?? 20;
      }
    };

    const onTracking = (e: CustomEvent<TrackingSnapshot>) => {
      trackingRef.current = e.detail ?? { trackingActive: false, lockedCount: 0 };
    };

    const onObstacle = (e: CustomEvent<ObstacleSnapshot>) => {
      obstacleRef.current = e.detail ?? { riskLevel: "none" };
    };

    window.addEventListener("arm-state-changed" as any, onArm);
    window.addEventListener("flight-command" as any, onFlightCommand);
    window.addEventListener("telemetry-update" as any, onTelemetry);
    window.addEventListener("tracking-update" as any, onTracking);
    window.addEventListener("obstacle-update" as any, onObstacle);

    return () => {
      window.removeEventListener("arm-state-changed" as any, onArm);
      window.removeEventListener("flight-command" as any, onFlightCommand);
      window.removeEventListener("telemetry-update" as any, onTelemetry);
      window.removeEventListener("tracking-update" as any, onTracking);
      window.removeEventListener("obstacle-update" as any, onObstacle);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!armedRef.current) return;

      const telemetry = telemetryRef.current;
      const tracking = trackingRef.current;
      const obstacle = obstacleRef.current;
      const attitude = telemetry.attitude ?? { pitch: 0, roll: 0, yaw: 0 };
      const currentAltitude = telemetry.altitude ?? 0;
      const holdAltitude = holdAltitudeRef.current ?? currentAltitude;
      const now = Date.now();
      const dt = Math.max(0.05, Math.min(0.35, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;

      const altitudeError = holdAltitude - currentAltitude;
      const rollError = -attitude.roll;
      const pitchError = -attitude.pitch;

      // Track low-frequency attitude bias. Sustained bias indicates CG shift from payload motion.
      const biasAlpha = 0.02;
      balanceBiasRef.current.roll = balanceBiasRef.current.roll * (1 - biasAlpha) + attitude.roll * biasAlpha;
      balanceBiasRef.current.pitch = balanceBiasRef.current.pitch * (1 - biasAlpha) + attitude.pitch * biasAlpha;

      let verticalVelocity = 0;
      if (lastAltitudeRef.current) {
        const dtAlt = Math.max(0.05, (now - lastAltitudeRef.current.ts) / 1000);
        verticalVelocity = (currentAltitude - lastAltitudeRef.current.value) / dtAlt;
      }
      lastAltitudeRef.current = { value: currentAltitude, ts: now };

      const payloadShiftEstimate = clamp(
        Math.abs(balanceBiasRef.current.roll) / 18 +
          Math.abs(balanceBiasRef.current.pitch) / 18 +
          Math.abs(verticalVelocity) / 10,
        0,
        1.2,
      );

      // Disturbance observer: when the controller must consistently fight bias,
      // ramp compensation so balance recovers after payload shifts.
      disturbanceRef.current = clamp(
        disturbanceRef.current * 0.94 + payloadShiftEstimate * 0.08,
        0,
        1.2,
      );
      const adaptiveScale = 1 + disturbanceRef.current * 0.65;

      const kp = { roll: 0.18 * adaptiveScale, pitch: 0.18 * adaptiveScale, altitude: 0.11 * adaptiveScale };
      const ki = { roll: 0.05 * adaptiveScale, pitch: 0.05 * adaptiveScale, altitude: 0.06 * adaptiveScale };
      const kd = { roll: 0.09 * adaptiveScale, pitch: 0.09 * adaptiveScale, altitude: 0.07 * adaptiveScale };

      integratorRef.current.roll = clamp(integratorRef.current.roll + rollError * dt, -20, 20);
      integratorRef.current.pitch = clamp(integratorRef.current.pitch + pitchError * dt, -20, 20);
      integratorRef.current.altitude = clamp(integratorRef.current.altitude + altitudeError * dt, -12, 12);

      const rollDerivative = (rollError - lastErrorRef.current.roll) / dt;
      const pitchDerivative = (pitchError - lastErrorRef.current.pitch) / dt;
      const altitudeDerivative = (altitudeError - lastErrorRef.current.altitude) / dt;
      lastErrorRef.current = { roll: rollError, pitch: pitchError, altitude: altitudeError };

      const rollCorrection = clamp(
        kp.roll * rollError + ki.roll * integratorRef.current.roll + kd.roll * rollDerivative,
        -14,
        14,
      );
      const pitchCorrection = clamp(
        kp.pitch * pitchError + ki.pitch * integratorRef.current.pitch + kd.pitch * pitchDerivative,
        -14,
        14,
      );
      const throttleCorrection = clamp(
        kp.altitude * altitudeError +
          ki.altitude * integratorRef.current.altitude +
          kd.altitude * altitudeDerivative,
        -4.5,
        4.5,
      );

      // AI target-follow assist only when tracking has a locked target.
      let yawCorrection =
        tracking.trackingActive && tracking.lockedCount > 0 && typeof tracking.targetOffsetX === "number"
          ? clamp(tracking.targetOffsetX * 12, -16, 16)
          : 0;

      // Drive forward/back using both vertical offset and target apparent size (distance proxy).
      let forwardCorrection =
        tracking.trackingActive && tracking.lockedCount > 0 && typeof tracking.targetOffsetY === "number"
          ? clamp(-tracking.targetOffsetY * 3.5, -3.5, 3.5)
          : 0;
      if (
        tracking.trackingActive &&
        tracking.lockedCount > 0 &&
        typeof tracking.targetSizeRatio === "number" &&
        tracking.targetSizeRatio > 0
      ) {
        const desiredSizeRatio = 0.1;
        const sizeError = desiredSizeRatio - tracking.targetSizeRatio;
        forwardCorrection = clamp(forwardCorrection + sizeError * 12, -4, 4);
      }

      // Obstacle avoidance authority can override follow vector when risk is high.
      let lateralCorrection = 0;
      if (obstacle.riskLevel === "high") {
        yawCorrection = clamp(yawCorrection + (obstacle.avoidanceYaw ?? 0) * 14, -18, 18);
        forwardCorrection = clamp(Math.min(forwardCorrection, -1.5) + (obstacle.avoidanceForward ?? 0) * 3, -5, 2);
        lateralCorrection = clamp((obstacle.avoidanceLateral ?? 0) * 4, -4, 4);
      } else if (obstacle.riskLevel === "medium") {
        yawCorrection = clamp(yawCorrection + (obstacle.avoidanceYaw ?? 0) * 8, -16, 16);
        forwardCorrection = clamp(forwardCorrection + (obstacle.avoidanceForward ?? 0) * 2, -4, 3);
        lateralCorrection = clamp((obstacle.avoidanceLateral ?? 0) * 2.5, -3, 3);
      }

      window.dispatchEvent(
        new CustomEvent("flight-command", {
          detail: {
            command: "stabilize_adjust",
            source: "ai_stabilizer",
            corrections: {
              roll: rollCorrection,
              pitch: pitchCorrection,
              yaw: yawCorrection,
              throttle: throttleCorrection,
              forward: forwardCorrection,
              lateral: lateralCorrection,
            },
            confidence: tracking.confidence ?? null,
            payloadShiftEstimate: Math.round(payloadShiftEstimate * 100) / 100,
            obstacleRisk: obstacle.riskLevel,
          },
        }),
      );

      window.dispatchEvent(
        new CustomEvent("stabilizer-status", {
          detail: {
            armed: armedRef.current,
            payloadShiftEstimate: Math.round(payloadShiftEstimate * 100) / 100,
            disturbanceCompensation: Math.round(disturbanceRef.current * 100) / 100,
            holdAltitude,
            altitudeError: Math.round(altitudeError * 100) / 100,
            adaptiveScale: Math.round(adaptiveScale * 100) / 100,
          },
        }),
      );
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return null;
}
