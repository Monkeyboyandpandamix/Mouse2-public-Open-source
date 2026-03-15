import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface TelemetryState {
  altitude: number;
  groundSpeed: number;
  heading: number;
  pitch: number;
  roll: number;
  yaw: number;
  latitude: number;
  longitude: number;
  batteryPercent: number;
  batteryVoltage: number;
  gpsSatellites: number;
  gpsStatus: string;
  flightMode: string;
  homeLatitude: number;
  homeLongitude: number;
  verticalSpeed: number;
  airSpeed: number;
  windSpeed: number;
  windDirection: number;
}

interface ARHudOverlayProps {
  visible: boolean;
  gimbalPitch?: number;
  gimbalYaw?: number;
  detectedObjectCount?: number;
  isRecording?: boolean;
  cameraMode?: string;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const min = ((abs - deg) * 60).toFixed(4);
  return `${deg}°${min}'${dir}`;
}

export function ARHudOverlay({ visible, gimbalPitch = -45, gimbalYaw = 0, detectedObjectCount = 0, isRecording = false, cameraMode = "gimbal" }: ARHudOverlayProps) {
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    altitude: 0,
    groundSpeed: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    latitude: 0,
    longitude: 0,
    batteryPercent: 100,
    batteryVoltage: 16.8,
    gpsSatellites: 0,
    gpsStatus: "no_fix",
    flightMode: "IDLE",
    homeLatitude: 0,
    homeLongitude: 0,
    verticalSpeed: 0,
    airSpeed: 0,
    windSpeed: 0,
    windDirection: 0,
  });

  const prevAltRef = useRef(0);
  const prevTimeRef = useRef(Date.now());

  const handleTelemetry = useCallback((e: Event) => {
    const data = (e as CustomEvent).detail;
    const now = Date.now();
    const dt = (now - prevTimeRef.current) / 1000;
    prevTimeRef.current = now;

    setTelemetry(prev => {
      const newAlt = data.altitude ?? prev.altitude;
      const vs = dt > 0 ? (newAlt - prevAltRef.current) / dt : prev.verticalSpeed;
      prevAltRef.current = newAlt;

      return {
        altitude: newAlt,
        groundSpeed: data.groundSpeed ?? data.speed ?? prev.groundSpeed,
        heading: data.heading ?? data.yaw ?? prev.heading,
        pitch: data.attitude?.pitch ?? prev.pitch,
        roll: data.attitude?.roll ?? prev.roll,
        yaw: data.attitude?.yaw ?? prev.yaw,
        latitude: data.position?.lat ?? data.latitude ?? prev.latitude,
        longitude: data.position?.lng ?? data.longitude ?? prev.longitude,
        batteryPercent: data.batteryPercent ?? prev.batteryPercent,
        batteryVoltage: data.batteryVoltage ?? prev.batteryVoltage,
        gpsSatellites: data.gpsSatellites ?? prev.gpsSatellites,
        gpsStatus: data.gpsStatus ?? prev.gpsStatus,
        flightMode: data.flightMode ?? prev.flightMode,
        homeLatitude: data.homePosition?.lat ?? prev.homeLatitude,
        homeLongitude: data.homePosition?.lng ?? prev.homeLongitude,
        verticalSpeed: Math.abs(vs) < 0.05 ? 0 : vs,
        airSpeed: data.airSpeed ?? prev.airSpeed,
        windSpeed: data.windSpeed ?? prev.windSpeed,
        windDirection: data.windDirection ?? prev.windDirection,
      };
    });
  }, []);

  useEffect(() => {
    window.addEventListener("telemetry-update", handleTelemetry);
    return () => window.removeEventListener("telemetry-update", handleTelemetry);
  }, [handleTelemetry]);

  useEffect(() => {
    const handleFlightCmd = (e: Event) => {
      const cmd = (e as CustomEvent).detail;
      if (cmd?.command) {
        setTelemetry(prev => ({ ...prev, flightMode: cmd.command.toUpperCase() }));
      }
    };
    window.addEventListener("flight-command", handleFlightCmd);
    return () => window.removeEventListener("flight-command", handleFlightCmd);
  }, []);

  if (!visible) return null;

  const { altitude, groundSpeed, heading, pitch, roll, latitude, longitude,
    batteryPercent, batteryVoltage, gpsSatellites, gpsStatus, flightMode,
    homeLatitude, homeLongitude, verticalSpeed } = telemetry;

  const distHome = (latitude && longitude && homeLatitude && homeLongitude)
    ? haversineDistance(latitude, longitude, homeLatitude, homeLongitude)
    : 0;

  const headingNorm = ((heading % 360) + 360) % 360;
  const battColor = batteryPercent > 50 ? "text-emerald-400" : batteryPercent > 20 ? "text-amber-400" : "text-red-400";
  const gpsColor = gpsStatus === "3d_fix" ? "text-emerald-400" : gpsStatus === "2d_fix" ? "text-amber-400" : "text-red-400";
  const vsArrow = verticalSpeed > 0.3 ? "▲" : verticalSpeed < -0.3 ? "▼" : "—";
  const vsColor = verticalSpeed > 0.3 ? "text-emerald-400" : verticalSpeed < -0.3 ? "text-amber-400" : "text-white/60";

  const compassLabels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const compassTicks: { deg: number; label: string }[] = [];
  for (let d = 0; d < 360; d += 15) {
    const idx = d / 45;
    const label = d % 45 === 0 ? compassLabels[idx] : `${d}`;
    compassTicks.push({ deg: d, label: d % 30 === 0 ? label : "" });
  }

  const pitchLines: number[] = [];
  for (let p = -60; p <= 60; p += 10) {
    if (p !== 0) pitchLines.push(p);
  }

  const altTicks: number[] = [];
  const altBase = Math.floor(altitude / 10) * 10;
  for (let a = altBase - 30; a <= altBase + 30; a += 5) {
    altTicks.push(a);
  }

  const spdTicks: number[] = [];
  const spdBase = Math.floor(groundSpeed / 5) * 5;
  for (let s = Math.max(0, spdBase - 15); s <= spdBase + 15; s += 2.5) {
    spdTicks.push(s);
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10 select-none overflow-hidden" data-testid="ar-hud-overlay">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="hudGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#00cc66" stopOpacity="0.7" />
          </linearGradient>
          <filter id="hudGlow">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* === ARTIFICIAL HORIZON (CENTER) === */}
        <g transform={`translate(500, 300)`} filter="url(#hudGlow)">
          <g transform={`rotate(${-roll})`}>
            {pitchLines.map(p => {
              const y = -(p - pitch) * 2.5;
              const halfW = Math.abs(p) % 20 === 0 ? 80 : 40;
              return (
                <g key={p}>
                  <line x1={-halfW} y1={y} x2={halfW} y2={y} stroke="#00ff88" strokeWidth="1" strokeOpacity="0.5" />
                  {Math.abs(p) % 20 === 0 && (
                    <>
                      <text x={-halfW - 8} y={y + 3} fill="#00ff88" fontSize="9" textAnchor="end" fontFamily="monospace" opacity="0.6">{p}</text>
                      <text x={halfW + 8} y={y + 3} fill="#00ff88" fontSize="9" textAnchor="start" fontFamily="monospace" opacity="0.6">{p}</text>
                    </>
                  )}
                </g>
              );
            })}

            <line x1={-200} y1={-pitch * 2.5} x2={200} y2={-pitch * 2.5} stroke="#00ff88" strokeWidth="2" strokeOpacity="0.8" />
          </g>

          <line x1={-50} y1={0} x2={-18} y2={0} stroke="#00ff88" strokeWidth="2.5" />
          <line x1={-18} y1={0} x2={-12} y2={8} stroke="#00ff88" strokeWidth="2.5" />
          <line x1={18} y1={0} x2={50} y2={0} stroke="#00ff88" strokeWidth="2.5" />
          <line x1={18} y1={0} x2={12} y2={8} stroke="#00ff88" strokeWidth="2.5" />
          <circle cx={0} cy={0} r={3} fill="#00ff88" />

          <g transform={`rotate(${-roll})`}>
            <polygon points="0,-95 -6,-85 6,-85" fill="none" stroke="#00ff88" strokeWidth="1.5" />
          </g>
          <circle cx={0} cy={0} r={92} fill="none" stroke="#00ff88" strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="4 8" />
        </g>

        {/* === COMPASS TAPE (TOP) === */}
        <g transform="translate(500, 30)" filter="url(#hudGlow)">
          <rect x={-120} y={-5} width={240} height={30} fill="black" fillOpacity="0.3" rx="3" />
          <line x1={0} y1={25} x2={0} y2={30} stroke="#00ff88" strokeWidth="2" />
          <polygon points="0,28 -4,34 4,34" fill="#00ff88" />
          {compassTicks.map(({ deg, label }) => {
            let offset = deg - headingNorm;
            if (offset > 180) offset -= 360;
            if (offset < -180) offset += 360;
            const x = offset * 1.5;
            if (Math.abs(x) > 120) return null;
            return (
              <g key={deg}>
                <line x1={x} y1={0} x2={x} y2={label ? 10 : 5} stroke="#00ff88" strokeWidth={label ? "1.5" : "0.5"} />
                {label && <text x={x} y={20} fill="#00ff88" fontSize="10" textAnchor="middle" fontFamily="monospace">{label}</text>}
              </g>
            );
          })}
          <text x={0} y={-10} fill="#00ff88" fontSize="14" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{headingNorm.toFixed(0).padStart(3, "0")}°</text>
        </g>

        {/* === SPEED TAPE (LEFT) === */}
        <g transform="translate(100, 300)" filter="url(#hudGlow)">
          <rect x={-55} y={-100} width={70} height={200} fill="black" fillOpacity="0.25" rx="3" />
          <text x={-50} y={-108} fill="#00ff88" fontSize="9" fontFamily="monospace" opacity="0.6">SPD m/s</text>
          {spdTicks.map(s => {
            const y = -(s - groundSpeed) * 10;
            if (Math.abs(y) > 95) return null;
            const isMajor = s % 5 === 0;
            return (
              <g key={s}>
                <line x1={isMajor ? -5 : 5} y1={y} x2={15} y2={y} stroke="#00ff88" strokeWidth={isMajor ? "1" : "0.5"} strokeOpacity={isMajor ? "0.8" : "0.4"} />
                {isMajor && <text x={-10} y={y + 3} fill="#00ff88" fontSize="10" textAnchor="end" fontFamily="monospace">{s.toFixed(0)}</text>}
              </g>
            );
          })}
          <rect x={-50} y={-10} width={65} height={20} fill="black" fillOpacity="0.5" stroke="#00ff88" strokeWidth="1.5" rx="2" />
          <text x={-18} y={5} fill="#00ff88" fontSize="14" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{groundSpeed.toFixed(1)}</text>
        </g>

        {/* === ALTITUDE TAPE (RIGHT) === */}
        <g transform="translate(900, 300)" filter="url(#hudGlow)">
          <rect x={-15} y={-100} width={70} height={200} fill="black" fillOpacity="0.25" rx="3" />
          <text x={55} y={-108} fill="#00ff88" fontSize="9" fontFamily="monospace" textAnchor="end" opacity="0.6">ALT m</text>
          {altTicks.map(a => {
            const y = -(a - altitude) * 5;
            if (Math.abs(y) > 95) return null;
            const isMajor = a % 10 === 0;
            return (
              <g key={a}>
                <line x1={-15} y1={y} x2={isMajor ? 5 : -5} y2={y} stroke="#00ff88" strokeWidth={isMajor ? "1" : "0.5"} strokeOpacity={isMajor ? "0.8" : "0.4"} />
                {isMajor && <text x={10} y={y + 3} fill="#00ff88" fontSize="10" textAnchor="start" fontFamily="monospace">{a.toFixed(0)}</text>}
              </g>
            );
          })}
          <rect x={-15} y={-10} width={65} height={20} fill="black" fillOpacity="0.5" stroke="#00ff88" strokeWidth="1.5" rx="2" />
          <text x={18} y={5} fill="#00ff88" fontSize="14" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{altitude.toFixed(1)}</text>
        </g>

        {/* === VERTICAL SPEED INDICATOR (RIGHT OF ALT) === */}
        <g transform="translate(925, 200)" filter="url(#hudGlow)">
          <text x={0} y={0} fill="#00ff88" fontSize="9" fontFamily="monospace" opacity="0.6" textAnchor="start">VS</text>
          <text x={0} y={12} fill={verticalSpeed > 0.3 ? "#00ff88" : verticalSpeed < -0.3 ? "#ff8844" : "#00ff88"} fontSize="11" fontFamily="monospace" textAnchor="start">
            {vsArrow} {Math.abs(verticalSpeed).toFixed(1)}
          </text>
        </g>

        {/* === FLIGHT MODE (TOP LEFT) === */}
        <g transform="translate(30, 25)" filter="url(#hudGlow)">
          <rect x={0} y={-12} width={100} height={20} fill="black" fillOpacity="0.4" rx="3" />
          <text x={50} y={3} fill="#00ff88" fontSize="13" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{flightMode.toUpperCase()}</text>
        </g>

        {/* === RECORDING INDICATOR (TOP LEFT, below mode) === */}
        {isRecording && (
          <g transform="translate(30, 50)" filter="url(#hudGlow)">
            <circle cx={8} cy={0} r={4} fill="#ff4444">
              <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
            </circle>
            <text x={18} y={4} fill="#ff4444" fontSize="10" fontFamily="monospace">REC</text>
          </g>
        )}

        {/* === GPS & BATTERY (TOP RIGHT) === */}
        <g transform="translate(970, 25)" filter="url(#hudGlow)">
          <text x={0} y={0} fill={gpsStatus === "3d_fix" ? "#00ff88" : gpsStatus === "2d_fix" ? "#ffaa00" : "#ff4444"} fontSize="10" textAnchor="end" fontFamily="monospace">
            GPS {gpsStatus === "3d_fix" ? "3D" : gpsStatus === "2d_fix" ? "2D" : "NO"} {gpsSatellites}★
          </text>
          <text x={0} y={16} fill={batteryPercent > 50 ? "#00ff88" : batteryPercent > 20 ? "#ffaa00" : "#ff4444"} fontSize="10" textAnchor="end" fontFamily="monospace">
            BAT {batteryPercent.toFixed(0)}% {batteryVoltage.toFixed(1)}V
          </text>
        </g>

        {/* === COORDINATES (BOTTOM CENTER) === */}
        <g transform="translate(500, 570)" filter="url(#hudGlow)">
          <rect x={-180} y={-14} width={360} height={30} fill="black" fillOpacity="0.3" rx="3" />
          <text x={0} y={0} fill="#00ff88" fontSize="10" textAnchor="middle" fontFamily="monospace">
            {latitude !== 0 ? formatCoord(latitude, true) : "--°--'--\"N"} {longitude !== 0 ? formatCoord(longitude, false) : "--°--'--\"E"}
          </text>
          <text x={0} y={12} fill="#00ff88" fontSize="9" textAnchor="middle" fontFamily="monospace" opacity="0.7">
            HOME: {distHome < 1000 ? `${distHome.toFixed(0)}m` : `${(distHome / 1000).toFixed(2)}km`} | GND: {groundSpeed.toFixed(1)}m/s | HDG: {headingNorm.toFixed(0)}°
          </text>
        </g>

        {/* === GIMBAL INFO (BOTTOM LEFT) === */}
        <g transform="translate(30, 565)" filter="url(#hudGlow)">
          <text x={0} y={0} fill="#00ccff" fontSize="9" fontFamily="monospace">
            GIM P:{gimbalPitch}° Y:{gimbalYaw}°
          </text>
          <text x={0} y={12} fill="#00ccff" fontSize="9" fontFamily="monospace" opacity="0.7">
            CAM: {cameraMode.toUpperCase()}
          </text>
        </g>

        {/* === OBJECT COUNT (BOTTOM RIGHT) === */}
        {detectedObjectCount > 0 && (
          <g transform="translate(970, 565)" filter="url(#hudGlow)">
            <text x={0} y={0} fill="#ffaa00" fontSize="10" textAnchor="end" fontFamily="monospace">
              TGT: {detectedObjectCount}
            </text>
          </g>
        )}

        {/* === CENTER RETICLE (FINE CROSSHAIR) === */}
        <g transform="translate(500, 300)" opacity="0.4">
          <line x1={-8} y1={0} x2={-3} y2={0} stroke="#00ff88" strokeWidth="1" />
          <line x1={3} y1={0} x2={8} y2={0} stroke="#00ff88" strokeWidth="1" />
          <line x1={0} y1={-8} x2={0} y2={-3} stroke="#00ff88" strokeWidth="1" />
          <line x1={0} y1={3} x2={0} y2={8} stroke="#00ff88" strokeWidth="1" />
        </g>

        {/* === ROLL SCALE (TOP OF HORIZON) === */}
        <g transform="translate(500, 200)" filter="url(#hudGlow)">
          {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map(deg => {
            const angle = (deg - 90) * Math.PI / 180;
            const r = 100;
            const x1 = Math.cos(angle) * r;
            const y1 = Math.sin(angle) * r;
            const x2 = Math.cos(angle) * (r + (deg % 30 === 0 ? 12 : 6));
            const y2 = Math.sin(angle) * (r + (deg % 30 === 0 ? 12 : 6));
            return (
              <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#00ff88" strokeWidth={deg === 0 ? "2" : "1"} strokeOpacity="0.5" />
            );
          })}
        </g>

        {/* === ATTITUDE READOUT (CENTER BOTTOM) === */}
        <g transform="translate(500, 420)" filter="url(#hudGlow)">
          <text x={-40} y={0} fill="#00ff88" fontSize="9" fontFamily="monospace" textAnchor="end" opacity="0.6">P {pitch.toFixed(1)}°</text>
          <text x={40} y={0} fill="#00ff88" fontSize="9" fontFamily="monospace" textAnchor="start" opacity="0.6">R {roll.toFixed(1)}°</text>
        </g>
      </svg>

      <div className="absolute top-1 left-1/2 -translate-x-1/2" data-testid="ar-hud-label">
        <span className="text-[8px] font-mono text-emerald-400/50 uppercase tracking-widest">AR HUD</span>
      </div>
    </div>
  );
}
