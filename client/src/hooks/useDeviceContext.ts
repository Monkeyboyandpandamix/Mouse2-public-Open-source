import { useState, useEffect, useCallback } from "react";

export type DeviceEnvironment = "ground_controller" | "drone_onboard";

export type PeripheralMapping = {
  microphone: "local_preview" | "drone_speaker";
  speaker: "local_playback" | "drone_mic_listen";
  camera: "local_webcam" | "drone_gimbal";
  gps: "device_gps" | "drone_gps";
  imu: "none" | "drone_imu";
  barometer: "none" | "drone_baro";
  lidar: "none" | "drone_lidar";
};

export interface DeviceContextState {
  environment: DeviceEnvironment;
  isOnboard: boolean;
  isController: boolean;
  deviceRole: string;
  runtimeConfigLoaded: boolean;
  connectedDroneId: string | null;
  connectedDroneName: string | null;
  peripherals: PeripheralMapping;
  capabilities: {
    hasLocalMic: boolean;
    hasLocalCamera: boolean;
    hasLocalGps: boolean;
    canControlDrone: boolean;
    canReceiveTelemetry: boolean;
    canBroadcastAudio: boolean;
    canAccessDroneCamera: boolean;
    canAccessDroneSensors: boolean;
  };
  networkStatus: "connected" | "degraded" | "disconnected";
  latencyMs: number;
}

const DEFAULT_GROUND_PERIPHERALS: PeripheralMapping = {
  microphone: "drone_speaker",
  speaker: "drone_mic_listen",
  camera: "drone_gimbal",
  gps: "drone_gps",
  imu: "drone_imu",
  barometer: "drone_baro",
  lidar: "drone_lidar",
};

const DEFAULT_ONBOARD_PERIPHERALS: PeripheralMapping = {
  microphone: "local_preview",
  speaker: "local_playback",
  camera: "local_webcam",
  gps: "device_gps",
  imu: "drone_imu",
  barometer: "drone_baro",
  lidar: "drone_lidar",
};

export function useDeviceContext(): DeviceContextState & {
  setEnvironment: (env: DeviceEnvironment) => void;
  setPeripheralMapping: (key: keyof PeripheralMapping, value: string) => void;
  refreshCapabilities: () => void;
} {
  const [environment, setEnvironmentState] = useState<DeviceEnvironment>("ground_controller");
  const [isOnboard, setIsOnboard] = useState(false);
  const [runtimeConfigLoaded, setRuntimeConfigLoaded] = useState(false);
  const [connectedDroneId, setConnectedDroneId] = useState<string | null>(null);
  const [connectedDroneName, setConnectedDroneName] = useState<string | null>(null);
  const [peripherals, setPeripherals] = useState<PeripheralMapping>(DEFAULT_GROUND_PERIPHERALS);
  const [networkStatus, setNetworkStatus] = useState<"connected" | "degraded" | "disconnected">("connected");
  const [latencyMs, setLatencyMs] = useState(0);
  const [capabilities, setCapabilities] = useState({
    hasLocalMic: false,
    hasLocalCamera: false,
    hasLocalGps: false,
    canControlDrone: true,
    canReceiveTelemetry: true,
    canBroadcastAudio: true,
    canAccessDroneCamera: true,
    canAccessDroneSensors: true,
  });

  const refreshCapabilities = useCallback(() => {
    const caps = { ...capabilities };

    if (typeof navigator !== "undefined") {
      caps.hasLocalMic = !!(navigator.mediaDevices?.getUserMedia);
      caps.hasLocalCamera = !!(navigator.mediaDevices?.getUserMedia);
      caps.hasLocalGps = !!navigator.geolocation;
    }

    const isCtrl = environment === "ground_controller";
    caps.canControlDrone = true;
    caps.canReceiveTelemetry = true;
    caps.canBroadcastAudio = isCtrl && caps.hasLocalMic;
    caps.canAccessDroneCamera = true;
    caps.canAccessDroneSensors = true;

    setCapabilities(caps);
  }, [environment]);

  useEffect(() => {
    fetch("/api/runtime-config")
      .then((r) => r.json())
      .then((config) => {
        const onboard = Boolean(config.isOnboard);
        setIsOnboard(onboard);
        if (onboard) {
          setEnvironmentState("drone_onboard");
          setPeripherals(DEFAULT_ONBOARD_PERIPHERALS);
        } else {
          setEnvironmentState("ground_controller");
          setPeripherals(DEFAULT_GROUND_PERIPHERALS);
        }
      })
      .catch(() => {})
      .finally(() => {
        setRuntimeConfigLoaded(true);
      });
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("mouse_device_context");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.environment) setEnvironmentState(parsed.environment);
        if (parsed.peripherals) setPeripherals(p => ({ ...p, ...parsed.peripherals }));
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const onDroneSelected = (e: CustomEvent<{ id?: string; name?: string; callsign?: string }>) => {
      const d = e.detail;
      setConnectedDroneId(d?.id ?? null);
      setConnectedDroneName(d?.name ?? d?.callsign ?? null);
    };

    window.addEventListener("drone-selected" as any, onDroneSelected);
    return () => window.removeEventListener("drone-selected" as any, onDroneSelected);
  }, []);

  useEffect(() => {
    refreshCapabilities();
  }, [environment, refreshCapabilities]);

  useEffect(() => {
    const checkLatency = async () => {
      try {
        const start = Date.now();
        const res = await fetch("/api/health", { method: "GET" });
        if (res.ok) {
          const ms = Date.now() - start;
          setLatencyMs(ms);
          setNetworkStatus(ms < 500 ? "connected" : ms < 2000 ? "degraded" : "disconnected");
        } else {
          setNetworkStatus("disconnected");
        }
      } catch {
        setNetworkStatus("disconnected");
      }
    };

    checkLatency();
    const timer = setInterval(checkLatency, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("device-context-changed", {
      detail: { environment, isOnboard, peripherals, networkStatus, connectedDroneId },
    }));
  }, [environment, isOnboard, peripherals, networkStatus, connectedDroneId]);

  const setEnvironment = useCallback((env: DeviceEnvironment) => {
    setEnvironmentState(env);
    const newPeripherals = env === "drone_onboard" ? DEFAULT_ONBOARD_PERIPHERALS : DEFAULT_GROUND_PERIPHERALS;
    setPeripherals(newPeripherals);
    localStorage.setItem("mouse_device_context", JSON.stringify({ environment: env, peripherals: newPeripherals }));
    window.dispatchEvent(new CustomEvent("device-context-changed", { detail: { environment: env } }));
  }, []);

  const setPeripheralMapping = useCallback((key: keyof PeripheralMapping, value: string) => {
    setPeripherals(prev => {
      const next = { ...prev, [key]: value };
      const saved = localStorage.getItem("mouse_device_context");
      const parsed = saved ? JSON.parse(saved) : {};
      localStorage.setItem("mouse_device_context", JSON.stringify({ ...parsed, peripherals: next }));
      return next;
    });
  }, []);

  return {
    environment,
    isOnboard,
    isController: environment === "ground_controller",
    deviceRole: isOnboard ? "ONBOARD" : "GROUND",
    runtimeConfigLoaded,
    connectedDroneId,
    connectedDroneName,
    peripherals,
    capabilities,
    networkStatus,
    latencyMs,
    setEnvironment,
    setPeripheralMapping,
    refreshCapabilities,
  };
}
