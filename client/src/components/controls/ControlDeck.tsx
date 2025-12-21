import { Button } from "@/components/ui/button";
import { Hand, ArrowUpCircle, ArrowDownCircle, Power, AlertOctagon, Navigation } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BaseLocation {
  lat: number;
  lng: number;
  name: string;
}

export function ControlDeck() {
  const [isArmed, setIsArmed] = useState(false);
  const [gripperOpen, setGripperOpen] = useState(false);
  const [baseLocation, setBaseLocation] = useState<BaseLocation | null>(null);
  const [isReturning, setIsReturning] = useState(false);

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

  const handleReturnToBase = () => {
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
    setTimeout(() => setIsReturning(false), 3000);
  };

  return (
    <div className="h-48 border-t border-border bg-card/80 backdrop-blur-md p-4 flex gap-6 shrink-0 z-50">
      
      {/* Arming Panel */}
      <div className="flex flex-col gap-2 w-48">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Master Switch</span>
        <Button 
          variant="outline" 
          className={cn(
            "h-full flex flex-col gap-2 border-2",
            isArmed 
              ? "bg-destructive/10 border-destructive text-destructive hover:bg-destructive/20 hover:text-destructive" 
              : "bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-500"
          )}
          onClick={() => setIsArmed(!isArmed)}
        >
          <Power className="h-8 w-8" />
          <span className="font-bold tracking-wider">{isArmed ? "DISARM SYSTEM" : "ARM SYSTEM"}</span>
        </Button>
      </div>

      {/* Flight Modes */}
      <div className="flex flex-col gap-2 flex-1">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Flight Controls</span>
        <div className="grid grid-cols-5 gap-2 h-full">
          <Button 
            variant="secondary" 
            className="h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors"
            disabled={!isArmed}
          >
            <ArrowUpCircle className="h-6 w-6" />
            <span className="text-xs font-mono">TAKEOFF</span>
          </Button>
          
          <Button 
            variant="secondary" 
            className={cn(
              "h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors",
              isReturning && "bg-amber-500/20 border-amber-500 text-amber-500"
            )}
            disabled={!isArmed || !baseLocation}
            onClick={handleReturnToBase}
            title={baseLocation ? `Return to: ${baseLocation.name}` : "Configure base in Settings"}
          >
            <Navigation className={cn("h-6 w-6", isReturning && "animate-pulse")} />
            <span className="text-xs font-mono">RTL</span>
            {baseLocation && (
              <span className="text-[8px] text-muted-foreground truncate max-w-full">{baseLocation.name}</span>
            )}
          </Button>
          
          <Button 
            variant="secondary" 
            className="h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors"
            disabled={!isArmed}
          >
             <ArrowDownCircle className="h-6 w-6" />
            <span className="text-xs font-mono">LAND</span>
          </Button>

          <Button 
            variant="destructive" 
            className="h-full flex flex-col gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse"
          >
             <AlertOctagon className="h-6 w-6" />
            <span className="text-xs font-mono font-bold">ABORT</span>
          </Button>
        </div>
      </div>

      {/* Payload Control */}
      <div className="flex flex-col gap-2 w-48">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Payload (Gripper)</span>
        <Button 
          variant="outline"
          className={cn(
            "h-full flex flex-col gap-2 relative overflow-hidden",
            gripperOpen ? "border-amber-500 text-amber-500" : "border-primary text-primary"
          )}
          onClick={() => setGripperOpen(!gripperOpen)}
        > 
          <div className={cn(
            "absolute inset-0 opacity-10 transition-colors",
             gripperOpen ? "bg-amber-500" : "bg-primary"
          )} />
          <Hand className={cn("h-8 w-8 transition-transform", gripperOpen ? "scale-x-[-1]" : "")} />
          <span className="font-bold tracking-wider text-xs">{gripperOpen ? "RELEASE / OPEN" : "GRAB / CLOSE"}</span>
        </Button>
      </div>

    </div>
  );
}
