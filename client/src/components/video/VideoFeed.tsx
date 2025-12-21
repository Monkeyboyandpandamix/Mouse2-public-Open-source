import { useState } from "react";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2, Eye, EyeOff, Flame, ZoomIn, ZoomOut, RotateCcw, Move, Camera, Video, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import aerialImg from "@assets/generated_images/aerial_drone_view_of_a_suburban_street_with_overlaid_bounding_boxes.png";
import fpvImg from "@assets/generated_images/fpv_drone_view_forward_facing_with_horizon.png";

export function VideoFeed() {
  const [isMain, setIsMain] = useState(false);
  const [visible, setVisible] = useState(true);
  const [activeCam, setActiveCam] = useState<'gimbal' | 'thermal' | 'fpv'>('gimbal');
  const [thermalMode, setThermalMode] = useState(false);
  const [zoom, setZoom] = useState([1]);
  const [showControls, setShowControls] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const handleZoomIn = () => {
    setZoom([Math.min(zoom[0] + 0.5, 5)]);
  };

  const handleZoomOut = () => {
    setZoom([Math.max(zoom[0] - 0.5, 1)]);
  };

  const handleResetView = () => {
    setZoom([1]);
    setPanX(0);
    setPanY(0);
  };

  const handleSnapshot = () => {
    toast.success("Snapshot captured and saved");
  };

  const handleToggleRecording = () => {
    setIsRecording(!isRecording);
    toast.success(isRecording ? "Recording stopped" : "Recording started");
  };

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
    <div 
      className={cn(
        "absolute transition-all duration-300 z-[100] bg-black border-2 border-primary/50 shadow-2xl overflow-hidden group",
        isMain ? "inset-4 bottom-52 top-16 right-84" : "bottom-52 left-20 w-80 h-48 rounded-lg"
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-black/60 backdrop-blur flex items-center justify-between px-2 z-10">
        <div className="text-xs font-mono text-primary flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", isRecording ? "bg-red-500 animate-pulse" : "bg-red-500")} />
          {isRecording ? "REC" : "LIVE"}: {activeCam === 'gimbal' ? (thermalMode ? 'THERMAL' : 'GIMBAL') : activeCam === 'thermal' ? 'THERMAL' : 'FPV'}
          {zoom[0] > 1 && <span className="text-amber-500">{zoom[0].toFixed(1)}x</span>}
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
      <div className="relative w-full h-full bg-slate-900 overflow-hidden">
        <div
          style={{
            transform: `scale(${zoom[0]}) translate(${panX}px, ${panY}px)`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out',
          }}
        >
          <img 
            src={activeCam === 'fpv' ? fpvImg : aerialImg} 
            alt="Drone Feed" 
            className={cn(
              "w-full h-full object-cover",
              thermalMode ? "opacity-90 hue-rotate-[280deg] saturate-[200%]" : "opacity-90"
            )}
          />
        </div>
         
        {/* HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none p-4 opacity-70">
          <div className="w-full h-full border border-white/20 relative">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 border-2 border-primary rounded-full flex items-center justify-center">
              <div className="w-1 h-1 bg-primary rounded-full" />
            </div>
             
            {/* Artificial Horizon Lines */}
            <div className="absolute top-1/2 left-4 w-12 h-px bg-white/50" />
            <div className="absolute top-1/2 right-4 w-12 h-px bg-white/50" />
             
            {/* Object Detection Box */}
            {activeCam !== 'fpv' && !thermalMode && (
              <div className="absolute top-1/3 left-1/4 w-24 h-24 border-2 border-amber-500 rounded-sm">
                <div className="absolute -top-4 left-0 bg-amber-500 text-black text-[10px] px-1 font-bold">VEHICLE 98%</div>
              </div>
            )}
             
            {/* Thermal Heat Signature */}
            {thermalMode && (
              <div className="absolute top-1/4 right-1/4 w-16 h-20 border-2 border-amber-500 rounded-sm animate-pulse">
                <div className="absolute -top-4 left-0 bg-amber-500 text-black text-[10px] px-1 font-bold">HEAT: 36.5°C</div>
              </div>
            )}
          </div>
        </div>

        {/* Zoom Controls - Right Side */}
        <div className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 transition-opacity z-20",
          showControls || isMain ? "opacity-100" : "opacity-0"
        )}>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 bg-black/60 hover:bg-black/80 border border-white/20"
            onClick={handleZoomIn}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="h-24 flex items-center justify-center">
            <div className="h-full w-1 bg-white/20 rounded relative">
              <div 
                className="absolute bottom-0 w-full bg-primary rounded"
                style={{ height: `${((zoom[0] - 1) / 4) * 100}%` }}
              />
            </div>
          </div>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 bg-black/60 hover:bg-black/80 border border-white/20"
            onClick={handleZoomOut}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 bg-black/60 hover:bg-black/80 border border-white/20 mt-2"
            onClick={handleResetView}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Bottom Controls */}
        <div className={cn(
          "absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 transition-opacity z-20",
          showControls || isMain ? "opacity-100" : "opacity-0"
        )}>
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-7 bg-black/60 hover:bg-black/80 border border-white/20 text-xs"
            onClick={handleSnapshot}
          >
            <Camera className="h-3 w-3 mr-1" />
            Snapshot
          </Button>
          <Button 
            variant={isRecording ? "destructive" : "secondary"}
            size="sm" 
            className={cn("h-7 border border-white/20 text-xs", !isRecording && "bg-black/60 hover:bg-black/80")}
            onClick={handleToggleRecording}
          >
            <Video className="h-3 w-3 mr-1" />
            {isRecording ? "Stop" : "Record"}
          </Button>
        </div>

        {/* Zoom Level Indicator */}
        {zoom[0] > 1 && (
          <div className="absolute top-10 right-2 bg-black/60 px-2 py-1 rounded text-xs font-mono text-primary">
            {zoom[0].toFixed(1)}x ZOOM
          </div>
        )}
      </div>
    </div>
  );
}
