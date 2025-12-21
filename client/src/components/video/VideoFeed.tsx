import { useState } from "react";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2, Eye, EyeOff, Flame } from "lucide-react";
import aerialImg from "@assets/generated_images/aerial_drone_view_of_a_suburban_street_with_overlaid_bounding_boxes.png";
import fpvImg from "@assets/generated_images/fpv_drone_view_forward_facing_with_horizon.png";

export function VideoFeed() {
  const [isMain, setIsMain] = useState(false);
  const [visible, setVisible] = useState(true);
  const [activeCam, setActiveCam] = useState<'gimbal' | 'thermal' | 'fpv'>('gimbal');
  const [thermalMode, setThermalMode] = useState(false);

  if (!visible) {
    return (
      <button 
        onClick={() => setVisible(true)}
        className="absolute bottom-52 left-20 z-[100] bg-primary text-primary-foreground p-2 rounded shadow-lg hover:bg-primary/90"
      >
        <Eye className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className={cn(
      "absolute transition-all duration-300 z-[100] bg-black border-2 border-primary/50 shadow-2xl overflow-hidden group",
      isMain ? "inset-4 bottom-52 top-16 right-84" : "bottom-52 left-20 w-80 h-48 rounded-lg"
    )}>
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-black/60 backdrop-blur flex items-center justify-between px-2 z-10">
        <div className="text-xs font-mono text-primary flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          LIVE: {activeCam === 'gimbal' ? (thermalMode ? 'THERMAL CAM' : 'GIMBAL CAM') : activeCam === 'thermal' ? 'THERMAL CAM' : 'FPV CAM'}
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => {
              if (activeCam === 'gimbal') setActiveCam('thermal');
              else if (activeCam === 'thermal') setActiveCam('fpv');
              else setActiveCam('gimbal');
            }} 
            className="p-1 hover:text-white text-muted-foreground text-[10px] uppercase border border-white/20 rounded px-2"
          >
            CAM
          </button>
          <button 
            onClick={() => setThermalMode(!thermalMode)} 
            className={cn("p-1 hover:text-white text-muted-foreground", thermalMode && "text-amber-500")}
            title="Toggle Thermal"
          >
            <Flame className="h-3 w-3" />
          </button>
          <button onClick={() => setIsMain(!isMain)} className="p-1 hover:text-white text-muted-foreground">
            {isMain ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button onClick={() => setVisible(false)} className="p-1 hover:text-white text-muted-foreground">
            <EyeOff className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative w-full h-full bg-slate-900">
         <img 
            src={activeCam === 'fpv' ? fpvImg : aerialImg} 
            alt="Drone Feed" 
            className={cn(
              "w-full h-full object-cover",
              thermalMode ? "opacity-90 hue-rotate-[280deg] saturate-[200%]" : "opacity-90"
            )}
          />
         
         {/* HUD Overlay */}
         <div className="absolute inset-0 pointer-events-none p-4 opacity-70">
            <div className="w-full h-full border border-white/20 relative">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 border-2 border-primary rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-primary rounded-full" />
               </div>
               
               {/* Artificial Horizon Lines (Mockup) */}
               <div className="absolute top-1/2 left-4 w-12 h-px bg-white/50" />
               <div className="absolute top-1/2 right-4 w-12 h-px bg-white/50" />
               
               {/* Object Detection Box Mockup */}
               {activeCam !== 'fpv' && !thermalMode && (
                 <div className="absolute top-1/3 left-1/4 w-24 h-24 border-2 border-amber-500 rounded-sm">
                    <div className="absolute -top-4 left-0 bg-amber-500 text-black text-[10px] px-1 font-bold">VEHICLE 98%</div>
                 </div>
               )}
               
               {/* Thermal Heat Signature Overlay */}
               {thermalMode && (
                 <div className="absolute top-1/4 right-1/4 w-16 h-20 border-2 border-amber-500 rounded-sm animate-pulse">
                    <div className="absolute -top-4 left-0 bg-amber-500 text-black text-[10px] px-1 font-bold">HEAT: 36.5°C</div>
                 </div>
               )}
            </div>
         </div>
      </div>

    </div>
  );
}
