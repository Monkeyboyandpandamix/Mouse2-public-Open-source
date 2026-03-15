import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUp, Navigation, Gauge, Thermometer, Zap, Activity, AlertTriangle } from "lucide-react";
import { AttitudeIndicator } from "./AttitudeIndicator";
import { GyroscopeIndicator } from "./GyroscopeIndicator";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";

interface MotorData {
  rpm: number;
  temp: number;
  current: number;
  status: 'ok' | 'warning' | 'error';
}

interface SensorHealth {
  lidarRange: number | null;
  cpuTemp: number | null;
  escTemp: number | null;
  vibration: number | null;
  barometer: number | null;
  imuStatus: string;
  compassStatus: string;
}

interface StabilizerStatus {
  armed: boolean;
  payloadShiftEstimate: number;
  disturbanceCompensation: number;
  holdAltitude: number;
  altitudeError: number;
  adaptiveScale: number;
}

interface AutomationScriptRun {
  id?: string;
  name?: string;
  trigger?: string;
  reason?: string;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function TelemetryPanel() {
  const [motorCount, setMotorCount] = useState(() => {
    const saved = localStorage.getItem('mouse_motor_count');
    return saved ? parseInt(saved) : 4;
  });

  const [motors, setMotors] = useState<MotorData[]>([]);

  const [attitude, setAttitude] = useState({ pitch: 0, roll: 0, yaw: 0 });
  const [heading, setHeading] = useState(0);
  const [sensorHealth, setSensorHealth] = useState<SensorHealth>({
    lidarRange: null,
    cpuTemp: null,
    escTemp: null,
    vibration: null,
    barometer: null,
    imuStatus: "NO DATA",
    compassStatus: "NO DATA",
  });
  const [stabilizerStatus, setStabilizerStatus] = useState<StabilizerStatus | null>(null);
  const [lastAutomationRun, setLastAutomationRun] = useState<{
    name: string;
    reason: string;
    trigger: string;
    at: number;
  } | null>(null);
  
  // Flight state
  const [altitude, setAltitude] = useState(0);
  const [groundSpeed, setGroundSpeed] = useState(0);
  const [batteryPercent, setBatteryPercent] = useState(100);
  const [batteryVoltage, setBatteryVoltage] = useState(16.8);
  const [batteryCurrent, setBatteryCurrent] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"no_fix" | "2d_fix" | "3d_fix">("no_fix");
  const [gpsSatellites, setGpsSatellites] = useState(0);
  const [flightMode, setFlightMode] = useState<'idle' | 'takeoff' | 'flying' | 'landing' | 'rtl'>('idle');
  // Default location - Burlington, NC
  const [position, setPosition] = useState({ lat: 36.0957, lng: -79.4378 });
  const [homePosition, setHomePosition] = useState({ lat: 36.0957, lng: -79.4378 });
  
  // Get user's actual GPS location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(loc);
          setHomePosition(loc);
        },
        () => console.log("Using default telemetry location")
      );
    }
  }, []);

  useEffect(() => {
    const handleStabilizerStatus = (e: CustomEvent<StabilizerStatus>) => {
      const d = e.detail;
      if (!d) return;
      setStabilizerStatus({
        armed: Boolean(d.armed),
        payloadShiftEstimate: Number(d.payloadShiftEstimate) || 0,
        disturbanceCompensation: Number(d.disturbanceCompensation) || 0,
        holdAltitude: Number(d.holdAltitude) || 0,
        altitudeError: Number(d.altitudeError) || 0,
        adaptiveScale: Number(d.adaptiveScale) || 1,
      });
    };
    const handleAutomationRun = (e: CustomEvent<AutomationScriptRun>) => {
      const d = e.detail || {};
      setLastAutomationRun({
        name: d.name || "Unnamed script",
        reason: d.reason || "Manual run",
        trigger: d.trigger || "manual",
        at: Date.now(),
      });
    };
    window.addEventListener("stabilizer-status" as any, handleStabilizerStatus);
    window.addEventListener("automation-script-run" as any, handleAutomationRun);
    return () => {
      window.removeEventListener("stabilizer-status" as any, handleStabilizerStatus);
      window.removeEventListener("automation-script-run" as any, handleAutomationRun);
    };
  }, []);
  const [distToHome, setDistToHome] = useState(0);
  const lastExternalTelemetryTsRef = useRef(0);
  const batteryPercentRef = useRef(100);
  const [guidedTarget, setGuidedTarget] = useState<{ lat: number; lng: number } | null>(null);
  
  // Use refs to avoid stale closures
  const positionRef = useRef(position);
  const homePositionRef = useRef(homePosition);
  
  // Keep refs in sync with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  
  useEffect(() => {
    homePositionRef.current = homePosition;
  }, [homePosition]);

  useEffect(() => {
    batteryPercentRef.current = batteryPercent;
  }, [batteryPercent]);
  
  // Calculate distance between two points in meters
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  
  // Track drone arm state - only update telemetry when armed
  const [isArmed, setIsArmed] = useState(() => {
    const saved = localStorage.getItem('mouse_drone_armed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const handleMotorCountChange = (e: CustomEvent) => {
      setMotorCount(e.detail);
    };
    const handleArmStateChange = (e: CustomEvent<{ armed: boolean }>) => {
      setIsArmed(e.detail.armed);
      if (!e.detail.armed) {
        // Reset flight state when disarmed
        setFlightMode('idle');
        setAltitude(0);
        setGroundSpeed(0);
        setBatteryCurrent(0);
      }
    };
    const handleCommandAck = (e: CustomEvent<{ commandType?: string; command?: { type?: string; payload?: any } }>) => {
      const commandType = String(e.detail?.commandType || e.detail?.command?.type || "").trim().toLowerCase();
      const commandPayload = e.detail?.command?.payload;
      switch (commandType) {
        case "arm":
          setFlightMode("takeoff");
          setHomePosition({ ...positionRef.current });
          break;
        case "land":
          setFlightMode("landing");
          break;
        case "rtl":
          setFlightMode("rtl");
          if (commandPayload?.target && typeof commandPayload.target.lat === "number" && typeof commandPayload.target.lng === "number") {
            setHomePosition({ lat: commandPayload.target.lat, lng: commandPayload.target.lng });
          }
          break;
        case "abort":
        case "disarm":
          setFlightMode("idle");
          setAltitude(0);
          setGroundSpeed(0);
          setGuidedTarget(null);
          break;
      }
    };
    const handleNavGuidance = (e: CustomEvent<{ command?: string; target?: any }>) => {
      if (e.detail?.command === "guided-waypoint" && typeof e.detail.target?.lat === "number" && typeof e.detail.target?.lng === "number") {
        setGuidedTarget({ lat: e.detail.target.lat, lng: e.detail.target.lng });
        setFlightMode("rtl");
      }
    };
    const handleSensorUpdate = (e: CustomEvent<any>) => {
      const d = e.detail || {};
      setSensorHealth((prev) => ({
        ...prev,
        lidarRange: typeof d.lidarRange === "number" ? d.lidarRange : prev.lidarRange,
        cpuTemp: typeof d.cpuTemp === "number" ? d.cpuTemp : prev.cpuTemp,
        escTemp: typeof d.escTemp === "number" ? d.escTemp : prev.escTemp,
        vibration: typeof d.vibration === "number" ? d.vibration : prev.vibration,
        barometer: typeof d.barometer === "number" ? d.barometer : prev.barometer,
        imuStatus: typeof d.imuStatus === "string" ? d.imuStatus : prev.imuStatus,
        compassStatus: typeof d.compassStatus === "string" ? d.compassStatus : prev.compassStatus,
      }));
    };
    const handleMotorTelemetry = (e: CustomEvent<any>) => {
      const list = Array.isArray(e.detail?.motors) ? e.detail.motors : Array.isArray(e.detail) ? e.detail : null;
      if (!list) return;
      setMotors((prev) =>
        list.map((m: any, idx: number) => ({
          rpm: Number.isFinite(m?.rpm) ? m.rpm : prev[idx]?.rpm ?? 0,
          temp: Number.isFinite(m?.temp) ? m.temp : prev[idx]?.temp ?? 0,
          current: Number.isFinite(m?.current) ? m.current : prev[idx]?.current ?? 0,
          status: m?.status === "warning" || m?.status === "error" ? m.status : "ok",
        })),
      );
    };
    window.addEventListener('motor-count-changed' as any, handleMotorCountChange);
    window.addEventListener('arm-state-changed' as any, handleArmStateChange);
    window.addEventListener('command-acked' as any, handleCommandAck);
    window.addEventListener('ml-nav-guidance' as any, handleNavGuidance);
    window.addEventListener('sensor-update' as any, handleSensorUpdate);
    window.addEventListener('motor-telemetry-update' as any, handleMotorTelemetry);
    return () => {
      window.removeEventListener('motor-count-changed' as any, handleMotorCountChange);
      window.removeEventListener('arm-state-changed' as any, handleArmStateChange);
      window.removeEventListener('command-acked' as any, handleCommandAck);
      window.removeEventListener('ml-nav-guidance' as any, handleNavGuidance);
      window.removeEventListener('sensor-update' as any, handleSensorUpdate);
      window.removeEventListener('motor-telemetry-update' as any, handleMotorTelemetry);
    };
  }, []);

  // Initialize motors based on motor count - all start at zero until real data arrives
  useEffect(() => {
    const newMotors: MotorData[] = [];
    for (let i = 0; i < motorCount; i++) {
      newMotors.push({
        rpm: 0,
        temp: 0,
        current: 0,
        status: 'ok'
      });
    }
    setMotors(newMotors);
  }, [motorCount]);

  // Listen for real telemetry data from WebSocket/MAVLink
  // This will be populated when connected to an actual drone
  useEffect(() => {
    const handleTelemetryUpdate = (e: CustomEvent<{
      attitude?: { pitch: number; roll: number; yaw: number };
      heading?: number;
      altitude?: number;
      groundSpeed?: number;
      position?: { lat: number; lng: number };
      motors?: MotorData[];
      cpuTemp?: number;
      vibrationX?: number;
      vibrationY?: number;
      vibrationZ?: number;
      pressure?: number;
      lidarRange?: number;
      source?: string;
      batteryPercent?: number;
      batteryVoltage?: number;
      batteryCurrent?: number;
      gpsFixType?: number | string;
      gpsStatus?: string;
      gpsSatellites?: number;
    }>) => {
      const data = e.detail;
      (window as any).__currentTelemetry = { ...(window as any).__currentTelemetry, ...data };
      if (data.source !== 'sim') {
        lastExternalTelemetryTsRef.current = Date.now();
      }
      if (data.attitude) setAttitude(data.attitude);
      if (data.heading !== undefined) setHeading(data.heading);
      if (data.altitude !== undefined) setAltitude(data.altitude);
      if (data.groundSpeed !== undefined) setGroundSpeed(data.groundSpeed);
      if (data.position) setPosition(data.position);
      if (data.motors) setMotors(data.motors);
      if (typeof data.batteryPercent === "number") {
        setBatteryPercent(clamp(data.batteryPercent, 0, 100));
      } else if (typeof data.batteryVoltage === "number") {
        const inferred = clamp(((data.batteryVoltage - 13.2) / (16.8 - 13.2)) * 100, 0, 100);
        setBatteryPercent(inferred);
      }
      if (typeof data.batteryVoltage === "number") {
        setBatteryVoltage(data.batteryVoltage);
      } else {
        setBatteryVoltage(13.2 + (batteryPercentRef.current / 100) * (16.8 - 13.2));
      }
      if (typeof data.batteryCurrent === "number") setBatteryCurrent(Math.max(0, data.batteryCurrent));
      if (typeof data.gpsSatellites === "number") setGpsSatellites(Math.max(0, Math.round(data.gpsSatellites)));
      if (data.gpsStatus === "3d_fix" || data.gpsStatus === "2d_fix" || data.gpsStatus === "no_fix") {
        setGpsStatus(data.gpsStatus);
      } else if (data.gpsFixType === 3) {
        setGpsStatus("3d_fix");
      } else if (data.gpsFixType === 2) {
        setGpsStatus("2d_fix");
      } else if (data.gpsFixType === 0 || data.gpsFixType === "no_fix") {
        setGpsStatus("no_fix");
      }
      setSensorHealth((prev) => {
        const escTempFromMotors = data.motors?.length
          ? Math.max(...data.motors.map((m) => m.temp ?? 0))
          : prev.escTemp;
        const vibrationMagnitude =
          typeof data.vibrationX === "number" &&
          typeof data.vibrationY === "number" &&
          typeof data.vibrationZ === "number"
            ? Math.sqrt(data.vibrationX ** 2 + data.vibrationY ** 2 + data.vibrationZ ** 2)
            : prev.vibration;
        return {
          lidarRange: typeof data.lidarRange === "number" ? data.lidarRange : prev.lidarRange,
          cpuTemp: typeof data.cpuTemp === "number" ? data.cpuTemp : prev.cpuTemp,
          escTemp: typeof escTempFromMotors === "number" ? escTempFromMotors : prev.escTemp,
          vibration: typeof vibrationMagnitude === "number" ? vibrationMagnitude : prev.vibration,
          barometer: typeof data.pressure === "number" ? data.pressure : prev.barometer,
          imuStatus: data.attitude ? "OK" : prev.imuStatus,
          compassStatus: typeof data.heading === "number" ? "OK" : prev.compassStatus,
        };
      });
    };

    window.addEventListener('telemetry-update' as any, handleTelemetryUpdate);
    return () => window.removeEventListener('telemetry-update' as any, handleTelemetryUpdate);
  }, []);

  // Pull environmental pressure/temperature when available to populate sensor tab.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/bme688/read");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSensorHealth((prev) => ({
          ...prev,
          barometer: typeof data.pressure === "number" ? data.pressure : prev.barometer,
          cpuTemp:
            typeof data.temperature_c === "number"
              ? Math.max(prev.cpuTemp ?? 0, data.temperature_c)
              : prev.cpuTemp,
        }));
      } catch {
        // ignore polling errors
      }
    };
    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Local fallback telemetry simulation when no external stream is available.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isArmed) return;
      if (Date.now() - lastExternalTelemetryTsRef.current < 2000) return;

      const altitudeStep = flightMode === 'takeoff' ? 1.2 : flightMode === 'landing' ? -1.1 : 0;
      const nextAltitude = Math.max(0, altitude + altitudeStep);
      const nextSpeed = flightMode === 'takeoff' || flightMode === 'flying' || flightMode === 'rtl' ? Math.max(2, groundSpeed) : Math.max(0, groundSpeed - 0.5);
      const currentDrawA = flightMode === "idle" ? 0.4 : flightMode === "flying" ? 14 : flightMode === "rtl" ? 16 : 11;
      const drainPctPerTick = currentDrawA / 65 / 4; // ~65A equivalent pack draw over 1s at 250ms tick
      const nextBatteryPercent = clamp(batteryPercent - drainPctPerTick, 0, 100);
      const nextBatteryVoltage = 13.2 + (nextBatteryPercent / 100) * (16.8 - 13.2);
      const yawDelta = flightMode === 'rtl' ? 1.5 : 0.2;
      const nextYaw = attitude.yaw + yawDelta;
      const nextHeading = ((heading + yawDelta) % 360 + 360) % 360;

      if (flightMode === 'takeoff' && nextAltitude > 8) {
        setFlightMode('flying');
      }
      if (flightMode === 'landing' && nextAltitude <= 0.1) {
        setFlightMode('idle');
      }

      const movementScale = nextSpeed * 0.00001;
      const rad = (nextHeading * Math.PI) / 180;
      let nextPosition = {
        lat: position.lat + Math.cos(rad) * movementScale,
        lng: position.lng + Math.sin(rad) * movementScale,
      };

      if (guidedTarget) {
        const dLat = guidedTarget.lat - position.lat;
        const dLng = guidedTarget.lng - position.lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        if (dist < 0.00001) {
          setGuidedTarget(null);
          window.dispatchEvent(
            new CustomEvent("waypoint-reached", {
              detail: { lat: guidedTarget.lat, lng: guidedTarget.lng },
            }),
          );
        } else {
          const step = Math.min(0.15, movementScale / Math.max(dist, 0.0000001));
          nextPosition = {
            lat: position.lat + dLat * step,
            lng: position.lng + dLng * step,
          };
        }
      }

      setBatteryPercent(nextBatteryPercent);
      setBatteryVoltage(nextBatteryVoltage);
      setBatteryCurrent(currentDrawA);
      setGpsSatellites((prev) => (flightMode === "idle" ? Math.max(0, prev - 1) : Math.min(16, Math.max(8, prev + 1))));
      setGpsStatus(flightMode === "idle" ? "no_fix" : "3d_fix");

      window.dispatchEvent(
        new CustomEvent('telemetry-update', {
          detail: {
            source: 'sim',
            attitude: {
              pitch: flightMode === 'takeoff' ? Math.max(0, 10 - nextAltitude) : attitude.pitch * 0.95,
              roll: attitude.roll * 0.95,
              yaw: nextYaw,
            },
            heading: nextHeading,
            altitude: nextAltitude,
            groundSpeed: nextSpeed,
            position: nextPosition,
            batteryPercent: nextBatteryPercent,
            batteryVoltage: nextBatteryVoltage,
            batteryCurrent: currentDrawA,
            gpsStatus: flightMode === "idle" ? "no_fix" : "3d_fix",
            gpsSatellites: flightMode === "idle" ? 0 : Math.min(16, Math.max(8, gpsSatellites)),
            motors: motors.length
              ? motors.map((m) => ({
                  ...m,
                  rpm: flightMode === 'idle' ? 0 : Math.max(1200, m.rpm || 1800),
                  temp: Math.min(75, (m.temp || 25) + 0.2),
                  current: flightMode === 'idle' ? 0 : Math.max(4, m.current || 6),
                  status: 'ok' as const,
                }))
              : undefined,
          },
        }),
      );
      (window as any).__currentTelemetry = {
        ...(window as any).__currentTelemetry,
        source: 'sim',
        attitude: {
          pitch: flightMode === 'takeoff' ? Math.max(0, 10 - nextAltitude) : attitude.pitch * 0.95,
          roll: attitude.roll * 0.95,
          yaw: nextYaw,
        },
        heading: nextHeading,
        altitude: nextAltitude,
        groundSpeed: nextSpeed,
        position: nextPosition,
        batteryPercent: nextBatteryPercent,
        batteryVoltage: nextBatteryVoltage,
        batteryCurrent: currentDrawA,
        gpsStatus: flightMode === "idle" ? "no_fix" : "3d_fix",
        gpsSatellites: flightMode === "idle" ? 0 : Math.min(16, Math.max(8, gpsSatellites)),
      };
    }, 250);

    return () => clearInterval(interval);
  }, [isArmed, flightMode, altitude, groundSpeed, heading, attitude, position, motors, guidedTarget, batteryPercent, gpsSatellites]);

  // Update distance to home when position changes
  useEffect(() => {
    const dist = calculateDistance(position.lat, position.lng, homePosition.lat, homePosition.lng);
    setDistToHome(dist);
  }, [position, homePosition]);

  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className="w-10 h-full border-l border-border bg-card/80 backdrop-blur-md flex flex-col items-center py-4">
        <button 
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Expand Telemetry"
        >
          <Gauge className="h-5 w-5" />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[10px] text-muted-foreground">
          <div className="writing-mode-vertical transform -rotate-90 whitespace-nowrap">TELEMETRY</div>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-56 sm:w-64 lg:w-80 h-full border-l border-border rounded-none bg-card/80 backdrop-blur-md overflow-hidden flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-xs sm:text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Telemetry
            {isArmed ? (
              <Badge variant="default" className="bg-emerald-500/20 text-emerald-500 text-[8px] px-1.5 py-0 border-emerald-500/30">LIVE</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[8px] px-1.5 py-0">OFFLINE</Badge>
            )}
          </span>
          <button 
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Collapse"
          >
            <ArrowUp className="h-3 w-3 rotate-90" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <Tabs defaultValue="flight" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 mx-4">
            <TabsTrigger value="flight" className="text-xs">Flight</TabsTrigger>
            <TabsTrigger value="motors" className="text-xs">Motors</TabsTrigger>
            <TabsTrigger value="sensors" className="text-xs">Sensors</TabsTrigger>
          </TabsList>

          <TabsContent value="flight" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
            {/* Attitude & Gyro Indicators */}
            <div className="flex justify-center gap-4 py-2">
              <div className="text-center">
                <AttitudeIndicator pitch={attitude.pitch} roll={attitude.roll} size={100} />
                <p className="text-[10px] text-muted-foreground mt-6">ATTITUDE</p>
              </div>
              <div className="text-center">
                <GyroscopeIndicator yaw={attitude.yaw} heading={heading} size={100} />
                <p className="text-[10px] text-muted-foreground mt-6">HEADING</p>
              </div>
            </div>

            <Separator />

            {/* Altitude & Speed */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Altitude (AGL)</span>
                <div className="text-2xl font-mono font-bold text-primary flex items-baseline gap-1">
                  {altitude.toFixed(1)} <span className="text-sm text-muted-foreground">m</span>
                </div>
                <Progress value={Math.min((altitude / 100) * 100, 100)} className="h-1 bg-muted" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Ground Speed</span>
                <div className="text-2xl font-mono font-bold text-primary flex items-baseline gap-1">
                  {groundSpeed.toFixed(1)} <span className="text-sm text-muted-foreground">m/s</span>
                </div>
                <Progress value={Math.min((groundSpeed / 20) * 100, 100)} className="h-1 bg-muted" />
              </div>
            </div>

            <Separator />

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground uppercase">Battery</span>
                <span className={batteryPercent <= 20 ? "font-mono text-red-500" : "font-mono text-emerald-500"}>
                  {batteryPercent.toFixed(0)}% ({batteryVoltage.toFixed(1)}V)
                </span>
              </div>
              <Progress value={batteryPercent} className="h-1 bg-muted" />
            </div>

            <Separator />

            {/* Attitude Values */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted/20 rounded border border-border/50">
                <div className="text-xs text-muted-foreground">PITCH</div>
                <div className="font-mono text-lg text-foreground">{attitude.pitch.toFixed(1)}°</div>
              </div>
              <div className="p-2 bg-muted/20 rounded border border-border/50">
                <div className="text-xs text-muted-foreground">ROLL</div>
                <div className="font-mono text-lg text-foreground">{attitude.roll.toFixed(1)}°</div>
              </div>
              <div className="p-2 bg-muted/20 rounded border border-border/50">
                <div className="text-xs text-muted-foreground">YAW</div>
                <div className="font-mono text-lg text-foreground">{attitude.yaw.toFixed(0)}°</div>
              </div>
            </div>

            <Separator />

            {/* GPS & Navigation */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                  <Navigation className="h-3 w-3" /> Heading
                </span>
                <span className="font-mono text-primary">NW {heading.toFixed(0)}°</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase">Dist. to Home</span>
                <span className="font-mono text-foreground">{Math.round(distToHome)}m</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase">Next Waypoint</span>
                <span className="font-mono text-muted-foreground">---</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold">Autonomy</span>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Stabilizer</span>
                <span className={stabilizerStatus?.armed ? "font-mono text-emerald-500" : "font-mono text-muted-foreground"}>
                  {stabilizerStatus?.armed ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Payload Shift</span>
                <span className="font-mono text-foreground">
                  {stabilizerStatus ? stabilizerStatus.payloadShiftEstimate.toFixed(2) : "---"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Disturbance Comp.</span>
                <span className="font-mono text-foreground">
                  {stabilizerStatus ? stabilizerStatus.disturbanceCompensation.toFixed(2) : "---"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Last Script</span>
                <span className="font-mono text-muted-foreground">
                  {lastAutomationRun
                    ? `${lastAutomationRun.name.slice(0, 14)} (${lastAutomationRun.trigger})`
                    : "---"}
                </span>
              </div>
            </div>

            <Separator />

            {/* Position Data */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground uppercase font-bold">Position</span>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lat:</span>
                  <span className="text-foreground">{position.lat.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lon:</span>
                  <span className="text-foreground">{position.lng.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GPS Fix:</span>
                  <span className={gpsStatus === "3d_fix" ? "text-emerald-500" : gpsStatus === "2d_fix" ? "text-amber-500" : "text-muted-foreground"}>
                    {gpsStatus.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Satellites:</span>
                  <span className="text-foreground">{gpsSatellites || 0}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="motors" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                {motorCount} Motors Configured
              </Badge>
            </div>

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Zap className="h-3 w-3" /> Motor RPM
              </span>
              
              {motors.map((motor, idx) => (
                <div key={idx} className="space-y-1" data-testid={`motor-rpm-${idx + 1}`}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Motor {idx + 1}
                      {motor.status === 'warning' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      {motor.status === 'error' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    </span>
                    <span className="font-mono text-primary">{Math.round(motor.rpm)} RPM</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary" 
                      style={{ width: `${Math.min((motor.rpm / 5000) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Thermometer className="h-3 w-3" /> Motor Temps
              </span>
              
              {motors.map((motor, idx) => (
                <div key={idx} className="space-y-1" data-testid={`motor-temp-${idx + 1}`}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Motor {idx + 1}</span>
                    <span className={`font-mono ${motor.temp > 60 ? 'text-red-500' : motor.temp > 50 ? 'text-amber-500' : 'text-amber-400'}`}>
                      {motor.temp.toFixed(1)}°C
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${motor.temp > 60 ? 'bg-red-500' : motor.temp > 50 ? 'bg-amber-500' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min((motor.temp / 80) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Activity className="h-3 w-3" /> Current Draw
              </span>
              
              {motors.map((motor, idx) => (
                <div key={idx} className="space-y-1" data-testid={`motor-current-${idx + 1}`}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Motor {idx + 1}</span>
                    <span className="font-mono text-emerald-500">{motor.current.toFixed(1)}A</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${Math.min((motor.current / 20) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="sensors" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold">System Health</span>
              <p className="text-xs text-muted-foreground italic">
                {(sensorHealth.cpuTemp || sensorHealth.lidarRange || sensorHealth.vibration)
                  ? "Live sensor telemetry"
                  : "Waiting for sensor data..."}
              </p>
              
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">LiDAR Range</span>
                  <span className="font-mono text-muted-foreground">
                    {sensorHealth.lidarRange != null ? `${sensorHealth.lidarRange.toFixed(1)}m` : "---"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${sensorHealth.lidarRange != null ? Math.min(100, (sensorHealth.lidarRange / 50) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Thermometer className="h-3 w-3" /> CPU Temp
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {sensorHealth.cpuTemp != null ? `${sensorHealth.cpuTemp.toFixed(1)}°C` : "---"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${sensorHealth.cpuTemp != null ? Math.min(100, (sensorHealth.cpuTemp / 90) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Thermometer className="h-3 w-3" /> ESC Temp
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {sensorHealth.escTemp != null ? `${sensorHealth.escTemp.toFixed(1)}°C` : "---"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${sensorHealth.escTemp != null ? Math.min(100, (sensorHealth.escTemp / 90) * 100) : 0}%` }}
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Vibration</span>
                  <span className="font-mono text-muted-foreground">
                    {sensorHealth.vibration != null ? sensorHealth.vibration.toFixed(2) : "---"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive"
                    style={{ width: `${sensorHealth.vibration != null ? Math.min(100, sensorHealth.vibration * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold">Additional Sensors</span>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between p-2 bg-muted/20 rounded">
                  <span className="text-muted-foreground">Barometer</span>
                  <span className="font-mono text-muted-foreground">
                    {sensorHealth.barometer != null ? `${sensorHealth.barometer.toFixed(1)} hPa` : "---"}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-muted/20 rounded">
                  <span className="text-muted-foreground">IMU Status</span>
                  <span className="font-mono text-muted-foreground">{sensorHealth.imuStatus}</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/20 rounded">
                  <span className="text-muted-foreground">Compass</span>
                  <span className="font-mono text-muted-foreground">{sensorHealth.compassStatus}</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
