import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Wifi, 
  Battery, 
  Signal, 
  Satellite, 
  Gamepad2,
  AlertTriangle,
  Settings,
  MessageSquare,
  Mic,
  CheckCircle,
  XCircle,
  LogOut,
  User,
  Plane,
  ChevronDown,
  RefreshCw
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Drone } from "@shared/schema";

interface UserSession {
  user: { id: string; username: string; role: string } | null;
  isLoggedIn: boolean;
}

interface TopBarProps {
  onSettingsClick?: () => void;
}

interface SystemDiagnostics {
  gpsConnected: boolean;
  gpsCount: number;
  rcSignal: number;
  telemetryLink: number;
  batteryVoltage: number;
  batteryPercent: number;
  fcConnected: boolean;
  lidarConnected: boolean;
  cameraConnected: boolean;
}

export function TopBar({ onSettingsClick }: TopBarProps) {
  const [time, setTime] = useState(new Date());
  const [manualOverride, setManualOverride] = useState(false);
  const [manualReady, setManualReady] = useState(true);
  const [session, setSession] = useState<UserSession>(() => {
    const saved = localStorage.getItem('mouse_gcs_session');
    return saved ? JSON.parse(saved) : { user: null, isLoggedIn: false };
  });
  
  // Selected drone state
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(() => {
    const saved = localStorage.getItem('mouse_selected_drone');
    return saved ? JSON.parse(saved) : null;
  });
  
  // Listen for session changes
  useEffect(() => {
    const handleSessionChange = (e: CustomEvent<UserSession>) => {
      setSession(e.detail);
    };
    window.addEventListener('session-change' as any, handleSessionChange);
    return () => window.removeEventListener('session-change' as any, handleSessionChange);
  }, []);

  // Listen for drone selection changes
  useEffect(() => {
    const handleDroneChange = (e: CustomEvent<Drone>) => {
      setSelectedDrone(e.detail);
    };
    window.addEventListener('drone-selected' as any, handleDroneChange);
    return () => window.removeEventListener('drone-selected' as any, handleDroneChange);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('mouse_gcs_session');
    localStorage.removeItem('mouse_selected_drone');
    setSession({ user: null, isLoggedIn: false });
    setSelectedDrone(null);
    window.dispatchEvent(new CustomEvent('session-change', { detail: { user: null, isLoggedIn: false } }));
    toast.info("Logged out successfully");
  };

  const handleSwitchDrone = () => {
    window.dispatchEvent(new CustomEvent('show-drone-selection'));
    toast.info("Select a different drone");
  };
  
  // Simulated diagnostics - in real implementation, would come from WebSocket
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics>({
    gpsConnected: true,
    gpsCount: 12,
    rcSignal: 98,
    telemetryLink: 100,
    batteryVoltage: 24.2,
    batteryPercent: 85,
    fcConnected: true,
    lidarConnected: true,
    cameraConnected: true
  });

  // Calculate auto system status based on diagnostics
  const calculateSystemStatus = (): { ready: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    if (!diagnostics.fcConnected) issues.push("Flight controller disconnected");
    if (!diagnostics.gpsConnected || diagnostics.gpsCount < 6) issues.push("GPS signal weak");
    if (diagnostics.rcSignal < 50) issues.push("RC signal low");
    if (diagnostics.telemetryLink < 50) issues.push("Telemetry link weak");
    if (diagnostics.batteryPercent < 20) issues.push("Battery critical");
    if (!diagnostics.lidarConnected) issues.push("Lidar disconnected");
    
    return { ready: issues.length === 0, issues };
  };

  const systemStatus = calculateSystemStatus();
  const isReady = manualOverride ? manualReady : systemStatus.ready;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-2 sm:px-4 flex items-center justify-between shrink-0 z-50 relative">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleSwitchDrone}
              className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
              data-testid="button-switch-drone"
            >
              <Gamepad2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse" />
              <h1 className="text-base sm:text-xl font-bold tracking-wider text-foreground font-sans whitespace-nowrap">
                <span className="hidden sm:inline">M.O.U.S.E.</span>
                <span className="sm:hidden">MOUSE</span>
                <span className="text-muted-foreground text-xs sm:text-sm font-normal hidden md:inline"> GCS v1.0</span>
              </h1>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Click to switch drones</p>
          </TooltipContent>
        </Tooltip>
        
        {selectedDrone && (
          <>
            <div className="h-6 w-px bg-border mx-1" />
            <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-md">
              <Plane className="h-4 w-4 text-primary" />
              <div className="text-xs">
                <span className="font-bold">{selectedDrone.callsign}</span>
                <span className="text-muted-foreground ml-2 hidden sm:inline">{selectedDrone.name}</span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 ${
                  selectedDrone.status === 'flying' ? 'text-blue-500 border-blue-500' :
                  selectedDrone.status === 'online' ? 'text-emerald-500 border-emerald-500' :
                  selectedDrone.status === 'armed' ? 'text-amber-500 border-amber-500' :
                  'text-gray-500 border-gray-500'
                }`}
              >
                {selectedDrone.status?.toUpperCase() || 'OFFLINE'}
              </Badge>
            </div>
          </>
        )}
        <div className="h-6 w-px bg-border mx-1 sm:mx-2 hidden sm:block" />
        
        {/* System Ready Status with Popover for manual override */}
        <Popover>
          <PopoverTrigger asChild>
            <Badge 
              variant="outline" 
              className={`cursor-pointer px-3 font-mono ${
                isReady 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              }`}
              data-testid="badge-system-status"
            >
              {isReady ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  SYSTEM READY
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  CHECK SYSTEM
                </>
              )}
              {manualOverride && <span className="ml-1 text-[10px]">(M)</span>}
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold">System Diagnostics</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Manual</Label>
                  <Switch 
                    checked={manualOverride}
                    onCheckedChange={setManualOverride}
                  />
                </div>
              </div>
              
              {manualOverride && (
                <div className="p-2 bg-amber-500/10 rounded border border-amber-500/30 text-xs">
                  <div className="flex items-center justify-between">
                    <span>Force System Status:</span>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant={manualReady ? "default" : "outline"}
                        className="h-6 text-xs px-2"
                        onClick={() => setManualReady(true)}
                      >
                        Ready
                      </Button>
                      <Button 
                        size="sm" 
                        variant={!manualReady ? "destructive" : "outline"}
                        className="h-6 text-xs px-2"
                        onClick={() => setManualReady(false)}
                      >
                        Not Ready
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span>Flight Controller</span>
                  {diagnostics.fcConnected ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>GPS ({diagnostics.gpsCount} sats)</span>
                  {diagnostics.gpsConnected && diagnostics.gpsCount >= 6 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>RC Signal ({diagnostics.rcSignal}%)</span>
                  {diagnostics.rcSignal >= 50 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Telemetry ({diagnostics.telemetryLink}%)</span>
                  {diagnostics.telemetryLink >= 50 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Battery ({diagnostics.batteryPercent}%)</span>
                  {diagnostics.batteryPercent >= 20 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Lidar</span>
                  {diagnostics.lidarConnected ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
              </div>
              
              {!systemStatus.ready && !manualOverride && (
                <div className="p-2 bg-destructive/10 rounded text-xs text-destructive">
                  <p className="font-bold mb-1">Issues detected:</p>
                  <ul className="list-disc list-inside">
                    {systemStatus.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-2 font-mono text-[10px] sm:text-xs">
          <span className="hidden sm:inline">MODE:</span>STAB
        </Badge>

        <Button 
          variant="destructive" 
          size="sm" 
          className="ml-1 gap-1 font-bold animate-pulse hover:animate-none px-2 h-8 text-xs shrink-0"
          onClick={() => {
            if (confirm("EMERGENCY LANDING: This will find a safe clearing and land immediately. Continue?")) {
              toast.error("EMERGENCY LANDING INITIATED - Finding safe landing zone...", { duration: 5000 });
            }
          }}
          data-testid="button-emergency-land"
        >
          <ChevronDown className="h-3 w-3" />
          <span className="hidden md:inline">EMERGENCY</span>
          <span className="md:hidden">SOS</span>
        </Button>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 shrink-0">
        {/* Telemetry Status Bar - Always visible with compact display on small screens */}
        <div className="flex items-center gap-1 sm:gap-3 text-[10px] sm:text-xs font-mono text-muted-foreground flex-wrap justify-end">
          <div className="flex items-center gap-1" title="GPS Satellites">
            <Satellite className="h-3 w-3 text-primary" />
            <span className="text-foreground">{diagnostics.gpsCount}</span>
          </div>
          <div className="flex items-center gap-1" title="RC Signal Strength">
            <Signal className="h-3 w-3 text-emerald-500" />
            <span className="text-foreground">{diagnostics.rcSignal}</span>
          </div>
          <div className="flex items-center gap-1" title="Telemetry Link Quality">
            <Wifi className="h-3 w-3 text-emerald-500" />
            <span className="text-foreground">{diagnostics.telemetryLink}</span>
          </div>
          <div className="flex items-center gap-1" title="Drone Battery">
            <Battery className="h-3 w-3 text-emerald-500" />
            <span className="text-foreground">{diagnostics.batteryPercent}%</span>
          </div>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Comms Panel */}
        <Popover>
          <PopoverTrigger asChild>
             <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden md:inline text-xs font-mono uppercase">Comms</span>
                <Badge className="h-4 w-4 p-0 flex items-center justify-center bg-primary text-[10px]">1</Badge>
             </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0 mr-4 bg-card/95 backdrop-blur border-border" align="end">
             <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="font-mono font-bold text-sm">EMERGENCY COMMS CHANNEL</span>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             </div>
             <ScrollArea className="h-64 p-4 space-y-4">
                <div className="flex flex-col gap-1">
                   <span className="text-[10px] text-muted-foreground">10:42:01 - DISPATCH</span>
                   <div className="bg-muted/50 p-2 rounded text-xs">
                      Priority package drop requested at Waypoint 2. Confirm availability.
                   </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                   <span className="text-[10px] text-muted-foreground">10:42:15 - PILOT</span>
                   <div className="bg-primary/20 text-primary p-2 rounded text-xs text-right">
                      Copy dispatch. En route to WP2. ETA 2 mins.
                   </div>
                </div>
             </ScrollArea>
             <div className="p-2 border-t border-border flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 text-xs"><Mic className="h-3 w-3 mr-2" /> PTT</Button>
                <Button size="sm" className="flex-1 text-xs">SEND</Button>
             </div>
          </PopoverContent>
        </Popover>

        <div className="font-mono text-xs sm:text-lg text-foreground tabular-nums">
          {time.toLocaleTimeString([], { hour12: false })}
        </div>
        
        {session.isLoggedIn && (
          <div className="flex items-center gap-1 sm:gap-2 border-l border-border pl-2 sm:pl-4">
            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm">
              <User className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              <span className="font-medium">{session.user?.username}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-7 w-7 sm:h-9 sm:w-9"
              onClick={handleLogout}
              title="Log out"
              data-testid="button-logout-topbar"
            >
              <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        )}

        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9"
          onClick={onSettingsClick}
          data-testid="button-settings"
        >
          <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </header>
  );
}
