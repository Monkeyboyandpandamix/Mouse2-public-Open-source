import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Navigation,
  Satellite,
  Eye,
  Brain,
  MapPin,
  Home,
  Target,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  Activity,
  ChevronDown,
  ChevronUp,
  Compass,
  Route,
  Image,
  RotateCcw,
  Play,
} from "lucide-react";

interface MLNavStatus {
  enabled: boolean;
  armed: boolean;
  gpsLost: boolean;
  gpsLostDuration: number;
  commsLost: boolean;
  commsLostDuration: number;
  autoRtlTriggered: boolean;
  estimatedPosition: { lat: number; lng: number; alt: number };
  heading: number;
  positionConfidence: number;
  navigationMethod: string;
  home: { lat: number; lng: number; distance: number } | null;
  destination: { lat: number; lng: number; alt: number; distance: number; bearing: number } | null;
  mlModel: { trained: boolean; epochs: number; trainingDataSize: number };
  sceneMemory: { sceneCount: number; maxScenes: number };
  breadcrumbCount: number;
  fusionMethod: string;
}

interface NavConfig {
  enabled: boolean;
  sceneMatchingEnabled: boolean;
  landmarkLearningEnabled: boolean;
  commsLostAutoRtl: boolean;
  commsLostTimeoutSec: number;
  gpsLostTimeoutSec: number;
  minSatellites: number;
  positionFusionMethod: string;
  maxSceneMemory: number;
  destinationNav: boolean;
  routeReplanInterval: number;
}

const DEFAULT_CONFIG: NavConfig = {
  enabled: true,
  sceneMatchingEnabled: true,
  landmarkLearningEnabled: true,
  commsLostAutoRtl: true,
  commsLostTimeoutSec: 30,
  gpsLostTimeoutSec: 10,
  minSatellites: 6,
  positionFusionMethod: "ml_weighted",
  maxSceneMemory: 200,
  destinationNav: true,
  routeReplanInterval: 5000,
};

function StatusDot({ active }: { active: boolean }) {
  return (
    <div className={`w-2 h-2 rounded-full ${active ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" : "bg-muted-foreground/40"}`} />
  );
}

