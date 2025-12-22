import { useState, useEffect } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TelemetryPanel } from "@/components/telemetry/TelemetryPanel";
import { MapInterface } from "@/components/map/MapInterface";
import { ControlDeck } from "@/components/controls/ControlDeck";
import { VideoFeed } from "@/components/video/VideoFeed";
import { SettingsPanel } from "@/components/panels/SettingsPanel";
import { MissionPlanningPanel } from "@/components/panels/MissionPlanningPanel";
import { TrackingPanel } from "@/components/panels/TrackingPanel";
import { SpeakerPanel } from "@/components/panels/SpeakerPanel";
import { FlightLogsPanel } from "@/components/panels/FlightLogsPanel";
import { AutomationPanel } from "@/components/panels/AutomationPanel";
import { TerminalCommandsPanel } from "@/components/panels/TerminalCommandsPanel";
import { UserAccessPanel } from "@/components/panels/UserAccessPanel";
import { GeofencingPanel } from "@/components/panels/GeofencingPanel";
import { GUIConfigPanel } from "@/components/panels/GUIConfigPanel";
import { DroneSelectionPanel } from "@/components/panels/DroneSelectionPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, X, Eye, ArrowLeft, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Drone } from "@shared/schema";

interface SystemError {
  id: string;
  type: 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("map");
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);
  
  // Global session state - check if user is logged in
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const saved = localStorage.getItem('mouse_gcs_session');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        return session.isLoggedIn === true;
      } catch {
        return false;
      }
    }
    return false;
  });

  // Selected drone state
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(() => {
    const saved = localStorage.getItem('mouse_selected_drone');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  // Listen for session changes (logout from TopBar or UserAccessPanel)
  useEffect(() => {
    const handleSessionChange = (e: CustomEvent<{ isLoggedIn: boolean }>) => {
      setIsLoggedIn(e.detail.isLoggedIn);
      // Clear selected drone on logout
      if (!e.detail.isLoggedIn) {
        setSelectedDrone(null);
        localStorage.removeItem('mouse_selected_drone');
      }
    };
    window.addEventListener('session-change' as any, handleSessionChange);
    return () => window.removeEventListener('session-change' as any, handleSessionChange);
  }, []);

  // Listen for drone selection changes (from TopBar logo click)
  useEffect(() => {
    const handleDroneChange = (e: CustomEvent<Drone | null>) => {
      setSelectedDrone(e.detail);
    };
    const handleShowDroneSelection = () => {
      setSelectedDrone(null);
      localStorage.removeItem('mouse_selected_drone');
    };
    window.addEventListener('drone-selected' as any, handleDroneChange);
    window.addEventListener('show-drone-selection' as any, handleShowDroneSelection);
    return () => {
      window.removeEventListener('drone-selected' as any, handleDroneChange);
      window.removeEventListener('show-drone-selection' as any, handleShowDroneSelection);
    };
  }, []);

  // Listen for real system errors from MAVLink/sensors (must be before conditional return)
  useEffect(() => {
    if (!isLoggedIn) return; // Only run when logged in
    
    const handleError = (event: CustomEvent<SystemError>) => {
      setSystemErrors(prev => [...prev, event.detail]);
    };

    window.addEventListener('system-error' as any, handleError);

    return () => {
      window.removeEventListener('system-error' as any, handleError);
    };
  }, [isLoggedIn]);

  // If not logged in, show UserAccessPanel (which has the login form)
  if (!isLoggedIn) {
    return <UserAccessPanel />;
  }

  // Preview mode state (for skipping drone selection)
  const [previewMode, setPreviewMode] = useState(false);
  
  // Onboard mode (running on Raspberry Pi)
  const [isOnboard, setIsOnboard] = useState(false);
  const [runtimeConfigLoaded, setRuntimeConfigLoaded] = useState(false);
  
  // Fetch runtime config to detect if running on Pi
  useEffect(() => {
    fetch('/api/runtime-config')
      .then(res => res.json())
      .then(config => {
        setIsOnboard(config.isOnboard);
        setRuntimeConfigLoaded(true);
        
        // If running on Pi, auto-create and select local drone
        if (config.isOnboard && !selectedDrone) {
          const onboardDrone: Drone = {
            id: -1, // Special ID for onboard drone
            name: "Local Drone",
            callsign: "ONBOARD",
            model: "M.O.U.S.E",
            status: "offline",
            connectionType: "mavlink",
            connectionString: config.mavlinkDefaults?.connectionString || "/dev/ttyACM0",
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
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSeen: null,
          };
          setSelectedDrone(onboardDrone);
          localStorage.setItem("mouse_selected_drone", JSON.stringify(onboardDrone));
          // Dispatch event so all components know a drone is selected
          window.dispatchEvent(new CustomEvent("drone-selected", { detail: onboardDrone }));
        }
      })
      .catch(() => {
        setRuntimeConfigLoaded(true); // Continue even if fetch fails
      });
  }, []);

  // Mock drone for preview mode
  const previewDrone: Drone = {
    id: 0,
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
      <DroneSelectionPanel 
        onDroneSelected={(drone) => setSelectedDrone(drone)} 
        onSkipPreview={() => {
          setPreviewMode(true);
          // Set preview drone as the selected drone so all components work
          setSelectedDrone(previewDrone);
          localStorage.setItem("mouse_selected_drone", JSON.stringify(previewDrone));
          window.dispatchEvent(new CustomEvent("drone-selected", { detail: previewDrone }));
        }}
      />
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
      case "tracking":
        return (
          <div className="flex-1 relative overflow-hidden">
            <TrackingPanel />
          </div>
        );
      case "payload":
        return (
          <div className="flex-1 relative overflow-hidden">
            <SpeakerPanel />
          </div>
        );
      case "feeds":
        return (
          <div className="flex-1 relative bg-background p-3 sm:p-6 overflow-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Camera Feeds & 3D Mapping</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-black rounded-lg border-2 border-primary/50 aspect-video flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <p className="text-base sm:text-lg font-mono">GIMBAL CAM</p>
                  <p className="text-[10px] sm:text-xs">2K HD (2560x1440)</p>
                </div>
              </div>
              <div className="bg-black rounded-lg border-2 border-amber-500/50 aspect-video flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <p className="text-base sm:text-lg font-mono">THERMAL</p>
                  <p className="text-[10px] sm:text-xs">384x288 IR</p>
                </div>
              </div>
            </div>
            
            {/* 3D Mapping Section */}
            <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-card rounded-lg border border-border">
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                3D Mapping / Photogrammetry
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div className="p-2 sm:p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-lg sm:text-2xl font-bold text-primary">0</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Images</p>
                </div>
                <div className="p-2 sm:p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-lg sm:text-2xl font-bold text-amber-500">--</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Coverage</p>
                </div>
                <div className="p-2 sm:p-4 bg-muted/30 rounded-lg text-center">
                  <p className="text-lg sm:text-2xl font-bold text-emerald-500">Ready</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Status</p>
                </div>
              </div>
              <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] sm:text-xs text-amber-500">
                <strong>Note:</strong> For best 3D reconstruction, lock gimbal to nadir position.
              </div>
            </div>
          </div>
        );
      case "logs":
        return (
          <div className="flex-1 relative overflow-hidden">
            <FlightLogsPanel />
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

      {/* Preview Mode Banner */}
      {previewMode && selectedDrone?.id === 0 && (
        <div className="fixed top-0 left-0 right-0 z-[250] bg-amber-500 text-black px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="text-sm font-medium">Preview Mode - No drone connected</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-black hover:bg-amber-600"
            onClick={() => {
              setPreviewMode(false);
              setSelectedDrone(null);
              localStorage.removeItem("mouse_selected_drone");
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Drone Selection
          </Button>
        </div>
      )}
      
      {/* Onboard Mode Banner (running on Raspberry Pi) */}
      {isOnboard && selectedDrone?.id === -1 && (
        <div className="fixed top-0 left-0 right-0 z-[250] bg-green-600 text-white px-4 py-2 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            <span className="text-sm font-medium">Onboard Mode - Running on Raspberry Pi (Local MAVLink: {selectedDrone.connectionString})</span>
          </div>
        </div>
      )}

      <TopBar onSettingsClick={() => setActiveTab("settings")} />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {renderMainContent()}
          
          {/* Only show control deck on map view */}
          {activeTab === "map" && <ControlDeck activeTab={activeTab} />}
        </main>

        {/* Right Side Telemetry Panel - show on map and tracking views */}
        {(activeTab === "map" || activeTab === "tracking") && <TelemetryPanel />}
      </div>
    </div>
  );
}
