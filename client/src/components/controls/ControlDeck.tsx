import { Button } from "@/components/ui/button";
import { Hand, ArrowUpCircle, ArrowDownCircle, Power, AlertOctagon, Navigation, Zap, Lock, Circle, Route } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { dispatchBackendCommand } from "@/lib/commandService";

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
  const [gripperLoading, setGripperLoading] = useState(false);
  const [baseLocation, setBaseLocation] = useState<BaseLocation | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [inputConfig, setInputConfig] = useState<{ gamepadDevice: string; joystickDeadzone: string }>({
    gamepadDevice: "none",
    joystickDeadzone: "5",
  });
  const supportsTakeoff = true;
  const flightStartTime = useRef<Date | null>(null);
  const maxAltitudeRef = useRef<number>(0);
  const totalDistanceRef = useRef<number>(0);
  const lastPositionRef = useRef<{lat: number, lng: number} | null>(null);
  const gamepadArmLatchRef = useRef(false);
  const gamepadBusyRef = useRef(false);

  // Get current drone ID from localStorage
  const getCurrentDroneId = () => {
    const saved = localStorage.getItem('mouse_selected_drone');
    return saved ? JSON.parse(saved)?.id : 'default';
  };

  const dispatchCommand = useCallback(
    async (commandType: string, payload: Record<string, unknown> = {}) => {
      return dispatchBackendCommand({
        commandType,
        payload,
        requireConnection: !["gripper_open", "gripper_close", "terminal", "terminal_command"].includes(commandType),
      });
    },
    [],
  );

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

  useEffect(() => {
    const onArmState = (e: CustomEvent<{ armed?: boolean }>) => {
      if (typeof e.detail?.armed === "boolean") {
        setIsArmed(e.detail.armed);
      }
    };
    window.addEventListener("arm-state-changed" as any, onArmState);
    return () => window.removeEventListener("arm-state-changed" as any, onArmState);
  }, []);

  useEffect(() => {
    const loadInputConfig = () => {
      const raw = localStorage.getItem("mouse_input_settings");
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setInputConfig({
          gamepadDevice: String(parsed?.gamepadDevice || "none"),
          joystickDeadzone: String(parsed?.joystickDeadzone || "5"),
        });
      } catch {
        // ignore parse errors
      }
    };
    loadInputConfig();
    window.addEventListener("input-settings-changed" as any, loadInputConfig);
    return () => window.removeEventListener("input-settings-changed" as any, loadInputConfig);
  }, []);

  useEffect(() => {
    if (inputConfig.gamepadDevice === "none") return;
    const deadzone = Math.max(0, Math.min(0.25, Number(inputConfig.joystickDeadzone || "5") / 100));
    const applyDeadzone = (v: number) => (Math.abs(v) < deadzone ? 0 : v);
    const timer = window.setInterval(() => {
      const gamepads = navigator.getGamepads?.();
      const gp = gamepads?.find(Boolean);
      if (!gp) return;

      const armButtonPressed = Boolean(gp.buttons?.[0]?.pressed);
      if (armButtonPressed && !gamepadArmLatchRef.current && canArmDisarm && !gamepadBusyRef.current) {
        gamepadBusyRef.current = true;
        const newArmed = !isArmed;
        void dispatchCommand(newArmed ? "arm" : "disarm")
          .then(() => {
            setIsArmed(newArmed);
            localStorage.setItem("mouse_drone_armed", JSON.stringify(newArmed));
            window.dispatchEvent(new CustomEvent("arm-state-changed", { detail: { armed: newArmed, source: "gamepad" } }));
          })
          .catch((error) => {
            toast.error(error instanceof Error ? error.message : "Gamepad arm/disarm failed");
          })
          .finally(() => {
            gamepadBusyRef.current = false;
          });
      }
      gamepadArmLatchRef.current = armButtonPressed;

      if (!isArmed || !canFlightControl) return;

      const rollAxis = applyDeadzone(gp.axes?.[0] ?? 0);
      const pitchAxis = applyDeadzone(gp.axes?.[1] ?? 0);
      const yawAxis = applyDeadzone(gp.axes?.[2] ?? 0);
      const throttleAxis = applyDeadzone(gp.axes?.[3] ?? 0);
      if (!rollAxis && !pitchAxis && !yawAxis && !throttleAxis) return;

      const selectedDroneRaw = localStorage.getItem("mouse_selected_drone");
      let connectionString = "";
      if (selectedDroneRaw) {
        try {
          connectionString = String(JSON.parse(selectedDroneRaw)?.connectionString || "").trim();
        } catch {
          connectionString = "";
        }
      }
      if (!connectionString) return;
      void fetch("/api/mavlink/manual-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          x: Math.round(rollAxis * 400),
          y: Math.round(-pitchAxis * 400),
          z: Math.round(500 + (-throttleAxis * 250)),
          r: Math.round(yawAxis * 400),
          buttons: 0,
          durationMs: 200,
        }),
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [inputConfig, isArmed, canArmDisarm, canFlightControl, dispatchCommand]);

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
      void dispatchCommand("terminal", { command: widget.command })
        .then(() => {
          toast.success(`Executed: ${widget.name}`);
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : "Command execution failed");
        });
    }
  };

  // Filter widgets for current page
  const pageWidgets = customWidgets.filter(w => w.targetPage === activeTab);

  const handleReturnToBase = async () => {
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
    try {
      setIsReturning(true);
      await dispatchCommand("rtl");
      toast.success(`Returning to base: ${baseLocation.name} (${baseLocation.lat.toFixed(4)}, ${baseLocation.lng.toFixed(4)})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send RTL command");
    } finally {
      setIsReturning(false);
    }
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
          onClick={async () => {
            if (!canArmDisarm) {
              toast.error("You don't have permission to arm/disarm");
              return;
            }
            const newArmed = !isArmed;
            try {
              await dispatchCommand(newArmed ? "arm" : "disarm");
              setIsArmed(newArmed);
              localStorage.setItem('mouse_drone_armed', JSON.stringify(newArmed));
              window.dispatchEvent(new CustomEvent('arm-state-changed', { detail: { armed: newArmed } }));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Arm/disarm command failed");
            }
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 h-full">
          <Button 
            variant="secondary" 
            className={cn(
              "h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2",
              !canFlightControl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!isArmed || !canFlightControl || !supportsTakeoff}
            onClick={async () => {
              if (!canFlightControl) {
                toast.error("You don't have flight control permission");
                return;
              }
              if (!supportsTakeoff) {
                toast.error("Takeoff command is disabled until a safe backend takeoff path is configured");
                return;
              }
              try {
                await dispatchCommand("takeoff");
                toast.success("Initiating takeoff sequence...");
                await startFlightSession();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Takeoff failed");
              }
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
              try {
                await dispatchCommand("land");
                toast.success("Initiating landing sequence...");
                await endFlightSession();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Landing command failed");
              }
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
            onClick={async () => {
              if (!canFlightControl) {
                toast.error("You don't have flight control permission");
                return;
              }
              try {
                await dispatchCommand("abort");
                toast.error("EMERGENCY STOP ACTIVATED - Motors killed!", { duration: 5000 });
                setIsArmed(false);
                localStorage.setItem('mouse_drone_armed', JSON.stringify(false));
                window.dispatchEvent(new CustomEvent('arm-state-changed', { detail: { armed: false } }));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Abort command failed");
              }
            }}
            data-testid="button-abort"
          >
            <AlertOctagon className="h-5 w-5" />
            <span className="text-[10px] font-mono font-bold">ABORT</span>
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
              try {
                await dispatchCommand("rtl");
                toast.info("Backtrace requested (mapped to RTL)");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Backtrace command failed");
              }
            }}
            data-testid="button-backtrace"
          >
            <Route className="h-5 w-5" />
            <span className="text-[10px] font-mono">BACKTRACE</span>
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
            (!canFlightControl || gripperLoading) && "opacity-50 cursor-not-allowed",
            gripperOpen ? "border-amber-500 text-amber-500" : "border-primary text-primary"
          )}
          disabled={!canFlightControl || gripperLoading}
          onClick={async () => {
            if (!canFlightControl || gripperLoading) {
              if (!canFlightControl) toast.error("You don't have flight control permission");
              return;
            }
            
            setGripperLoading(true);
            const newState = !gripperOpen;
            const action = newState ? "gripper_open" : "gripper_close";
            
            try {
              await dispatchCommand(action);
              setGripperOpen(newState);
              toast.success(newState ? "Gripper opened" : "Gripper closed");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gripper control failed");
            } finally {
              setGripperLoading(false);
            }
          }}
          data-testid="button-gripper"
        > 
          <div className={cn(
            "absolute inset-0 opacity-10 transition-colors",
             gripperOpen ? "bg-amber-500" : "bg-primary"
          )} />
          <Hand className={cn("h-6 w-6 transition-transform", gripperLoading ? "animate-pulse" : "", gripperOpen ? "scale-x-[-1]" : "")} />
          <span className="font-bold tracking-wider text-[10px]">{gripperLoading ? "..." : (gripperOpen ? "RELEASE" : "GRAB")}</span>
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
