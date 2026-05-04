import { useState, useEffect, lazy, Suspense, type ComponentType } from "react";
import { toast as sonnerToast } from "sonner";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { AutoStabilizationController } from "@/components/controls/AutoStabilizationController";
import { MLStabilizationEngine } from "@/components/controls/MLStabilizationEngine";
import { SensorAnomalyMonitor } from "@/components/controls/SensorAnomalyMonitor";
import { StabilizationActuatorBridge } from "@/components/controls/StabilizationActuatorBridge";
import { EmergencyProtocolController } from "@/components/controls/EmergencyProtocolController";
import { GpsDeniedNavigationController } from "@/components/navigation/GpsDeniedNavigationController";
import { MLNavigationEngine } from "@/components/navigation/MLNavigationEngine";
import { DeviceContextBanner } from "@/components/layout/DeviceContextBanner";
import { useDeviceContext } from "@/hooks/useDeviceContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, X, Eye, ArrowLeft, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Drone } from "@shared/schema";
import { useAppState } from "@/contexts/AppStateContext";

function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (typeof window !== "undefined") {
        const marker = `mouse_lazy_retry_${key}`;
        const tried = sessionStorage.getItem(marker) === "1";
        if (!tried) {
          sessionStorage.setItem(marker, "1");
          window.location.reload();
          await new Promise<never>(() => {});
        }
        sessionStorage.removeItem(marker);
      }
      throw error;
    }
  });
}

// Lazy-loaded heavy components for code splitting
const MapInterface = lazyWithRetry(() => import("@/components/map/MapInterface").then(m => ({ default: m.MapInterface })), "map");
const VideoFeed = lazyWithRetry(() => import("@/components/video/VideoFeed").then(m => ({ default: m.VideoFeed })), "video");
const ControlDeck = lazyWithRetry(() => import("@/components/controls/ControlDeck").then(m => ({ default: m.ControlDeck })), "controls");
const TelemetryPanel = lazyWithRetry(() => import("@/components/telemetry/TelemetryPanel").then(m => ({ default: m.TelemetryPanel })), "telemetry");

const UserAccessPanel = lazyWithRetry(() => import("@/components/panels/UserAccessPanel").then(m => ({ default: m.UserAccessPanel })), "users");
const DroneSelectionPanel = lazyWithRetry(() => import("@/components/panels/DroneSelectionPanel").then(m => ({ default: m.DroneSelectionPanel })), "drone-selection");
const SettingsPanel = lazyWithRetry(() => import("@/components/panels/SettingsPanel").then(m => ({ default: m.SettingsPanel })), "settings");
const MissionPlanningPanel = lazyWithRetry(() => import("@/components/panels/MissionPlanningPanel").then(m => ({ default: m.MissionPlanningPanel })), "mission");
const FlightPathOptimizerPanel = lazyWithRetry(() => import("@/components/panels/FlightPathOptimizerPanel").then(m => ({ default: m.FlightPathOptimizerPanel })), "optimizer");
const TrackingPanel = lazyWithRetry(() => import("@/components/panels/TrackingPanel").then(m => ({ default: m.TrackingPanel })), "tracking");
const SpeakerPanel = lazyWithRetry(() => import("@/components/panels/SpeakerPanel").then(m => ({ default: m.SpeakerPanel })), "speaker");
const FlightLogsPanel = lazyWithRetry(() => import("@/components/panels/FlightLogsPanel").then(m => ({ default: m.FlightLogsPanel })), "logs");
const FlightLogbookPanel = lazyWithRetry(() => import("@/components/panels/FlightLogbookPanel").then(m => ({ default: m.FlightLogbookPanel })), "logbook");
const BME688Panel = lazyWithRetry(() => import("@/components/panels/BME688Panel"), "environment");
const AutomationPanel = lazyWithRetry(() => import("@/components/panels/AutomationPanel").then(m => ({ default: m.AutomationPanel })), "automation");
const TerminalCommandsPanel = lazyWithRetry(() => import("@/components/panels/TerminalCommandsPanel").then(m => ({ default: m.TerminalCommandsPanel })), "terminal");
const FlightControllerParamsPanel = lazyWithRetry(() => import("@/components/panels/FlightControllerParamsPanel").then(m => ({ default: m.FlightControllerParamsPanel })), "fcparams");
const CalibrationPanel = lazyWithRetry(() => import("@/components/panels/CalibrationPanel").then(m => ({ default: m.CalibrationPanel })), "calibration");
const SwarmOpsPanel = lazyWithRetry(() => import("@/components/panels/SwarmOpsPanel").then(m => ({ default: m.SwarmOpsPanel })), "swarm");
const GeofencingPanel = lazyWithRetry(() => import("@/components/panels/GeofencingPanel").then(m => ({ default: m.GeofencingPanel })), "geofence");
const GUIConfigPanel = lazyWithRetry(() => import("@/components/panels/GUIConfigPanel").then(m => ({ default: m.GUIConfigPanel })), "guiconfig");
const StabilizationPanel = lazyWithRetry(() => import("@/components/panels/StabilizationPanel").then(m => ({ default: m.StabilizationPanel })), "stabilization");
const GpsDeniedNavPanel = lazyWithRetry(() => import("@/components/panels/GpsDeniedNavPanel").then(m => ({ default: m.GpsDeniedNavPanel })), "gpsnav");

function PanelFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/20">
      <div className="text-center">
        <Spinner className="h-8 w-8 mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

interface SystemError {
  id: string;
  type: 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
}

interface Mapping3DStatus {
  active: boolean;
  framesCaptured: number;
  coveragePercent: number;
  confidence: number;
  distanceEstimate: number;
  lastFrameAt: string | null;
  lastModelPath: string | null;
  lastModelGeneratedAt: string | null;
}

const MOVED_TO_SETTINGS_TABS = new Set(["modesetup", "mavtools", "rtk", "plugins", "mp-parity", "vehiclesetup"]);

function PriorMappingCaptures() {
  type MediaItem = { id: string; filename: string; storagePath?: string | null; capturedAt?: string; type?: string };
  const [items, setItems] = useState<MediaItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/media", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        const photos = list
          .filter((a: any) => String(a?.type || "").toLowerCase() === "photo" || String(a?.mimeType || "").startsWith("image/"))
          .slice(0, 24);
        setItems(photos);
      })
      .catch(() => setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="p-3 sm:p-4 bg-card rounded-lg border border-border">
      <h3 className="text-base sm:text-lg font-bold mb-2 flex items-center gap-2">
        <span className="w-2 h-2 bg-amber-500 rounded-full" />
        Prior Captures ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No captures yet — fly nadir passes to populate this gallery.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="aspect-square rounded border border-border overflow-hidden bg-black/40 group relative"
              data-testid={`mapping-capture-${it.id}`}
            >
              {it.storagePath ? (
                <img
                  src={it.storagePath.startsWith("http") || it.storagePath.startsWith("/") ? it.storagePath : `/${it.storagePath}`}
                  alt={it.filename}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                  {it.filename}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100">
                {it.filename}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { isLoggedIn, selectedDrone, selectDrone } = useAppState();
  const [activeTab, setActiveTab] = useState("map");
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);
  const deviceContext = useDeviceContext();

  // Preview mode state (for skipping drone selection) - must be before conditional returns
  const [previewMode, setPreviewMode] = useState(false);
  const isOnboard = deviceContext.isOnboard;
  const runtimeConfigLoaded = deviceContext.runtimeConfigLoaded;
  const [mappingStatus, setMappingStatus] = useState<Mapping3DStatus>({
    active: true,
    framesCaptured: 0,
    coveragePercent: 0,
    confidence: 0,
    distanceEstimate: 0,
    lastFrameAt: null,
    lastModelPath: null,
    lastModelGeneratedAt: null,
  });
  const [mappingBusy, setMappingBusy] = useState(false);
  const [showPageHelp, setShowPageHelp] = useState(false);
  const pageHelp: Record<string, { title: string; body: string }> = {
    map: { title: "Live Map", body: "Center on drone/operator with the zoom controls. FAA overlays are on by default — toggle them in the layer menu (top-right). Drone position, heading, and breadcrumbs update from live telemetry." },
    mission: { title: "Mission Planning", body: "Pick a mission (or create one), then click the map / search an address / enter coordinates to add waypoints. Use Override Restrictions only with proper authorization. Sync to the flight controller from this panel or from Settings → Connections." },
    optimizer: { title: "Flight Path Optimizer", body: "Select a mission with 2+ waypoints, choose optimization preferences (shortest path, energy, exposure), click Analyze, then Apply to write the reordered waypoints back to the mission." },
    tracking: { title: "Object Tracking", body: "Choose a video source (webcam, drone feed, or uploaded clip), draw or click a box to lock a target, then monitor re-identification confidence and motion vectors. Multiple targets can be tracked at once." },
    payload: { title: "Payload / Speaker", body: "Open or close the gripper, run pickup/drop sequences, or start a live broadcast from your microphone to the drone speaker. Audio uses your selected mic and streams as Opus chunks while the broadcast is active." },
    feeds: { title: "Camera & Sensor Feeds", body: "View the live camera, switch between thermal/main, capture stills, kick off a 3D reconstruction from collected frames, and review BME688 environment readings." },
    logs: { title: "Flight Logs", body: "Browse session replays on the map with synchronized telemetry charts. Export per-flight CSV bundles or download the original DataFlash logs for offline analysis." },
    logbook: { title: "Pilot Logbook", body: "Track FAA Part 107 currency: log flights, review hours/landings totals, and export logbook entries as PDF/CSV for recordkeeping." },
    environment: { title: "Environment (BME688)", body: "Watch live temperature, humidity, pressure, IAQ, and gas resistance from the BME688 sensor. Trends update from the onboard reading stream." },
    scripts: { title: "Automation Recipes", body: "Bind events (takeoff, landing, low battery, GPS lost, GCS disconnect, manual) to backend-supported actions (arm, disarm, takeoff(20), land, RTL). Toggle each recipe on/off; click Run Now to test." },
    terminal: { title: "Safe Commands", body: "Browse and run a curated library of MAVLink shell commands by category. Each command's full text is shown before execution; add your own customs as needed." },
    fcparams: { title: "Flight Controller Params", body: "Read, edit, and bulk-write ArduPilot/PX4 parameters via the connected flight controller. Save profiles per drone for quick rollback." },
    calibration: { title: "Sensor Calibration", body: "Step through compass, accel, gyro, level, and ESC calibrations. The connection used is the one configured in Drone Selection." },
    swarm: { title: "Multi-Vehicle Ops", body: "Pick registered drones (single click adds them — no need to type connection strings), build a formation (line/column/wedge/grid), set min spacing for crash avoidance, then arm/disarm/set-mode synchronized across the group." },
    users: { title: "Users & Access", body: "Create accounts, assign roles, manage groups, and review login history. Per-user permissions control which panels each operator can access." },
    geofence: { title: "Geofencing", body: "Draw inclusion or exclusion polygons on the map and set altitude limits. Sync to the flight controller from Settings → Connections → Flight Controller Sync." },
    guiconfig: { title: "GUI Config", body: "Pick the panels you want pinned to the sidebar, configure dashboard widgets, and tune theme/density preferences for your workstation." },
    settings: { title: "Settings", body: "All connections, cloud (Firebase/Google), API keys, telemetry preferences, audio, video, and integration tests live here. Use the in-page tabs (Connections / Cloud / Sensors / Verify) to navigate." },
    stabilization: { title: "ML Stabilization", body: "Tune and monitor the on-board ML stabilizer. Watch live PID output, target vs actual attitude, and confidence — adjust weights in the editor and apply." },
    gpsnav: { title: "GPS-Denied Navigation", body: "Enable visual odometry / dead reckoning / fusion modes for indoor or jamming-prone environments. Calibrate from a known position and watch the estimated-vs-true drift." },
  };

  // Listen for session changes (logout from TopBar or UserAccessPanel)
  useEffect(() => {
    const handleSessionChange = (e: CustomEvent<{ isLoggedIn: boolean }>) => {
      if (!e.detail.isLoggedIn) {
        selectDrone(null);
      }
    };
    window.addEventListener('session-change' as any, handleSessionChange);
    return () => window.removeEventListener('session-change' as any, handleSessionChange);
  }, [selectDrone]);

  // Listen for drone selection changes (from TopBar logo click)
  useEffect(() => {
    const handleDroneChange = (e: CustomEvent<Drone | null>) => {
      selectDrone(e.detail);
    };
    const handleShowDroneSelection = () => {
      selectDrone(null);
    };
    window.addEventListener('drone-selected' as any, handleDroneChange);
    window.addEventListener('show-drone-selection' as any, handleShowDroneSelection);
    return () => {
      window.removeEventListener('drone-selected' as any, handleDroneChange);
      window.removeEventListener('show-drone-selection' as any, handleShowDroneSelection);
    };
  }, [selectDrone]);

  useEffect(() => {
    const handleNavigateTab = (e: CustomEvent<{ tabId?: string }>) => {
      const next = String(e.detail?.tabId || "").trim();
      if (!next) return;
      if (MOVED_TO_SETTINGS_TABS.has(next)) {
        const target = next;
        localStorage.setItem("mouse_settings_advanced_target", target);
        window.dispatchEvent(new CustomEvent("settings-advanced-target", { detail: { target } }));
        setActiveTab("settings");
        return;
      }
      setActiveTab(next);
    };
    window.addEventListener("navigate-tab" as any, handleNavigateTab);
    return () => window.removeEventListener("navigate-tab" as any, handleNavigateTab);
  }, []);

  useEffect(() => {
    if (MOVED_TO_SETTINGS_TABS.has(activeTab)) {
      const target = activeTab;
      localStorage.setItem("mouse_settings_advanced_target", target);
      window.dispatchEvent(new CustomEvent("settings-advanced-target", { detail: { target } }));
      setActiveTab("settings");
    }
  }, [activeTab]);

  // Listen for real system errors from MAVLink/sensors
  useEffect(() => {
    if (!isLoggedIn) return;
    
    const handleError = (event: CustomEvent<SystemError>) => {
      setSystemErrors(prev => [...prev, event.detail]);
    };

    window.addEventListener('system-error' as any, handleError);

    return () => {
      window.removeEventListener('system-error' as any, handleError);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!runtimeConfigLoaded || !isOnboard || selectedDrone) return;
    const onboardDrone: Drone = {
      id: "onboard-local",
      name: "Local Drone",
      callsign: "ONBOARD",
      model: "M.O.U.S.E",
      status: "offline",
      connectionType: "mavlink",
      connectionString: "/dev/ttyACM0",
      latitude: 36.0957,
      longitude: -79.4378,
      altitude: 0,
      heading: 0,
      batteryPercent: 100,
      signalStrength: 0,
      gpsStatus: "no_fix",
      currentMissionId: null,
      currentWaypointIndex: null,
      geofenceEnabled: false,
      geofenceData: null,
      motorCount: 4,
      hasGripper: true,
      hasCamera: true,
      hasThermal: true,
      hasLidar: true,
      maxSpeed: 15,
      maxAltitude: 120,
      rtlAltitude: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeen: null,
    };
    selectDrone(onboardDrone);
  }, [runtimeConfigLoaded, isOnboard, selectDrone, selectedDrone]);

  const refreshMappingStatus = async () => {
    const res = await fetch("/api/mapping/3d/status");
    if (!res.ok) return;
    const data = await res.json();
    if (data?.status) {
      setMappingStatus(data.status);
    }
  };

  const handleReconstruct3D = async () => {
    try {
      setMappingBusy(true);
      const res = await fetch("/api/mapping/3d/reconstruct", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "3D reconstruction failed");
      }
      await refreshMappingStatus();
    } finally {
      setMappingBusy(false);
    }
  };

  const handleReset3D = async () => {
    try {
      setMappingBusy(true);
      await fetch("/api/mapping/3d/reset", { method: "POST" });
      await refreshMappingStatus();
    } finally {
      setMappingBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "feeds") return;
    void refreshMappingStatus();
    const timer = window.setInterval(() => {
      void refreshMappingStatus();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeTab]);

  // If not logged in, show UserAccessPanel (which has the login form)
  if (!isLoggedIn) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Spinner className="h-10 w-10 mx-auto mb-3 text-primary" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }>
        <UserAccessPanel />
      </Suspense>
    );
  }

  // Preview drone for preview mode
  const previewDrone: Drone = {
    id: "preview-drone",
    name: "Preview Drone",
    callsign: "PREVIEW",
    model: "M.O.U.S.E",
    status: "offline",
    connectionType: "mavlink",
    connectionString: null,
    latitude: 36.0957,
    longitude: -79.4378,
    altitude: 0,
    heading: 0,
    batteryPercent: 100,
    signalStrength: 0,
    gpsStatus: "no_fix",
    currentMissionId: null,
    currentWaypointIndex: null,
    geofenceEnabled: false,
    geofenceData: null,
    motorCount: 4,
    hasGripper: true,
    hasCamera: true,
    hasThermal: true,
    hasLidar: true,
    maxSpeed: 15,
    maxAltitude: 120,
    rtlAltitude: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeen: null,
  };

  // Wait for runtime config before deciding what to show
  if (!runtimeConfigLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Initializing M.O.U.S.E. Ground Control...</p>
        </div>
      </div>
    );
  }

  // If logged in but no drone selected, show drone selection panel (unless preview mode or onboard mode)
  // Note: isOnboard mode auto-selects local drone in useEffect, so this should rarely trigger on Pi
  if (!selectedDrone && !previewMode && !isOnboard) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Spinner className="h-10 w-10 mx-auto mb-3 text-primary" />
            <p className="text-muted-foreground">Loading drone selection...</p>
          </div>
        </div>
      }>
        <DroneSelectionPanel 
          onDroneSelected={(drone) => selectDrone(drone)} 
          onSkipPreview={() => {
            setPreviewMode(true);
            selectDrone(previewDrone);
          }}
        />
      </Suspense>
    );
  }

  const dismissError = (id: string) => {
    setSystemErrors(prev => prev.filter(e => e.id !== id));
  };

  const renderMainContent = () => {
    switch (activeTab) {
      case "map":
        return (
          <div className="flex-1 relative">
            <MapInterface />
            <VideoFeed />
          </div>
        );
      case "mission":
        return (
          <div className="flex-1 relative overflow-hidden">
            <MissionPlanningPanel />
          </div>
        );
      case "optimizer":
        return (
          <div className="flex-1 relative overflow-hidden">
            <FlightPathOptimizerPanel />
          </div>
        );
      case "tracking":
        return (
          <div className="flex-1 relative overflow-hidden">
            <TrackingPanel />
          </div>
        );
      case "payload":
        return (
          <div className="flex-1 relative overflow-hidden">
            <SpeakerPanel
              isControllerMode={deviceContext.isController}
              micRoutedToDrone={
                deviceContext.isController &&
                deviceContext.peripherals.microphone === "drone_speaker"
              }
            />
          </div>
        );
      case "feeds":
        return (
          <div className="flex-1 relative bg-background p-3 sm:p-6 overflow-auto">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xl sm:text-2xl font-bold">Camera Feeds & 3D Mapping</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/50">
                DRONE FEED PIPELINE
              </span>
            </div>
            <Tabs
              defaultValue="live"
              className="w-full"
              onValueChange={async (v) => {
                if (v !== "mapping") return;
                // Auto-lock gimbal to nadir (-90° pitch) for top-down photogrammetry capture.
                // Best-effort: surface a clear toast so the operator knows whether the gimbal
                // actually responded — never silently claim success.
                try {
                  const resp = await fetch("/api/mavlink/vehicle/action", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      connectionString: (selectedDrone as any)?.connectionString || "udp:127.0.0.1:14550",
                      action: "gimbal",
                      pitch: -90,
                      yaw: 0,
                    }),
                  });
                  const data = await resp.json().catch(() => ({}));
                  if (resp.ok && (data?.success ?? true)) {
                    sonnerToast.success("Gimbal nadir-lock requested (-90° pitch)");
                  } else {
                    sonnerToast.warning(
                      `Nadir-lock not dispatched: ${data?.error || resp.statusText || "no MAVLink connection"}`
                    );
                  }
                } catch (err: any) {
                  sonnerToast.warning(`Nadir-lock failed: ${err?.message || "network error"}`);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="live" data-testid="tab-feeds-live">Live Feed</TabsTrigger>
                <TabsTrigger value="mapping" data-testid="tab-feeds-mapping">3D Mapping</TabsTrigger>
              </TabsList>
              <TabsContent value="live" className="mt-3">
                <p className="text-xs text-muted-foreground mb-3">
                  Feeds use the same camera module as map view, including gimbal/thermal modes and RTSP stream configuration.
                </p>
                <div className="relative min-h-[320px] sm:min-h-[460px] rounded-lg border-2 border-primary/40 bg-black/90 overflow-hidden">
                  <VideoFeed />
                </div>
              </TabsContent>
              <TabsContent value="mapping" className="mt-3 space-y-4">
                <div className="p-3 rounded border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300">
                  Gimbal automatically locked to <strong>nadir (-90° pitch)</strong> for top-down capture.
                  Fly a serpentine pattern at constant altitude for best photogrammetry results.
                </div>
                <PriorMappingCaptures />
            <div className="p-3 sm:p-4 bg-card rounded-lg border border-border">
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                3D Mapping / Photogrammetry
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div className="p-2 sm:p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-lg sm:text-2xl font-bold text-primary">{mappingStatus.framesCaptured}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Images</p>
                </div>
                <div className="p-2 sm:p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-lg sm:text-2xl font-bold text-amber-500">{mappingStatus.coveragePercent}%</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Coverage</p>
                </div>
                <div className="p-2 sm:p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-lg sm:text-2xl font-bold text-emerald-500">{mappingStatus.confidence}%</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Status</p>
                </div>
              </div>
              <div className="mt-3 h-2 rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, mappingStatus.coveragePercent))}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset3D}
                  disabled={mappingBusy}
                  data-testid="button-reset-3d-mapping"
                >
                  Reset Capture
                </Button>
                <Button
                  size="sm"
                  onClick={handleReconstruct3D}
                  disabled={mappingBusy || mappingStatus.framesCaptured < 10}
                  data-testid="button-generate-3d-map"
                >
                  Generate 3D Map
                </Button>
                {mappingStatus.lastModelPath && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.open("/api/mapping/3d/model/latest", "_blank")}
                    data-testid="button-open-3d-artifact"
                  >
                    Model Ready
                  </Button>
                )}
              </div>
              <div className="mt-3 sm:mt-4 space-y-2">
                <div className="p-2 sm:p-3 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] sm:text-xs text-amber-500">
                  <strong>Note:</strong> For best 3D reconstruction, lock gimbal to nadir position.
                </div>
                <div className="p-2 sm:p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <span className="font-semibold">Production mapping pipeline</span> — JSON + PLY export, DB persistence, model listing.
                </div>
              </div>
            </div>
              </TabsContent>
            </Tabs>
          </div>
        );
      case "logs":
        return (
          <div className="flex-1 relative overflow-hidden">
            <FlightLogsPanel />
          </div>
        );
      case "logbook":
        return (
          <div className="flex-1 relative overflow-hidden">
            <FlightLogbookPanel />
          </div>
        );
      case "environment":
        return (
          <div className="flex-1 relative overflow-hidden">
            <BME688Panel />
          </div>
        );
      case "scripts":
        return (
          <div className="flex-1 relative overflow-hidden">
            <AutomationPanel />
          </div>
        );
      case "terminal":
        return (
          <div className="flex-1 relative overflow-hidden">
            <TerminalCommandsPanel />
          </div>
        );
      case "fcparams":
        return (
          <div className="flex-1 relative overflow-hidden">
            <FlightControllerParamsPanel />
          </div>
        );
      case "calibration":
        return (
          <div className="flex-1 relative overflow-hidden">
            <CalibrationPanel />
          </div>
        );
      case "swarm":
        return (
          <div className="flex-1 relative overflow-hidden">
            <SwarmOpsPanel />
          </div>
        );
      case "users":
        return (
          <div className="flex-1 relative overflow-hidden">
            <UserAccessPanel />
          </div>
        );
      case "geofence":
        return (
          <div className="flex-1 relative overflow-hidden">
            <GeofencingPanel />
          </div>
        );
      case "guiconfig":
        return (
          <div className="flex-1 relative overflow-hidden">
            <GUIConfigPanel />
          </div>
        );
      case "settings":
        return (
          <div className="flex-1 relative overflow-hidden">
            <SettingsPanel />
          </div>
        );
      case "stabilization":
        return (
          <div className="flex-1 relative overflow-hidden">
            <StabilizationPanel />
          </div>
        );
      case "gpsnav":
        return (
          <div className="flex-1 relative overflow-hidden">
            <GpsDeniedNavPanel />
          </div>
        );
      default:
        return (
          <div className="flex-1 relative">
            <MapInterface />
            <VideoFeed />
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden relative">
      <AutoStabilizationController />
      <MLStabilizationEngine />
      <StabilizationActuatorBridge />
      <SensorAnomalyMonitor />
      <EmergencyProtocolController />
      <GpsDeniedNavigationController />
      <MLNavigationEngine />
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none z-0" />

      {/* System Error Pop-ups */}
      <div className="fixed top-16 right-2 sm:right-4 z-[200] space-y-2 max-w-[280px] sm:max-w-sm">
        {systemErrors.slice(-3).map((error) => (
          <Alert 
            key={error.id}
            variant={error.type === 'critical' ? 'destructive' : 'default'}
            className={`
              animate-in slide-in-from-right shadow-lg
              ${error.type === 'warning' ? 'border-amber-500 bg-amber-500/10' : ''}
              ${error.type === 'error' ? 'border-red-500 bg-red-500/10' : ''}
              ${error.type === 'critical' ? 'border-red-600 bg-red-600/20 animate-pulse' : ''}
            `}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className={`h-4 w-4 ${error.type === 'warning' ? 'text-amber-500' : 'text-red-500'}`} />
              <div className="flex-1">
                <AlertTitle className="text-sm font-bold">{error.title}</AlertTitle>
                <AlertDescription className="text-xs mt-1">{error.message}</AlertDescription>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 -mt-1 -mr-2"
                onClick={() => dismissError(error.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </Alert>
        ))}
      </div>

      
      {/* Onboard Mode Banner (running on Raspberry Pi) */}
      {isOnboard && selectedDrone?.id === "onboard-local" && (
        <div className="fixed top-0 left-0 right-0 z-[250] bg-green-600 text-white px-4 py-2 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">Onboard Mode - Running on Raspberry Pi (Local MAVLink: {selectedDrone.connectionString})</span>
          </div>
        </div>
      )}

      <DeviceContextBanner
        environment={deviceContext.environment}
        isOnboard={deviceContext.isOnboard}
        networkStatus={deviceContext.networkStatus}
        latencyMs={deviceContext.latencyMs}
        connectedDroneName={deviceContext.connectedDroneName}
        peripheralMappings={{
          microphone: deviceContext.peripherals.microphone,
          camera: deviceContext.peripherals.camera,
          speaker: deviceContext.peripherals.speaker,
        }}
        onToggleEnvironment={() => {
          deviceContext.setEnvironment(
            deviceContext.environment === "ground_controller" ? "drone_onboard" : "ground_controller"
          );
        }}
      />

      <TopBar onSettingsClick={() => setActiveTab("settings")} />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {showPageHelp && pageHelp[activeTab] && (
            <div className="p-2 sm:p-3 border-b border-border/50">
              <Card className="bg-muted/20 border-primary/20">
                <CardContent className="py-2 px-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-primary">
                      {pageHelp[activeTab].title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pageHelp[activeTab].body}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowPageHelp(false)} className="h-6 px-2 text-xs">
                    Hide
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
          {!showPageHelp && pageHelp[activeTab] && (
            <div className="px-2 pt-1 -mb-1">
              <Button variant="ghost" size="sm" onClick={() => setShowPageHelp(true)} className="h-5 px-2 text-[10px] text-muted-foreground hover:text-primary">
                Show {pageHelp[activeTab].title} guide
              </Button>
            </div>
          )}
          <Suspense fallback={<PanelFallback />}>
            {renderMainContent()}
          </Suspense>
          
          {/* Only show control deck on map view */}
          {activeTab === "map" && (
            <Suspense fallback={null}>
              <ControlDeck activeTab={activeTab} />
            </Suspense>
          )}
        </main>

        {/* Right Side Telemetry Panel - show on map and tracking views */}
        {(activeTab === "map" || activeTab === "tracking") && (
          <Suspense fallback={<div className="w-64 animate-pulse bg-muted/30 rounded" />}>
            <TelemetryPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}
