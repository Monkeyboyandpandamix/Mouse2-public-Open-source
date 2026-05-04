import { Button } from "@/components/ui/button";
import { Hand, ArrowUpCircle, ArrowDownCircle, Power, AlertOctagon, Navigation, Zap, Lock, Circle, Route } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useTelemetry } from "@/contexts/TelemetryContext";
import { useAppState } from "@/contexts/AppStateContext";
import { flightSessionsApi, commandsApi } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { dispatchBackendCommand } from "@/lib/commandService";
import {
  DEFAULT_GAMEPAD_MAPPING,
  GAMEPAD_MAPPING_STORAGE_KEY,
  normalizeMapping,
  type GamepadMapping,
} from "@shared/gamepadMapping";

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
  const { selectedDrone } = useAppState();
  
  const canArmDisarm = hasPermission('arm_disarm');
  const canFlightControl = hasPermission('flight_control');
  const hasAnyControlPermission = canArmDisarm || canFlightControl;
  
  const [isArmed, setIsArmed] = useState(false);
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
  // Per-action cooldown (ms epoch when next press is allowed). A global busy
  // gate would cause a critical button (e.g. emergency stop) to be silently
  // dropped if it was pressed during another action's cooldown — which is
  // unsafe. Each action has its own cooldown, and emergency_stop bypasses
  // all cooldowns.
  const actionCooldownRef = useRef<Record<string, number>>({});
  const buttonLatchRef = useRef<Record<string, boolean>>({});
  const [gamepadName, setGamepadName] = useState<string | null>(null);
  const [gamepadActive, setGamepadActive] = useState(false);
  const gamepadActiveTimerRef = useRef<number | null>(null);
  const lastManualControlErrorRef = useRef(0);
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(DEFAULT_GAMEPAD_MAPPING);
  const [leaseHeldBy, setLeaseHeldBy] = useState<string | null>(null);
  const [hasLease, setHasLease] = useState<boolean>(true);

  const getCurrentDroneId = () => selectedDrone?.id || 'default';

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
      const data = await flightSessionsApi.start(droneId);
      if (data.success && data.session) {
        setActiveSessionId(data.session.id);
        setIsRecording(true);
        flightStartTime.current = new Date();
        maxAltitudeRef.current = 0;
        totalDistanceRef.current = 0;
        lastPositionRef.current = null;
        toast.success("Flight recording started");
        queryClient.invalidateQueries({ queryKey: ['/api/flight-sessions'] });
        console.log(`[FLIGHT] Session started: ${data.session.id}`);
      }
    } catch (error) {
      console.error("Failed to start flight session:", error);
      toast.error("Failed to start flight recording");
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
      
      const data = await flightSessionsApi.end({
        sessionId: activeSessionId,
        droneId,
        maxAltitude: maxAltitudeRef.current,
        totalDistance: totalDistanceRef.current,
        totalFlightTime,
      });
      if (data.success) {
        setActiveSessionId(null);
        setIsRecording(false);
        flightStartTime.current = null;
        toast.success(`Flight recording saved (${Math.round(totalFlightTime / 60)}m ${totalFlightTime % 60}s)`);
        queryClient.invalidateQueries({ queryKey: ['/api/flight-sessions'] });
        console.log(`[FLIGHT] Session ended`);
      }
    } catch (error) {
      console.error("Failed to end flight session:", error);
      toast.error("Failed to save flight recording");
    }
  };

  // Track telemetry for session stats (uses shared TelemetryProvider)
  const telemetry = useTelemetry();
  useEffect(() => {
    if (typeof telemetry?.armed === "boolean") {
      setIsArmed(telemetry.armed);
    }
  }, [telemetry?.armed]);

  useEffect(() => {
    if (!isRecording || !telemetry) return;
    const altitude = (telemetry as any).altitude;
    const latitude = (telemetry as any).position?.lat ?? (telemetry as any).latitude;
    const longitude = (telemetry as any).position?.lng ?? (telemetry as any).longitude;
    if (altitude && altitude > maxAltitudeRef.current) {
      maxAltitudeRef.current = altitude;
    }
    if (latitude != null && longitude != null && lastPositionRef.current) {
      const dist = calculateDistance(
        lastPositionRef.current.lat, lastPositionRef.current.lng,
        latitude, longitude
      );
      totalDistanceRef.current += dist;
    }
    if (latitude != null && longitude != null) {
      lastPositionRef.current = { lat: latitude, lng: longitude };
    }
  }, [telemetry, isRecording]);

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

  // Warn on page close when flight session is active
  useEffect(() => {
    if (!activeSessionId) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeSessionId]);

  // Check for active session on mount
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const droneId = getCurrentDroneId();
        const data = await flightSessionsApi.getActive(droneId);
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

  // Poll command lease status when a drone with connection is selected
  useEffect(() => {
    const connectionString = String(selectedDrone?.connectionString || "").trim();
    if (!connectionString || !isLoggedIn) {
      setLeaseHeldBy(null);
      setHasLease(true);
      return;
    }
    const poll = () => {
      commandsApi.getLease(connectionString).then((res) => {
        setHasLease(res.hasLease);
        setLeaseHeldBy(res.lease && !res.hasLease ? res.lease.heldBy : null);
      }).catch(() => {
        setLeaseHeldBy(null);
        setHasLease(true);
      });
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [selectedDrone?.connectionString, selectedDrone?.id, isLoggedIn]);

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

  // Track gamepad connect/disconnect so the UI can show a status badge.
  useEffect(() => {
    const refresh = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const first = Array.from(pads).find(Boolean) as Gamepad | undefined;
      setGamepadName(first ? first.id : null);
    };
    const onConnect = (e: GamepadEvent) => setGamepadName(e.gamepad.id);
    const onDisconnect = () => refresh();
    refresh();
    window.addEventListener("gamepadconnected", onConnect as any);
    window.addEventListener("gamepaddisconnected", onDisconnect as any);
    return () => {
      window.removeEventListener("gamepadconnected", onConnect as any);
      window.removeEventListener("gamepaddisconnected", onDisconnect as any);
    };
  }, []);

  // Load custom gamepad mapping from localStorage (synced via centralConfig
  // bridge). Critical actions always have a default fallback.
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(GAMEPAD_MAPPING_STORAGE_KEY);
        setGamepadMapping(normalizeMapping(raw ? JSON.parse(raw) : null));
      } catch {
        setGamepadMapping(DEFAULT_GAMEPAD_MAPPING);
      }
    };
    load();
    window.addEventListener("gamepad-mapping-changed" as any, load);
    return () => window.removeEventListener("gamepad-mapping-changed" as any, load);
  }, []);

  useEffect(() => {
    if (inputConfig.gamepadDevice === "none") return;
    const deadzone = Math.max(0, Math.min(0.25, Number(inputConfig.joystickDeadzone || "5") / 100));
    const applyDeadzone = (v: number) => (Math.abs(v) < deadzone ? 0 : v);
    const markActive = () => {
      setGamepadActive(true);
      if (gamepadActiveTimerRef.current) window.clearTimeout(gamepadActiveTimerRef.current);
      gamepadActiveTimerRef.current = window.setTimeout(() => setGamepadActive(false), 600);
    };

    const isPressed = (gp: Gamepad, actionId: keyof GamepadMapping): boolean => {
      const b = gamepadMapping[actionId];
      if (!b || b.kind !== "button") return false;
      return Boolean(gp.buttons?.[b.index]?.pressed);
    };
    const readAxis = (gp: Gamepad, actionId: keyof GamepadMapping): number => {
      const b = gamepadMapping[actionId];
      if (!b || b.kind !== "axis") return 0;
      const raw = applyDeadzone(gp.axes?.[b.index] ?? 0);
      // Clamp to [-1, 1] so the downstream MANUAL_CONTROL math never sends
      // out-of-spec values even if the operator dialled a high scale.
      const scaled = raw * (b.scale ?? 1);
      return Math.max(-1, Math.min(1, scaled));
    };

    const fireEdge = (
      actionId: string,
      pressed: boolean,
      handler: () => void,
      opts: { bypassCooldown?: boolean; cooldownMs?: number } = {},
    ) => {
      const wasPressed = buttonLatchRef.current[actionId] === true;
      // Always update the latch so press/release cycles stay in sync, even
      // when a press is rejected by the cooldown. Otherwise the operator
      // would have to release+repress before the action could fire again.
      const cooldownMs = opts.cooldownMs ?? 250;
      const now = Date.now();
      const cooldownUntil = actionCooldownRef.current[actionId] || 0;
      const inCooldown = !opts.bypassCooldown && now < cooldownUntil;
      if (pressed && !wasPressed && !inCooldown) {
        actionCooldownRef.current[actionId] = now + cooldownMs;
        try {
          handler();
        } catch (err) {
          console.warn(`[ControlDeck] gamepad action ${actionId} threw:`, err);
        }
      }
      buttonLatchRef.current[actionId] = pressed;
    };

    const timer = window.setInterval(() => {
      const gamepads = navigator.getGamepads?.();
      const gp = gamepads?.find(Boolean);
      if (!gp) return;

      // Surface live axis/button activity for the UI badge.
      const anyAxis = (gp.axes || []).some((v) => Math.abs(v) > deadzone);
      const anyBtn = (gp.buttons || []).some((b) => b?.pressed);
      if (anyAxis || anyBtn) markActive();

      // --- Critical / safety actions (never blocked by isArmed) ---
      // Emergency stop bypasses ALL cooldowns. It must always be deliverable.
      fireEdge(
        "emergency_stop",
        isPressed(gp, "emergency_stop"),
        () => {
          void dispatchCommand("disarm")
            .then(() => toast.warning("EMERGENCY STOP — disarm sent"))
            .catch((e) => toast.error(e instanceof Error ? e.message : "Emergency stop failed"));
        },
        { bypassCooldown: true, cooldownMs: 0 },
      );
      fireEdge("arm_toggle", isPressed(gp, "arm_toggle") && canArmDisarm, () => {
        const newArmed = !isArmed;
        void dispatchCommand(newArmed ? "arm" : "disarm")
          .then(() => toast.info(`Gamepad: ${newArmed ? "arm" : "disarm"} acknowledged`))
          .catch((e) => toast.error(e instanceof Error ? e.message : "Gamepad arm/disarm failed"));
      });
      fireEdge("return_to_home", isPressed(gp, "return_to_home") && canFlightControl, () => {
        void dispatchCommand("rtl")
          .then(() => toast.success("Gamepad: RTL sent"))
          .catch((e) => toast.error(e instanceof Error ? e.message : "RTL failed"));
      });

      // --- Flight modes & commands (require flight control permission) ---
      if (canFlightControl) {
        fireEdge("takeoff", isPressed(gp, "takeoff"), () => {
          void dispatchCommand("takeoff").catch((e) => toast.error(e instanceof Error ? e.message : "Takeoff failed"));
        });
        fireEdge("land", isPressed(gp, "land"), () => {
          void dispatchCommand("land").catch((e) => toast.error(e instanceof Error ? e.message : "Land failed"));
        });
        fireEdge("loiter_mode", isPressed(gp, "loiter_mode"), () => {
          void dispatchCommand("set_mode", { mode: "LOITER" }).catch(() => {});
        });
        fireEdge("stabilize_mode", isPressed(gp, "stabilize_mode"), () => {
          void dispatchCommand("set_mode", { mode: "STABILIZE" }).catch(() => {});
        });
        fireEdge("altitude_hold_mode", isPressed(gp, "altitude_hold_mode"), () => {
          void dispatchCommand("set_mode", { mode: "ALT_HOLD" }).catch(() => {});
        });
      }

      // --- Payload / camera ---
      fireEdge("gripper_toggle", isPressed(gp, "gripper_toggle"), () => {
        void dispatchCommand(gripperOpen ? "gripper_close" : "gripper_open").catch(() => {});
      });
      fireEdge("camera_snapshot", isPressed(gp, "camera_snapshot"), () => {
        void dispatchCommand("camera_snapshot").catch(() => {});
      });
      fireEdge("record_toggle", isPressed(gp, "record_toggle"), () => {
        void dispatchCommand("record_toggle").catch(() => {});
      });
      fireEdge("gimbal_recenter", isPressed(gp, "gimbal_recenter"), () => {
        void dispatchCommand("gimbal_recenter").catch(() => {});
      });

      if (!isArmed || !canFlightControl) return;

      // --- Continuous axes → MAVLink MANUAL_CONTROL ---
      const rollAxis = readAxis(gp, "axis_roll");
      const pitchAxis = readAxis(gp, "axis_pitch");
      const yawAxis = readAxis(gp, "axis_yaw");
      const throttleAxis = readAxis(gp, "axis_throttle");
      if (!rollAxis && !pitchAxis && !yawAxis && !throttleAxis) return;

      const connectionString = String(selectedDrone?.connectionString || "").trim();
      if (!connectionString) return;
      fetch("/api/mavlink/manual-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          x: Math.round(rollAxis * 400),
          y: Math.round(pitchAxis * 400),
          z: Math.round(500 + throttleAxis * 250),
          r: Math.round(yawAxis * 400),
          buttons: 0,
          durationMs: 200,
        }),
      }).catch(() => {
        const now = Date.now();
        if (now - lastManualControlErrorRef.current < 10000) return;
        lastManualControlErrorRef.current = now;
        toast.error("Manual control connection failed");
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [inputConfig, isArmed, canArmDisarm, canFlightControl, dispatchCommand, gamepadMapping, gripperOpen, selectedDrone]);

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
    if (widget.type === "display") return;
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
  const displayWidgets = pageWidgets.filter(w => w.type === "display");
  const actionWidgets = pageWidgets.filter(w => w.type !== "display");

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

  const leaseBlocked = Boolean(leaseHeldBy);

  return (
    <div className="h-auto min-h-[120px] sm:min-h-[140px] lg:h-40 border-t border-border bg-card/80 backdrop-blur-md p-2 sm:p-4 flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 shrink-0 z-50 overflow-x-auto">
      
      {/* Lease status — another user controls this drone */}
      {leaseBlocked && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-md shrink-0 w-full sm:w-auto">
          <Lock className="h-4 w-4 text-amber-600" />
          <span className="text-[10px] sm:text-xs font-medium text-amber-700 dark:text-amber-400">
            Controlled by {leaseHeldBy}
          </span>
        </div>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="flex items-center gap-1 px-2 py-1 bg-destructive/20 border border-destructive/50 rounded-md shrink-0">
          <Circle className="h-3 w-3 fill-destructive text-destructive animate-pulse" />
          <span className="text-[10px] font-mono text-destructive font-semibold">REC</span>
        </div>
      )}

      {/* Gamepad / Joystick Status */}
      {gamepadName && (
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0 border",
            gamepadActive
              ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-700 dark:text-emerald-400"
              : "bg-muted border-border text-muted-foreground"
          )}
          title={`${gamepadName}${inputConfig.gamepadDevice === "none" ? " — disabled in Settings" : ""}`}
          data-testid="badge-gamepad-status"
        >
          <Circle className={cn("h-2 w-2", gamepadActive ? "fill-emerald-500 text-emerald-500" : "fill-current")} />
          <span className="text-[10px] font-mono uppercase tracking-wider">
            {inputConfig.gamepadDevice === "none" ? "Pad: idle" : gamepadActive ? "Pad: live" : "Pad: ready"}
          </span>
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
          disabled={!canArmDisarm || leaseBlocked}
          onClick={async () => {
            if (!canArmDisarm) {
              toast.error("You don't have permission to arm/disarm");
              return;
            }
            const newArmed = !isArmed;
            try {
              await dispatchCommand(newArmed ? "arm" : "disarm");
              toast.info(`Command acknowledged. Waiting for telemetry to confirm ${newArmed ? "armed" : "disarmed"} state.`);
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
            disabled={!isArmed || !canFlightControl || !supportsTakeoff || leaseBlocked}
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
            disabled={!isArmed || !baseLocation || !canFlightControl || leaseBlocked}
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
                await dispatchCommand("backtrace");
                toast.info("Backtrace acknowledged");
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
            {displayWidgets.map(widget => (
              <div
                key={widget.id}
                className="h-full flex flex-col gap-1 px-3 py-2 rounded-md border-2 border-muted bg-muted/30 min-w-[80px] justify-center"
                data-testid={`widget-display-${widget.id}`}
              >
                <span className="text-[10px] font-mono truncate max-w-[60px] text-muted-foreground">{widget.name}</span>
                <span className="text-xs font-semibold truncate">{widget.displayValue ?? "—"}</span>
              </div>
            ))}
            {actionWidgets.map(widget => (
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
