import { Button } from "@/components/ui/button";
import { Hand, ArrowUpCircle, ArrowDownCircle, Power, AlertOctagon, Navigation, Zap, Lock, Circle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";

interface BaseLocation {
  lat: number;
  lng: number;
  name: string;
}

interface CustomWidget {
  id: string;
  name: string;
  type: 'button' | 'display';
  targetPage: string;
  command?: string;
  displayValue?: string;
}

interface ControlDeckProps {
  activeTab?: string;
}

export function ControlDeck({ activeTab = 'map' }: ControlDeckProps) {
  const { hasPermission, isLoggedIn, getRole } = usePermissions();
  
  const canArmDisarm = hasPermission('arm_disarm');
  const canFlightControl = hasPermission('flight_control');
  const hasAnyControlPermission = canArmDisarm || canFlightControl;
  
  const [isArmed, setIsArmed] = useState(() => {
    const saved = localStorage.getItem('mouse_drone_armed');
    return saved ? JSON.parse(saved) : false;
  });
  const [gripperOpen, setGripperOpen] = useState(false);
  const [baseLocation, setBaseLocation] = useState<BaseLocation | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const flightStartTime = useRef<Date | null>(null);
  const maxAltitudeRef = useRef<number>(0);
  const totalDistanceRef = useRef<number>(0);
  const lastPositionRef = useRef<{lat: number, lng: number} | null>(null);

  // Get current drone ID from localStorage
  const getCurrentDroneId = () => {
    const saved = localStorage.getItem('mouse_selected_drone');
    return saved ? JSON.parse(saved)?.id : 'default';
  };

  // Start flight session automatically on takeoff
  const startFlightSession = async () => {
    try {
      const droneId = getCurrentDroneId();
      const response = await apiRequest('POST', '/api/flight-sessions/start', { droneId });
      const data = await response.json();
      if (data.success && data.session) {
        setActiveSessionId(data.session.id);
        setIsRecording(true);
        flightStartTime.current = new Date();
        maxAltitudeRef.current = 0;
        totalDistanceRef.current = 0;
        lastPositionRef.current = null;
        toast.success("Flight recording started");
        console.log(`[FLIGHT] Session started: ${data.session.id}`);
      }
    } catch (error) {
      console.error("Failed to start flight session:", error);
    }
  };

  // End flight session automatically on landing
  const endFlightSession = async () => {
    if (!activeSessionId && !isRecording) return;
    
    try {
      const droneId = getCurrentDroneId();
      const totalFlightTime = flightStartTime.current 
        ? Math.round((Date.now() - flightStartTime.current.getTime()) / 1000)
        : 0;
      
      const response = await apiRequest('POST', '/api/flight-sessions/end', { 
        sessionId: activeSessionId,
        droneId,
        maxAltitude: maxAltitudeRef.current,
        totalDistance: totalDistanceRef.current,
        totalFlightTime
      });
      const data = await response.json();
      if (data.success) {
        setActiveSessionId(null);
        setIsRecording(false);
        flightStartTime.current = null;
        toast.success(`Flight recording saved (${Math.round(totalFlightTime / 60)}m ${totalFlightTime % 60}s)`);
        console.log(`[FLIGHT] Session ended: ${data.session?.id}`);
      }
    } catch (error) {
      console.error("Failed to end flight session:", error);
    }
  };

  // Track telemetry for session stats
  useEffect(() => {
    if (!isRecording) return;
    
    const handleTelemetry = (e: CustomEvent) => {
      const { altitude, latitude, longitude } = e.detail || {};
      if (altitude && altitude > maxAltitudeRef.current) {
        maxAltitudeRef.current = altitude;
      }
      if (latitude && longitude && lastPositionRef.current) {
        const dist = calculateDistance(
          lastPositionRef.current.lat, lastPositionRef.current.lng,
          latitude, longitude
        );
        totalDistanceRef.current += dist;
      }
      if (latitude && longitude) {
        lastPositionRef.current = { lat: latitude, lng: longitude };
      }
    };
    
    window.addEventListener('telemetry-update' as any, handleTelemetry);
    return () => window.removeEventListener('telemetry-update' as any, handleTelemetry);
  }, [isRecording]);

  // Haversine distance calculation
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // Check for active session on mount
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const droneId = getCurrentDroneId();
        const response = await fetch(`/api/flight-sessions/active?droneId=${droneId}`);
        const data = await response.json();
        if (data.session) {
          setActiveSessionId(data.session.id);
          setIsRecording(true);
          flightStartTime.current = new Date(data.session.startTime);
        }
      } catch (error) {
        console.error("Failed to check active session:", error);
      }
    };
    checkActiveSession();
  }, []);

  // Load custom widgets from localStorage
  useEffect(() => {
    const loadWidgets = () => {
      const saved = localStorage.getItem('mouse_gui_widgets');
      if (saved) {
        try {
          setCustomWidgets(JSON.parse(saved));
        } catch {}
      }
    };
    loadWidgets();
    
    // Listen for gui-config-changed events
    const handleConfigChange = (e: CustomEvent) => {
      if (e.detail?.widgets) {
        setCustomWidgets(e.detail.widgets);
      } else {
        loadWidgets();
      }
    };
    window.addEventListener('gui-config-changed' as any, handleConfigChange);
    return () => window.removeEventListener('gui-config-changed' as any, handleConfigChange);
  }, []);

  // Load base location from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mouse_base_location');
    if (saved) {
      try {
        setBaseLocation(JSON.parse(saved));
      } catch {}
    }
    
    // Listen for storage changes (when settings updates base location)
    const handleStorageChange = () => {
      const saved = localStorage.getItem('mouse_base_location');
      if (saved) {
        try {
          setBaseLocation(JSON.parse(saved));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const executeWidgetCommand = (widget: CustomWidget) => {
    if (widget.command) {
      toast.success(`Executing: ${widget.command}`);
      // In real implementation, this would send command to backend
      window.dispatchEvent(new CustomEvent('execute-command', { detail: { command: widget.command } }));
    }
  };

  // Filter widgets for current page
  const pageWidgets = customWidgets.filter(w => w.targetPage === activeTab);

  const handleReturnToBase = () => {
    if (!canFlightControl) {
      toast.error("You don't have flight control permission");
      return;
    }
    if (!baseLocation) {
      toast.error("No base location set. Configure in Settings.");
      return;
    }
    if (!isArmed) {
      toast.error("System must be armed to return to base");
      return;
    }
    setIsReturning(true);
    toast.success(`Returning to base: ${baseLocation.name} (${baseLocation.lat.toFixed(4)}, ${baseLocation.lng.toFixed(4)})`);
    window.dispatchEvent(new CustomEvent('flight-command', { detail: { command: 'rtl', target: baseLocation } }));
    setTimeout(() => setIsReturning(false), 3000);
  };

  // Show restricted view for users without control permissions
  if (!hasAnyControlPermission) {
    return (
      <div className="h-auto min-h-[120px] sm:min-h-[140px] lg:h-40 border-t border-border bg-card/80 backdrop-blur-md p-2 sm:p-4 flex items-center justify-center shrink-0 z-50">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Lock className="h-8 w-8" />
          <span className="text-sm font-medium">View-Only Mode</span>
          <span className="text-xs">Flight controls require operator or admin permissions</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-auto min-h-[120px] sm:min-h-[140px] lg:h-40 border-t border-border bg-card/80 backdrop-blur-md p-2 sm:p-4 flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 shrink-0 z-50 overflow-x-auto">
      
      {/* Recording Indicator */}
      {isRecording && (
        <div className="flex items-center gap-1 px-2 py-1 bg-destructive/20 border border-destructive/50 rounded-md shrink-0">
          <Circle className="h-3 w-3 fill-destructive text-destructive animate-pulse" />
          <span className="text-[10px] font-mono text-destructive font-semibold">REC</span>
        </div>
      )}

      {/* Arming Panel */}
      <div className="flex flex-col gap-1 sm:gap-2 w-24 sm:w-36 shrink-0">
        <span className="text-[8px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Master</span>
        <Button 
          variant="outline" 
          className={cn(
            "h-full flex flex-col gap-1 border-2",
            !canArmDisarm && "opacity-50 cursor-not-allowed",
            isArmed 
              ? "bg-destructive/10 border-destructive text-destructive hover:bg-destructive/20 hover:text-destructive" 
              : "bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-500"
          )}
          disabled={!canArmDisarm}
          onClick={() => {
            if (!canArmDisarm) {
              toast.error("You don't have permission to arm/disarm");
              return;
            }
            const newArmed = !isArmed;
            setIsArmed(newArmed);
            localStorage.setItem('mouse_drone_armed', JSON.stringify(newArmed));
            window.dispatchEvent(new CustomEvent('arm-state-changed', { detail: { armed: newArmed } }));
          }}
          data-testid="button-arm-toggle"
        >
          <Power className="h-6 w-6" />
          <span className="font-bold tracking-wider text-[10px]">{isArmed ? "DISARM" : "ARM"}</span>
        </Button>
      </div>

      {/* Flight Modes */}
      <div className="flex flex-col gap-1 sm:gap-2 flex-1 min-w-0">
        <span className="text-[8px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Flight Controls</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 h-full">
          <Button 
            variant="secondary" 
            className={cn(
              "h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2",
              !canFlightControl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!isArmed || !canFlightControl}
            onClick={async () => {
              if (!canFlightControl) {
                toast.error("You don't have flight control permission");
                return;
              }
              toast.success("Initiating takeoff sequence...");
              window.dispatchEvent(new CustomEvent('flight-command', { detail: { command: 'takeoff' } }));
              await startFlightSession();
            }}
            data-testid="button-takeoff"
          >
            <ArrowUpCircle className="h-5 w-5" />
            <span className="text-[10px] font-mono">TAKEOFF</span>
          </Button>
          
          <Button 
            variant="secondary" 
            className={cn(
              "h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2",
              isReturning && "bg-amber-500/20 border-amber-500 text-amber-500",
              !canFlightControl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!isArmed || !baseLocation || !canFlightControl}
            onClick={handleReturnToBase}
            title={!canFlightControl ? "No flight control permission" : (baseLocation ? `Return to: ${baseLocation.name}` : "Configure base in Settings")}
            data-testid="button-rtl"
          >
            <Navigation className={cn("h-5 w-5", isReturning && "animate-pulse")} />
            <span className="text-[10px] font-mono">RTL</span>
          </Button>
          
          <Button 
            variant="secondary" 
            className={cn(
              "h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2",
              !canFlightControl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!isArmed || !canFlightControl}
            onClick={async () => {
              if (!canFlightControl) {
                toast.error("You don't have flight control permission");
                return;
              }
              toast.success("Initiating landing sequence...");
              window.dispatchEvent(new CustomEvent('flight-command', { detail: { command: 'land' } }));
              await endFlightSession();
            }}
            data-testid="button-land"
          >
            <ArrowDownCircle className="h-5 w-5" />
            <span className="text-[10px] font-mono">LAND</span>
          </Button>

          <Button 
            variant="destructive" 
            className={cn(
              "h-full flex flex-col gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 p-2",
              canFlightControl && "animate-pulse",
              !canFlightControl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canFlightControl}
            onClick={() => {
              if (!canFlightControl) {
                toast.error("You don't have flight control permission");
                return;
              }
              toast.error("EMERGENCY STOP ACTIVATED - Motors killed!", { duration: 5000 });
              window.dispatchEvent(new CustomEvent('flight-command', { detail: { command: 'abort' } }));
              setIsArmed(false);
              localStorage.setItem('mouse_drone_armed', JSON.stringify(false));
              window.dispatchEvent(new CustomEvent('arm-state-changed', { detail: { armed: false } }));
            }}
            data-testid="button-abort"
          >
            <AlertOctagon className="h-5 w-5" />
            <span className="text-[10px] font-mono font-bold">ABORT</span>
          </Button>
        </div>
      </div>

      {/* Payload Control */}
      <div className="flex flex-col gap-1 sm:gap-2 w-24 sm:w-36 shrink-0">
        <span className="text-[8px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Payload</span>
        <Button 
          variant="outline"
          className={cn(
            "h-full flex flex-col gap-1 relative overflow-hidden",
            !canFlightControl && "opacity-50 cursor-not-allowed",
            gripperOpen ? "border-amber-500 text-amber-500" : "border-primary text-primary"
          )}
          disabled={!canFlightControl}
          onClick={async () => {
            if (!canFlightControl) {
              toast.error("You don't have flight control permission");
              return;
            }
            const newState = !gripperOpen;
            const action = newState ? 'open' : 'close';
            
            try {
              const res = await fetch('/api/servo/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
              });
              
              if (res.ok) {
                const data = await res.json();
                setGripperOpen(newState);
                toast.success(data.message || `Gripper ${action}ed`);
                window.dispatchEvent(new CustomEvent('flight-command', { 
                  detail: { command: 'gripper', action } 
                }));
              } else {
                const err = await res.json();
                toast.error(err.error || 'Gripper control failed');
              }
            } catch (e) {
              // Fallback for offline/error - still update UI state
              setGripperOpen(newState);
              toast.info(`Gripper ${action} (offline mode)`);
            }
          }}
          data-testid="button-gripper"
        > 
          <div className={cn(
            "absolute inset-0 opacity-10 transition-colors",
             gripperOpen ? "bg-amber-500" : "bg-primary"
          )} />
          <Hand className={cn("h-6 w-6 transition-transform", gripperOpen ? "scale-x-[-1]" : "")} />
          <span className="font-bold tracking-wider text-[10px]">{gripperOpen ? "RELEASE" : "GRAB"}</span>
        </Button>
      </div>

      {/* Custom Widgets */}
      {pageWidgets.length > 0 && (
        <div className="flex flex-col gap-1 sm:gap-2 min-w-0 shrink-0">
          <span className="text-[8px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Custom</span>
          <div className="flex gap-2 h-full">
            {pageWidgets.map(widget => (
              <Button
                key={widget.id}
                variant="outline"
                className="h-full flex flex-col gap-1 px-3 border-2 border-purple-500/50 hover:bg-purple-500/20 hover:text-purple-400 min-w-[80px]"
                onClick={() => executeWidgetCommand(widget)}
                data-testid={`widget-button-${widget.id}`}
              >
                <Zap className="h-5 w-5 text-purple-400" />
                <span className="text-[10px] font-mono truncate max-w-[60px]">{widget.name}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
