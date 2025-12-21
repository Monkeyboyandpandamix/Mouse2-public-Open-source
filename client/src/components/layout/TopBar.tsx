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
  ChevronDown
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
  
  // Listen for session changes
  useEffect(() => {
    const handleSessionChange = (e: CustomEvent<UserSession>) => {
      setSession(e.detail);
    };
    window.addEventListener('session-change' as any, handleSessionChange);
    return () => window.removeEventListener('session-change' as any, handleSessionChange);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('mouse_gcs_session');
    setSession({ user: null, isLoggedIn: false });
    window.dispatchEvent(new CustomEvent('session-change', { detail: { user: null, isLoggedIn: false } }));
    toast.info("Logged out successfully");
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
        <div className="flex items-center gap-2 shrink-0">
          <Gamepad2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse" />
          <h1 className="text-base sm:text-xl font-bold tracking-wider text-foreground font-sans whitespace-nowrap">
            <span className="hidden sm:inline">M.O.U.S.E.</span>
            <span className="sm:hidden">MOUSE</span>
            <span className="text-muted-foreground text-xs sm:text-sm font-normal hidden md:inline"> GCS v1.0</span>
          </h1>
        </div>
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
        
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-3 font-mono">
          MODE: STABILIZE
        </Badge>

        <Button 
          variant="destructive" 
          size="sm" 
          className="ml-2 gap-2 font-bold animate-pulse hover:animate-none"
          onClick={() => {
            if (confirm("EMERGENCY LANDING: This will find a safe clearing and land immediately. Continue?")) {
              toast.error("EMERGENCY LANDING INITIATED - Finding safe landing zone...", { duration: 5000 });
            }
          }}
          data-testid="button-emergency-land"
        >
          <ChevronDown className="h-4 w-4" />
          EMERGENCY LAND
        </Button>
      </div>

      <div className="flex items-center gap-6">
        {/* Telemetry Status Bar */}
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
          <div className="flex items-center gap-2" title="GPS Satellites">
            <Satellite className="h-4 w-4 text-primary" />
            <span className="text-foreground">{diagnostics.gpsCount} SAT</span>
          </div>
          <div className="flex items-center gap-2" title="RC Signal Strength">
            <Signal className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">{diagnostics.rcSignal}%</span>
          </div>
          <div className="flex items-center gap-2" title="Telemetry Link Quality">
            <Wifi className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">{diagnostics.telemetryLink}%</span>
          </div>
          <div className="flex items-center gap-2" title="Drone Battery">
            <Battery className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">{diagnostics.batteryVoltage}V ({diagnostics.batteryPercent}%)</span>
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

        <div className="font-mono text-lg text-foreground tabular-nums">
          {time.toLocaleTimeString([], { hour12: false })}
        </div>
        
        {session.isLoggedIn && (
          <div className="flex items-center gap-2 border-l border-border pl-4">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">{session.user?.username}</span>
              <Badge variant="outline" className="text-[10px] capitalize">{session.user?.role}</Badge>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleLogout}
              title="Log out"
              data-testid="button-logout-topbar"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Button 
          variant="ghost" 
          size="icon"
          onClick={onSettingsClick}
          data-testid="button-settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
