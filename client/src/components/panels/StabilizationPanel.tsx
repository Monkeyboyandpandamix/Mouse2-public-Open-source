import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain,
  Wind,
  Weight,
  Camera,
  CloudRain,
  Activity,
  Shield,
  Gauge,
  Crosshair,
  Plane,
  TrendingUp,
  Cpu,
  BarChart3,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Hexagon,
  ShieldCheck,
} from "lucide-react";

interface MLStabilizationStatus {
  enabled: boolean;
  armed: boolean;
  flightPhase: string;
  takeoffPhase: string;
  kalmanState: {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    attitude: { roll: number; pitch: number; yaw: number };
    positionUncertainty: number;
    velocityUncertainty: number;
    attitudeUncertainty: number;
  };
  mlEnabled: boolean;
  mlConfidence: number;
  mlTrained: boolean;
  mlEpochs: number;
  mlLoss: number;
  mlTrainingDataSize: number;
  mlPrediction: number[];
  groundDistance: number;
  groundDistConfidence: number;
  groundDistMethod: string;
  windEstimate: { x: number; y: number; z: number; gustLevel: number };
  weatherAdaptation: { thrustMultiplier: number; dragIncrease: number; stabilityFactor: number };
  payloadCompensation: { thrustComp: number; rollComp: number; pitchComp: number; shiftEstimate: number; releaseDetected: boolean };
  corrections: { roll: number; pitch: number; yaw: number; throttle: number; forward: number; lateral: number };
  adaptiveGains: { kp: number; ki: number; kd: number };
  frameType?: string;
  frameProfile?: { label: string; motorCount: number; redundancyLevel: number; rollGainScale: number; pitchGainScale: number; yawGainScale: number; thrustGainScale: number };
}

interface StabilizationConfig {
  enabled: boolean;
  mlAssistEnabled: boolean;
  cameraGroundEstEnabled: boolean;
  windCompensationEnabled: boolean;
  payloadCompensationEnabled: boolean;
  weatherAdaptationEnabled: boolean;
  takeoffAssistEnabled: boolean;
  adaptiveGainsEnabled: boolean;
  maxRollCorrection: number;
  maxPitchCorrection: number;
  maxYawRate: number;
  maxThrottleCorrection: number;
  targetHoverAltitude: number;
  payloadMass: number;
  vehicleMass: number;
  frameType: string;
}

const DEFAULT_CONFIG: StabilizationConfig = {
  enabled: true,
  mlAssistEnabled: true,
  cameraGroundEstEnabled: true,
  windCompensationEnabled: true,
  payloadCompensationEnabled: true,
  weatherAdaptationEnabled: true,
  takeoffAssistEnabled: true,
  adaptiveGainsEnabled: true,
  maxRollCorrection: 20,
  maxPitchCorrection: 20,
  maxYawRate: 180,
  maxThrottleCorrection: 8,
  targetHoverAltitude: 20,
  payloadMass: 0,
  vehicleMass: 2.5,
  frameType: "quad_x",
};

const FRAME_OPTIONS = [
  { value: "quad_x", label: "Quadcopter X", motors: 4 },
  { value: "quad_plus", label: "Quadcopter +", motors: 4 },
  { value: "quad_h", label: "Quadcopter H", motors: 4 },
  { value: "hex_x", label: "Hexacopter X", motors: 6 },
  { value: "hex_plus", label: "Hexacopter +", motors: 6 },
  { value: "octo_x", label: "Octocopter X", motors: 8 },
  { value: "octo_plus", label: "Octocopter +", motors: 8 },
  { value: "octo_v", label: "Octocopter V", motors: 8 },
  { value: "y6", label: "Y6 (Coaxial Tri)", motors: 6 },
  { value: "y4", label: "Y4 Copter", motors: 4 },
  { value: "tri", label: "Tricopter", motors: 3 },
  { value: "coax_quad", label: "Coaxial Quad", motors: 8 },
];