function MetricRow({ label, value, icon: Icon, warn }: { label: string; value: string | number; icon?: any; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        <span>{label}</span>
      </div>
      <span className={`text-xs font-mono ${warn ? "text-amber-500" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

export function GpsDeniedNavPanel() {
  const [status, setStatus] = useState<MLNavStatus | null>(null);
  const [config, setConfig] = useState<NavConfig>(DEFAULT_CONFIG);
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [destAlt, setDestAlt] = useState("30");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    position: true, nav: true, ml: true, scene: false,
  });
  const configTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("mouse_ml_nav_config");
    if (saved) {
      try { setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) }); } catch { /* defaults */ }
    }
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent<MLNavStatus>) => {
      if (e.detail) setStatus(e.detail);
    };
    window.addEventListener("ml-navigation-status" as any, handler);
    return () => window.removeEventListener("ml-navigation-status" as any, handler);
  }, []);

  const updateConfig = (updates: Partial<NavConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    if (configTimerRef.current) clearTimeout(configTimerRef.current);
    configTimerRef.current = setTimeout(() => {
      localStorage.setItem("mouse_ml_nav_config", JSON.stringify(newConfig));
      window.dispatchEvent(new CustomEvent("ml-nav-config-changed"));
    }, 300);
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSetDestination = () => {
    const lat = parseFloat(destLat);
    const lng = parseFloat(destLng);
    const alt = parseFloat(destAlt) || 30;
    if (isNaN(lat) || isNaN(lng)) return;
    window.dispatchEvent(new CustomEvent("flight-command", {
      detail: { command: "set_nav_destination", destination: { lat, lng, alt } },
    }));
  };

  const handleClearDestination = () => {
    window.dispatchEvent(new CustomEvent("flight-command", {
      detail: { command: "clear_nav_destination" },
    }));
  };

  const handleBacktrace = () => {
    window.dispatchEvent(new CustomEvent("flight-command", {
      detail: { command: "backtrace" },
    }));
  };

  const methodLabels: Record<string, string> = {
    gps: "GPS",
    dead_reckoning: "Dead Reckoning",
    visual_odometry: "Visual Odometry",
    hybrid: "Hybrid",
    ml_weighted: "ML Weighted",
    ml_scene_fused: "ML Scene Fused",
    none: "None",
  };

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden" data-testid="gps-denied-nav-panel">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">GPS-Denied ML Navigation</h2>
        </div>
        <div className="flex items-center gap-2">
          {status?.gpsLost && (
            <Badge variant="destructive" className="text-[10px] animate-pulse" data-testid="badge-gps-lost">
              <Satellite className="h-3 w-3 mr-1" /> GPS LOST {status.gpsLostDuration}s
            </Badge>
          )}
          {status?.commsLost && (
            <Badge variant="destructive" className="text-[10px]" data-testid="badge-comms-lost">
              <WifiOff className="h-3 w-3 mr-1" /> COMMS LOST
            </Badge>
          )}
          {!status?.gpsLost && !status?.commsLost && (
            <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-500" data-testid="badge-nominal">
              NOMINAL
            </Badge>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="w-full grid grid-cols-3 h-8">
              <TabsTrigger value="status" className="text-xs" data-testid="tab-nav-status">Status</TabsTrigger>
              <TabsTrigger value="navigate" className="text-xs" data-testid="tab-navigate">Navigate</TabsTrigger>
              <TabsTrigger value="config" className="text-xs" data-testid="tab-nav-config">Config</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="space-y-3 mt-3">
              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("position")}>
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      Position Estimate
                    </div>
                    {expandedSections.position ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </CardTitle>
                </CardHeader>
                {expandedSections.position && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow icon={MapPin} label="Latitude" value={status?.estimatedPosition?.lat?.toFixed(7) ?? "---"} />
                    <MetricRow icon={MapPin} label="Longitude" value={status?.estimatedPosition?.lng?.toFixed(7) ?? "---"} />
                    <MetricRow label="Altitude" value={`${status?.estimatedPosition?.alt?.toFixed(1) ?? "---"} m`} />
                    <MetricRow icon={Compass} label="Heading" value={`${status?.heading ?? "---"}°`} />
                    <MetricRow label="Confidence" value={`${Math.round((status?.positionConfidence ?? 0) * 100)}%`} warn={(status?.positionConfidence ?? 1) < 0.4} />
                    <MetricRow icon={Navigation} label="Method" value={methodLabels[status?.navigationMethod ?? "none"] ?? status?.navigationMethod ?? "---"} />
                    <MetricRow icon={Route} label="Breadcrumbs" value={status?.breadcrumbCount ?? 0} />
                  </CardContent>
                )}
              </Card>

              {status?.home && (
                <Card>
                  <CardContent className="p-3 space-y-1">
                    <div className="text-xs font-medium mb-1 flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5 text-emerald-500" />
                      Home Position
                    </div>
                    <MetricRow label="Lat" value={status.home.lat.toFixed(7)} />
                    <MetricRow label="Lng" value={status.home.lng.toFixed(7)} />
                    <MetricRow label="Distance" value={`${status.home.distance.toFixed(0)} m`} warn={status.home.distance > 500} />
                  </CardContent>
                </Card>
              )}

              {status?.destination && (
                <Card>
                  <CardContent className="p-3 space-y-1">
                    <div className="text-xs font-medium mb-1 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-amber-500" />
                      Active Destination
                    </div>
                    <MetricRow label="Distance" value={`${status.destination.distance.toFixed(0)} m`} />
                    <MetricRow label="Bearing" value={`${status.destination.bearing.toFixed(0)}°`} />
                    <MetricRow label="Target Alt" value={`${status.destination.alt.toFixed(0)} m`} />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => toggleSection("ml")}>
                  <CardTitle className="text-xs flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Brain className="h-3.5 w-3.5 text-violet-500" />
                      ML Position Model
                    </div>
                    <div className="flex items-center gap-2">
                      {status?.mlModel?.trained ? (
                        <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-500">TRAINED</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-500">LEARNING</Badge>
                      )}
                      {expandedSections.ml ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                  </CardTitle>
                </CardHeader>
                {expandedSections.ml && (
                  <CardContent className="p-3 pt-2 space-y-1">
                    <MetricRow label="Epochs" value={status?.mlModel?.epochs ?? 0} />
                    <MetricRow label="Training Samples" value={status?.mlModel?.trainingDataSize ?? 0} />
                    <MetricRow icon={Image} label="Scene Memory" value={`${status?.sceneMemory?.sceneCount ?? 0} / ${status?.sceneMemory?.maxScenes ?? 0}`} />
                  </CardContent>
                )}
              </Card>

              {status?.autoRtlTriggered && (
                <Card className="border-amber-500">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-semibold">Auto-RTL Active</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Communication link lost. Drone is autonomously returning to home using ML navigation.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-3">
                  <div className="text-xs font-medium mb-2">System Capabilities</div>
                  <div className="space-y-1.5 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      ML position estimation with online learning
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Visual odometry + dead reckoning + ML fusion
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Scene matching for landmark-based localization
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Autonomous RTL on comms loss
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Destination navigation without GPS
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Breadcrumb backtrace return path
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="navigate" className="space-y-3 mt-3">
              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Set Destination
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Latitude</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={destLat}
                        onChange={(e) => setDestLat(e.target.value)}
                        placeholder="36.0957"
                        className="h-7 text-xs"
                        data-testid="input-dest-lat"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">Longitude</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={destLng}
                        onChange={(e) => setDestLng(e.target.value)}
                        placeholder="-79.4378"
                        className="h-7 text-xs"
                        data-testid="input-dest-lng"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px]">Altitude (m)</Label>
                    <Input
                      type="number"
                      value={destAlt}
                      onChange={(e) => setDestAlt(e.target.value)}
                      className="h-7 text-xs"
                      data-testid="input-dest-alt"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSetDestination} className="text-xs flex-1" data-testid="button-set-dest">
                      <Play className="h-3 w-3 mr-1" /> Navigate
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleClearDestination} className="text-xs" data-testid="button-clear-dest">
                      Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Emergency Return
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <p className="text-[10px] text-muted-foreground">
                    Backtrace follows the recorded flight path in reverse to return to the last known good GPS position.
                  </p>
                  <Button size="sm" variant="secondary" onClick={handleBacktrace} className="w-full text-xs" data-testid="button-backtrace">
                    <RotateCcw className="h-3 w-3 mr-1" /> Start Backtrace
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="config" className="space-y-3 mt-3">
              <Card>
                <CardContent className="p-3 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">ML Navigation Enabled</Label>
                    <Switch checked={config.enabled} onCheckedChange={(v) => updateConfig({ enabled: v })} data-testid="toggle-ml-nav" />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Scene Matching</Label>
                    <Switch checked={config.sceneMatchingEnabled} onCheckedChange={(v) => updateConfig({ sceneMatchingEnabled: v })} data-testid="toggle-scene-match" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Landmark Learning</Label>
                    <Switch checked={config.landmarkLearningEnabled} onCheckedChange={(v) => updateConfig({ landmarkLearningEnabled: v })} data-testid="toggle-landmark" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Auto-RTL on Comms Loss</Label>
                    <Switch checked={config.commsLostAutoRtl} onCheckedChange={(v) => updateConfig({ commsLostAutoRtl: v })} data-testid="toggle-auto-rtl" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Destination Navigation</Label>
                    <Switch checked={config.destinationNav} onCheckedChange={(v) => updateConfig({ destinationNav: v })} data-testid="toggle-dest-nav" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs">Timeouts & Thresholds</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">GPS Lost Timeout: {config.gpsLostTimeoutSec}s</Label>
                    <Slider value={[config.gpsLostTimeoutSec]} onValueChange={([v]) => updateConfig({ gpsLostTimeoutSec: v })} min={3} max={30} step={1} data-testid="slider-gps-timeout" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Comms Lost Timeout: {config.commsLostTimeoutSec}s</Label>
                    <Slider value={[config.commsLostTimeoutSec]} onValueChange={([v]) => updateConfig({ commsLostTimeoutSec: v })} min={5} max={120} step={5} data-testid="slider-comms-timeout" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Min GPS Satellites: {config.minSatellites}</Label>
                    <Slider value={[config.minSatellites]} onValueChange={([v]) => updateConfig({ minSatellites: v })} min={3} max={12} step={1} data-testid="slider-min-sats" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Max Scene Memory: {config.maxSceneMemory}</Label>
                    <Slider value={[config.maxSceneMemory]} onValueChange={([v]) => updateConfig({ maxSceneMemory: v })} min={50} max={500} step={25} data-testid="slider-max-scenes" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs">Position Fusion Method</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <Select value={config.positionFusionMethod} onValueChange={(v) => updateConfig({ positionFusionMethod: v })}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-fusion-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml_weighted">ML Weighted (recommended)</SelectItem>
                      <SelectItem value="hybrid">Hybrid (50/50)</SelectItem>
                      <SelectItem value="dead_reckoning">Dead Reckoning Only</SelectItem>
                      <SelectItem value="visual_only">Visual Odometry Only</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
