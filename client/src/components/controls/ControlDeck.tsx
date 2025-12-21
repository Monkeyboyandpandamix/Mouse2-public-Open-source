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
    <div className="h-auto min-h-[120px] sm:min-h-[140px] lg:h-40 border-t border-border bg-card/80 backdrop-blur-md p-2 sm:p-4 flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 shrink-0 z-50 overflow-x-auto">
      
      {/* Arming Panel */}
      <div className="flex flex-col gap-1 sm:gap-2 w-24 sm:w-36 shrink-0">
        <span className="text-[8px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Master</span>
        <Button 
          variant="outline" 
          className={cn(
            "h-full flex flex-col gap-1 border-2",
            isArmed 
              ? "bg-destructive/10 border-destructive text-destructive hover:bg-destructive/20 hover:text-destructive" 
              : "bg-emerald-500/10 border-emerald-500 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-500"
          )}
          onClick={() => setIsArmed(!isArmed)}
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
            className="h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2"
            disabled={!isArmed}
            data-testid="button-takeoff"
          >
            <ArrowUpCircle className="h-5 w-5" />
            <span className="text-[10px] font-mono">TAKEOFF</span>
          </Button>
          
          <Button 
            variant="secondary" 
            className={cn(
              "h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2",
              isReturning && "bg-amber-500/20 border-amber-500 text-amber-500"
            )}
            disabled={!isArmed || !baseLocation}
            onClick={handleReturnToBase}
            title={baseLocation ? `Return to: ${baseLocation.name}` : "Configure base in Settings"}
            data-testid="button-rtl"
          >
            <Navigation className={cn("h-5 w-5", isReturning && "animate-pulse")} />
            <span className="text-[10px] font-mono">RTL</span>
          </Button>
          
          <Button 
            variant="secondary" 
            className="h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors p-2"
            disabled={!isArmed}
            data-testid="button-land"
          >
            <ArrowDownCircle className="h-5 w-5" />
            <span className="text-[10px] font-mono">LAND</span>
          </Button>

          <Button 
            variant="destructive" 
            className="h-full flex flex-col gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse p-2"
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
            gripperOpen ? "border-amber-500 text-amber-500" : "border-primary text-primary"
          )}
          onClick={() => setGripperOpen(!gripperOpen)}
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

    </div>
  );
}