function StatusDot({ status }: { status: "active" | "standby" | "warning" | "error" }) {
  const colors = {
    active: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]",
    standby: "bg-muted-foreground/50",
    warning: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]",
    error: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
}

function MetricRow({ label, value, unit, icon: Icon, warn }: { label: string; value: string | number; unit?: string; icon?: any; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        <span>{label}</span>
      </div>
      <span className={`text-xs font-mono ${warn ? "text-amber-500" : "text-foreground"}`}>
        {value}{unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}

function BarMeter({ value, max, label, color }: { value: number; max: number; label?: string; color?: string }) {
  const pct = Math.min(Math.abs(value) / max * 100, 100);
  return (
    <div className="space-y-0.5">
      {label && <div className="text-[10px] text-muted-foreground">{label}</div>}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color || "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CorrectionVisualizer({ corrections }: { corrections: { roll: number; pitch: number; yaw: number; throttle: number; forward: number; lateral: number } }) {
  const size = 80;
  const cx = size / 2;
  const cy = size / 2;
  const scale = 2;
  const rollPx = clamp(corrections.roll * scale, -cx + 5, cx - 5);
  const pitchPx = clamp(-corrections.pitch * scale, -cy + 5, cy - 5);

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="text-muted-foreground/30">
          <circle cx={cx} cy={cy} r={cx - 2} fill="none" stroke="currentColor" strokeWidth="1" />
          <line x1={cx} y1={2} x2={cx} y2={size - 2} stroke="currentColor" strokeWidth="0.5" />
          <line x1={2} y1={cy} x2={size - 2} y2={cy} stroke="currentColor" strokeWidth="0.5" />
          <circle
            cx={cx + rollPx}
            cy={cy + pitchPx}
            r={4}
            fill="hsl(var(--primary))"
            className="drop-shadow-[0_0_4px_hsl(var(--primary))]"
          />
        </svg>
        <div className="absolute -bottom-3 left-0 right-0 text-center text-[9px] text-muted-foreground">
          Roll/Pitch
        </div>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <BarMeter value={corrections.throttle} max={8} label="Throttle" color={corrections.throttle > 0 ? "bg-emerald-500" : "bg-amber-500"} />
        <BarMeter value={corrections.yaw} max={18} label="Yaw" color="bg-blue-500" />
        <BarMeter value={corrections.forward} max={3} label="Forward" color="bg-cyan-500" />
        <BarMeter value={corrections.lateral} max={3} label="Lateral" color="bg-violet-500" />
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function StabilizationPanel() {
  const [status, setStatus] = useState<MLStabilizationStatus | null>(null);
  const [config, setConfig] = useState<StabilizationConfig>(DEFAULT_CONFIG);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ml: true, kalman: false, wind: true, weather: false, payload: true, camera: true, gains: false,
  });
  const configTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("mouse_ml_stabilization_config");
    if (saved) {
      try { setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) }); } catch { /* defaults */ }
    }
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent<MLStabilizationStatus>) => {
      if (e.detail) setStatus(e.detail);
    };
    window.addEventListener("ml-stabilization-status" as any, handler);
    return () => window.removeEventListener("ml-stabilization-status" as any, handler);
  }, []);

  const updateConfig = (updates: Partial<StabilizationConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    if (configTimerRef.current) clearTimeout(configTimerRef.current);
    configTimerRef.current = setTimeout(() => {
      localStorage.setItem("mouse_ml_stabilization_config", JSON.stringify(newConfig));
      window.dispatchEvent(new CustomEvent("ml-stabilization-config-changed"));
    }, 300);
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const windSpeed = status?.windEstimate
    ? Math.sqrt(status.windEstimate.x ** 2 + status.windEstimate.y ** 2 + status.windEstimate.z ** 2)
    : 0;
  const windDir = status?.windEstimate
    ? Math.round((Math.atan2(status.windEstimate.y, status.windEstimate.x) * 180 / Math.PI + 360) % 360)
    : 0;

  const overallHealth = !status ? "standby" :
    !status.armed ? "standby" :
    (status.windEstimate?.gustLevel ?? 0) > 0.7 ? "warning" :
    (status.payloadCompensation?.shiftEstimate ?? 0) > 1.0 ? "warning" :
    "active";

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden" data-testid="stabilization-panel">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">ML Flight Stabilization</h2>
          <StatusDot status={overallHealth} />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status?.armed ? "default" : "secondary"} className="text-[10px]" data-testid="status-armed">
            {status?.armed ? "ARMED" : "DISARMED"}
          </Badge>
          <Badge variant="outline" className="text-[10px]" data-testid="status-phase">
            {status?.flightPhase?.toUpperCase() ?? "IDLE"}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          <Tabs defaultValue="monitor" className="w-full">
            <TabsList className="w-full grid grid-cols-3 h-8">
              <TabsTrigger value="monitor" className="text-xs" data-testid="tab-monitor">Monitor</TabsTrigger>
              <TabsTrigger value="config" className="text-xs" data-testid="tab-config">Configure</TabsTrigger>
              <TabsTrigger value="dynamics" className="text-xs" data-testid="tab-dynamics">Dynamics</TabsTrigger>
            </TabsList>

            <TabsContent value="monitor" className="space-y-3 mt-3">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Crosshair className="h-3.5 w-3.5 text-primary" />
                    Control Corrections
                  </div>
                  {status?.corrections ? (
                    <CorrectionVisualizer corrections={status.corrections} />
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-4">Awaiting data...</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("ml")} data-testid="section-ml-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5 text-violet-500" />
                      ML Disturbance Predictor
                    </div>
                    <div className="flex items-center gap-2">
                      {status?.mlTrained ? (
                        <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-500">TRAINED</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-500">TRAINING</Badge>
                      )}
                      {expandedSections.ml ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </CardTitle>
                </CardHeader>
                {expandedSections.ml && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow icon={Cpu} label="Confidence" value={`${Math.round((status?.mlConfidence ?? 0) * 100)}%`} />
                    <MetricRow icon={TrendingUp} label="Training Epochs" value={status?.mlEpochs ?? 0} />
                    <MetricRow icon={BarChart3} label="Loss" value={status?.mlLoss != null && status.mlLoss > 0 ? status.mlLoss.toFixed(4) : "---"} />
                    <MetricRow icon={Activity} label="Training Samples" value={status?.mlTrainingDataSize ?? 0} />
                    {status?.mlPrediction && status.mlPrediction.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] text-muted-foreground mb-1">Predicted Disturbance Vector</div>
                        <div className="grid grid-cols-3 gap-1">
                          {["Roll", "Pitch", "Alt"].map((axis, i) => (
                            <div key={axis} className="text-center bg-muted/50 rounded px-1 py-0.5">
                              <div className="text-[9px] text-muted-foreground">{axis}</div>
                              <div className="text-[10px] font-mono">{(status.mlPrediction[i] ?? 0).toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("wind")} data-testid="section-wind-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Wind className="h-3.5 w-3.5 text-cyan-500" />
                      Wind Estimation
                    </div>
                    <div className="flex items-center gap-2">
                      {(status?.windEstimate?.gustLevel ?? 0) > 0.5 && (
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                      )}
                      {expandedSections.wind ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </CardTitle>
                </CardHeader>
                {expandedSections.wind && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow icon={Wind} label="Speed" value={windSpeed.toFixed(1)} unit="m/s" warn={windSpeed > 8} />
                    <MetricRow icon={Plane} label="Direction" value={`${windDir}°`} />
                    <MetricRow icon={Activity} label="Gust Level" value={`${Math.round((status?.windEstimate?.gustLevel ?? 0) * 100)}%`} warn={(status?.windEstimate?.gustLevel ?? 0) > 0.5} />
                    <div className="grid grid-cols-3 gap-1 mt-2">
                      {["X", "Y", "Z"].map((axis, i) => {
                        const vals = [status?.windEstimate?.x, status?.windEstimate?.y, status?.windEstimate?.z];
                        return (
                          <div key={axis} className="text-center bg-muted/50 rounded px-1 py-0.5">
                            <div className="text-[9px] text-muted-foreground">{axis}</div>
                            <div className="text-[10px] font-mono">{(vals[i] ?? 0).toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("payload")} data-testid="section-payload-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Weight className="h-3.5 w-3.5 text-orange-500" />
                      Payload Compensation
                    </div>
                    <div className="flex items-center gap-2">
                      {status?.payloadCompensation?.releaseDetected && (
                        <Badge variant="destructive" className="text-[9px]">RELEASE</Badge>
                      )}
                      {expandedSections.payload ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </CardTitle>
                </CardHeader>
                {expandedSections.payload && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow icon={Weight} label="Shift Estimate" value={(status?.payloadCompensation?.shiftEstimate ?? 0).toFixed(2)} warn={(status?.payloadCompensation?.shiftEstimate ?? 0) > 0.8} />
                    <MetricRow icon={Gauge} label="Thrust Comp" value={`${Math.round((status?.payloadCompensation?.thrustComp ?? 0) * 100)}%`} />
                    <MetricRow label="Roll Comp" value={`${(status?.payloadCompensation?.rollComp ?? 0).toFixed(1)}°`} />
                    <MetricRow label="Pitch Comp" value={`${(status?.payloadCompensation?.pitchComp ?? 0).toFixed(1)}°`} />
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("camera")} data-testid="section-camera-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5 text-blue-500" />
                      Camera Ground Distance
                    </div>
                    {expandedSections.camera ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </CardTitle>
                </CardHeader>
                {expandedSections.camera && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow icon={Camera} label="Distance" value={status?.groundDistance != null && status.groundDistance > 0 ? `${status.groundDistance.toFixed(1)} m` : "---"} />
                    <MetricRow label="Confidence" value={`${Math.round((status?.groundDistConfidence ?? 0) * 100)}%`} />
                    <MetricRow label="Method" value={status?.groundDistMethod ?? "---"} />
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("weather")} data-testid="section-weather-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CloudRain className="h-3.5 w-3.5 text-sky-500" />
                      Weather Adaptation
                    </div>
                    {expandedSections.weather ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </CardTitle>
                </CardHeader>
                {expandedSections.weather && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow label="Thrust Multiplier" value={`${(status?.weatherAdaptation?.thrustMultiplier ?? 1).toFixed(3)}x`} />
                    <MetricRow label="Drag Increase" value={`${Math.round((status?.weatherAdaptation?.dragIncrease ?? 0) * 100)}%`} />
                    <MetricRow label="Stability Factor" value={(status?.weatherAdaptation?.stabilityFactor ?? 1).toFixed(3)} />
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="config" className="space-y-3 mt-3">
              <Card>
                <CardContent className="p-3 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" /> Stabilization Enabled
                    </Label>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(v) => updateConfig({ enabled: v })}
                      data-testid="toggle-enabled"
                    />
                  </div>
                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5" /> ML Assist
                    </Label>
                    <Switch
                      checked={config.mlAssistEnabled}
                      onCheckedChange={(v) => updateConfig({ mlAssistEnabled: v })}
                      data-testid="toggle-ml-assist"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5" /> Camera Ground Est.
                    </Label>
                    <Switch
                      checked={config.cameraGroundEstEnabled}
                      onCheckedChange={(v) => updateConfig({ cameraGroundEstEnabled: v })}
                      data-testid="toggle-camera-ground"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Wind className="h-3.5 w-3.5" /> Wind Compensation
                    </Label>
                    <Switch
                      checked={config.windCompensationEnabled}
                      onCheckedChange={(v) => updateConfig({ windCompensationEnabled: v })}
                      data-testid="toggle-wind-comp"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Weight className="h-3.5 w-3.5" /> Payload Compensation
                    </Label>
                    <Switch
                      checked={config.payloadCompensationEnabled}
                      onCheckedChange={(v) => updateConfig({ payloadCompensationEnabled: v })}
                      data-testid="toggle-payload-comp"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <CloudRain className="h-3.5 w-3.5" /> Weather Adaptation
                    </Label>
                    <Switch
                      checked={config.weatherAdaptationEnabled}
                      onCheckedChange={(v) => updateConfig({ weatherAdaptationEnabled: v })}
                      data-testid="toggle-weather-adapt"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Plane className="h-3.5 w-3.5" /> Takeoff Assist
                    </Label>
                    <Switch
                      checked={config.takeoffAssistEnabled}
                      onCheckedChange={(v) => updateConfig({ takeoffAssistEnabled: v })}
                      data-testid="toggle-takeoff-assist"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5" /> Adaptive Gains
                    </Label>
                    <Switch
                      checked={config.adaptiveGainsEnabled}
                      onCheckedChange={(v) => updateConfig({ adaptiveGainsEnabled: v })}
                      data-testid="toggle-adaptive-gains"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs">Control Limits</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Max Roll Correction: {config.maxRollCorrection}°</Label>
                    <Slider
                      value={[config.maxRollCorrection]}
                      onValueChange={([v]) => updateConfig({ maxRollCorrection: v })}
                      min={5} max={35} step={1}
                      data-testid="slider-max-roll"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Max Pitch Correction: {config.maxPitchCorrection}°</Label>
                    <Slider
                      value={[config.maxPitchCorrection]}
                      onValueChange={([v]) => updateConfig({ maxPitchCorrection: v })}
                      min={5} max={35} step={1}
                      data-testid="slider-max-pitch"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Max Throttle Correction: {config.maxThrottleCorrection}</Label>
                    <Slider
                      value={[config.maxThrottleCorrection]}
                      onValueChange={([v]) => updateConfig({ maxThrottleCorrection: v })}
                      min={2} max={15} step={0.5}
                      data-testid="slider-max-throttle"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Target Hover Alt: {config.targetHoverAltitude}m</Label>
                    <Slider
                      value={[config.targetHoverAltitude]}
                      onValueChange={([v]) => updateConfig({ targetHoverAltitude: v })}
                      min={2} max={120} step={1}
                      data-testid="slider-hover-alt"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <Hexagon className="h-3.5 w-3.5 text-violet-500" />
                    Frame Architecture
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">Frame Type</Label>
                    <Select
                      value={config.frameType}
                      onValueChange={(v) => updateConfig({ frameType: v })}
                      data-testid="select-frame-type"
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid="select-frame-trigger">
                        <SelectValue placeholder="Select frame type" />
                      </SelectTrigger>
                      <SelectContent>
                        {FRAME_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} data-testid={`select-frame-${opt.value}`}>
                            <span className="flex items-center gap-2">
                              {opt.label}
                              <span className="text-muted-foreground text-[10px]">({opt.motors}M)</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {status?.frameProfile && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-[9px] text-muted-foreground">Motors</div>
                        <div className="text-xs font-mono font-semibold" data-testid="text-motor-count">{status.frameProfile.motorCount}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-[9px] text-muted-foreground">Redundancy</div>
                        <div className="text-xs font-mono font-semibold flex items-center gap-1" data-testid="text-redundancy">
                          {status.frameProfile.redundancyLevel > 0 && <ShieldCheck className="h-3 w-3 text-emerald-500" />}
                          {status.frameProfile.redundancyLevel === 0 ? "None" : status.frameProfile.redundancyLevel === 1 ? "Single" : "Dual"}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-[9px] text-muted-foreground">Roll/Pitch Scale</div>
                        <div className="text-xs font-mono">{status.frameProfile.rollGainScale.toFixed(2)} / {status.frameProfile.pitchGainScale.toFixed(2)}</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1">
                        <div className="text-[9px] text-muted-foreground">Yaw/Thrust Scale</div>
                        <div className="text-xs font-mono">{status.frameProfile.yawGainScale.toFixed(2)} / {status.frameProfile.thrustGainScale.toFixed(2)}</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs">Vehicle & Payload</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Vehicle Mass: {config.vehicleMass} kg</Label>
                    <Slider
                      value={[config.vehicleMass]}
                      onValueChange={([v]) => updateConfig({ vehicleMass: v })}
                      min={0.5} max={25} step={0.1}
                      data-testid="slider-vehicle-mass"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Payload Mass: {config.payloadMass} kg</Label>
                    <Slider
                      value={[config.payloadMass]}
                      onValueChange={([v]) => updateConfig({ payloadMass: v })}
                      min={0} max={15} step={0.1}
                      data-testid="slider-payload-mass"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dynamics" className="space-y-3 mt-3">
              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("kalman")} data-testid="section-kalman-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
                      Extended Kalman Filter State
                    </div>
                    {expandedSections.kalman ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </CardTitle>
                </CardHeader>
                {expandedSections.kalman && status?.kalmanState && (
                  <CardContent className="p-3 pt-2 space-y-2">
                    <div className="text-[10px] text-muted-foreground font-medium">Position Estimate</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["x", "y", "z"] as const).map((axis) => (
                        <div key={axis} className="text-center bg-muted/50 rounded px-1 py-0.5">
                          <div className="text-[9px] text-muted-foreground">{axis.toUpperCase()}</div>
                          <div className="text-[10px] font-mono">{(status.kalmanState.position[axis] ?? 0).toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">Velocity Estimate</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["x", "y", "z"] as const).map((axis) => (
                        <div key={axis} className="text-center bg-muted/50 rounded px-1 py-0.5">
                          <div className="text-[9px] text-muted-foreground">{axis.toUpperCase()}</div>
                          <div className="text-[10px] font-mono">{(status.kalmanState.velocity[axis] ?? 0).toFixed(3)} m/s</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">Attitude Estimate</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["roll", "pitch", "yaw"] as const).map((axis) => (
                        <div key={axis} className="text-center bg-muted/50 rounded px-1 py-0.5">
                          <div className="text-[9px] text-muted-foreground">{axis}</div>
                          <div className="text-[10px] font-mono">{((status.kalmanState.attitude[axis] ?? 0) * 180 / Math.PI).toFixed(1)}°</div>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-1" />
                    <MetricRow label="Pos. Uncertainty" value={status.kalmanState.positionUncertainty.toFixed(3)} warn={status.kalmanState.positionUncertainty > 5} />
                    <MetricRow label="Vel. Uncertainty" value={status.kalmanState.velocityUncertainty.toFixed(3)} warn={status.kalmanState.velocityUncertainty > 2} />
                    <MetricRow label="Att. Uncertainty" value={status.kalmanState.attitudeUncertainty.toFixed(3)} warn={status.kalmanState.attitudeUncertainty > 0.5} />
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("gains")} data-testid="section-gains-header">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-amber-500" />
                      Adaptive PID Gains
                    </div>
                    {expandedSections.gains ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </CardTitle>
                </CardHeader>
                {expandedSections.gains && status?.adaptiveGains && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow label="Kp (Proportional)" value={status.adaptiveGains.kp.toFixed(3)} />
                    <MetricRow label="Ki (Integral)" value={status.adaptiveGains.ki.toFixed(3)} />
                    <MetricRow label="Kd (Derivative)" value={status.adaptiveGains.kd.toFixed(3)} />
                    <div className="mt-2">
                      <div className="text-[10px] text-muted-foreground mb-1">Gain Adaptation</div>
                      <BarMeter
                        value={status.adaptiveGains.kp}
                        max={0.5}
                        label="Kp Active"
                        color="bg-emerald-500"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardContent className="p-3">
                  <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    System Architecture
                  </div>
                  <div className="space-y-1.5 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Extended Kalman Filter (15-state) — IMU, GPS, Baro fusion
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      3-Layer Neural Network (24→48→24→9) — Disturbance prediction
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Online backpropagation training with experience replay
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Quadrotor dynamics model — thrust, drag, torque, rain
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Adaptive PID with wind gust & payload shift scaling
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Camera-based ground distance estimation (feature scale + flow)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Takeoff assist with sensor-fused altitude management
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Weather-adaptive thrust & stability compensation
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
