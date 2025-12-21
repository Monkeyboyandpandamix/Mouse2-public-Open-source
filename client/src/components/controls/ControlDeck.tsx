import { Button } from "@/components/ui/button";
import { Hand, ArrowUpCircle, ArrowDownCircle, Home, Power, AlertOctagon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ControlDeck() {
  const [isArmed, setIsArmed] = useState(false);
  const [gripperOpen, setGripperOpen] = useState(false);

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
        <div className="grid grid-cols-4 gap-2 h-full">
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
            className="h-full flex flex-col gap-1 hover:bg-primary/20 hover:text-primary transition-colors"
            disabled={!isArmed}
          >
             <Home className="h-6 w-6" />
            <span className="text-xs font-mono">RTL</span>
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
