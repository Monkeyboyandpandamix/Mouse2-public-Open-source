import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Wifi, 
  Battery, 
  Signal, 
  Satellite, 
  Gamepad2,
  AlertTriangle,
  Menu,
  Settings,
  MessageSquare,
  Mic
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TopBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-50 relative">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-6 w-6 text-primary animate-pulse" />
          <h1 className="text-xl font-bold tracking-wider text-foreground font-sans">
            M.O.U.S.E. <span className="text-muted-foreground text-sm font-normal">GCS v1.0</span>
          </h1>
        </div>
        <div className="h-6 w-px bg-border mx-2" />
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 font-mono">
          SYSTEM READY
        </Badge>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-3 font-mono">
          MODE: STABILIZE
        </Badge>
      </div>

      <div className="flex items-center gap-6">
        {/* Telemetry Status Bar */}
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
          <div className="flex items-center gap-2" title="GPS Satellites">
            <Satellite className="h-4 w-4 text-primary" />
            <span className="text-foreground">12 SAT</span>
          </div>
          <div className="flex items-center gap-2" title="RC Signal Strength">
            <Signal className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">98%</span>
          </div>
          <div className="flex items-center gap-2" title="Telemetry Link Quality">
            <Wifi className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">100%</span>
          </div>
          <div className="flex items-center gap-2" title="Drone Battery">
            <Battery className="h-4 w-4 text-emerald-500" />
            <span className="text-foreground">24.2V (85%)</span>
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
        
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
