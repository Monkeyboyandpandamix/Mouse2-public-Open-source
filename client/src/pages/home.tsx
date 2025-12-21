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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  // Listen for system errors from various sources
  useEffect(() => {
    const handleError = (event: CustomEvent<SystemError>) => {
      setSystemErrors(prev => [...prev, event.detail]);
    };

    window.addEventListener('system-error' as any, handleError);
    
    // Simulate occasional system warnings for demo
    const checkInterval = setInterval(() => {
      // In real implementation, this would check actual system status
      const random = Math.random();
      if (random < 0.02) { // 2% chance of error demo
        const errors: SystemError[] = [
          { id: Date.now().toString(), type: 'warning', title: 'GPS Signal Weak', message: 'Only 4 satellites in view. Consider waiting for better signal.', timestamp: new Date() },
          { id: Date.now().toString(), type: 'warning', title: 'Battery Low', message: 'Battery at 22%. Consider returning to base.', timestamp: new Date() },
          { id: Date.now().toString(), type: 'error', title: 'Telemetry Lag', message: 'High latency detected on telemetry link. Check connection.', timestamp: new Date() },
        ];
        const error = errors[Math.floor(Math.random() * errors.length)];
        setSystemErrors(prev => [...prev, error]);
      }
    }, 30000);

    return () => {
      window.removeEventListener('system-error' as any, handleError);
      clearInterval(checkInterval);
    };
  }, []);

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

      <TopBar onSettingsClick={() => setActiveTab("settings")} />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {renderMainContent()}
          
          {/* Only show control deck on map view */}
          {activeTab === "map" && <ControlDeck />}
        </main>

        {/* Right Side Telemetry Panel - show on map and tracking views */}
        {(activeTab === "map" || activeTab === "tracking") && <TelemetryPanel />}
      </div>
    </div>
  );
}
