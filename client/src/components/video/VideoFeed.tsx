import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2, Eye, EyeOff, Flame, ZoomIn, ZoomOut, RotateCcw, Move, Camera, Video, Download, Laptop, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import aerialImg from "@assets/generated_images/aerial_drone_view_of_a_suburban_street_with_overlaid_bounding_boxes.png";
import fpvImg from "@assets/generated_images/fpv_drone_view_forward_facing_with_horizon.png";

interface DetectedObject {
  id: string;
  type: "person" | "vehicle" | "unknown";
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export function VideoFeed() {
  const [isMain, setIsMain] = useState(false);
  const [visible, setVisible] = useState(true);
  const [activeCam, setActiveCam] = useState<'gimbal' | 'thermal' | 'fpv' | 'webcam'>('gimbal');
  const [thermalMode, setThermalMode] = useState(false);
  const [zoom, setZoom] = useState([1]);
  const [showControls, setShowControls] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackedObjectsRef = useRef<Map<string, {x: number, y: number, lastSeen: number}>>(new Map());
  const objectIdCounterRef = useRef(0);

  useEffect(() => {
    if (activeCam === 'webcam') {
      startWebcam();
    } else {
      stopWebcam();
      setIsDetecting(false);
      setDetectedObjects([]);
    }
    return () => stopWebcam();
  }, [activeCam]);

  useEffect(() => {
    if (videoRef.current && webcamStream) {
      videoRef.current.srcObject = webcamStream;
      
      const updateDimensions = () => {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          setVideoDimensions({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight
          });
        }
      };
      
      videoRef.current.onloadedmetadata = updateDimensions;
      videoRef.current.onresize = updateDimensions;
    }
  }, [webcamStream]);

  // Motion detection for webcam
  useEffect(() => {
    if (isDetecting && webcamStream && activeCam === 'webcam') {
      detectionIntervalRef.current = setInterval(() => {
        detectMotion();
      }, 200);
      
      return () => {
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
      };
    }
  }, [isDetecting, webcamStream, activeCam]);

  const detectMotion = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (prevFrameRef.current) {
      const motionRegions = findMotionRegions(prevFrameRef.current, currentFrame, 30);
      const objects = classifyRegions(motionRegions);
      setDetectedObjects(objects);
    }
    
    prevFrameRef.current = currentFrame;
  };

  const findMotionRegions = (prev: ImageData, curr: ImageData, threshold: number) => {
    const width = curr.width;
    const height = curr.height;
    const regions: {x: number, y: number, w: number, h: number}[] = [];
    
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasMotion = false;
    
    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const i = (y * width + x) * 4;
        const diff = Math.abs(curr.data[i] - prev.data[i]) +
                    Math.abs(curr.data[i+1] - prev.data[i+1]) +
                    Math.abs(curr.data[i+2] - prev.data[i+2]);
        
        if (diff > threshold * 3) {
          hasMotion = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    if (hasMotion && maxX - minX > 30 && maxY - minY > 30) {
      regions.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    }
    
    return regions;
  };

  const classifyRegions = (regions: {x: number, y: number, w: number, h: number}[]): DetectedObject[] => {
    const now = Date.now();
    const trackedObjects = trackedObjectsRef.current;
    
    trackedObjects.forEach((val, key) => {
      if (now - val.lastSeen > 2000) {
        trackedObjects.delete(key);
      }
    });
    
    return regions.map((r) => {
      const aspectRatio = r.w / r.h;
      let type: "person" | "vehicle" | "unknown" = "unknown";
      let confidence = 60 + Math.floor(Math.random() * 30);
      
      if (aspectRatio < 0.8 && r.h > 80) {
        type = "person";
        confidence = 75 + Math.floor(Math.random() * 20);
      } else if (aspectRatio > 1.2 && r.w > 100) {
        type = "vehicle";
        confidence = 70 + Math.floor(Math.random() * 25);
      }
      
      let bestMatchId = "";
      let bestMatchScore = 0;
      
      trackedObjects.forEach((tracked, id) => {
        const dx = Math.abs(r.x - tracked.x);
        const dy = Math.abs(r.y - tracked.y);
        const score = 1 / (1 + dx * 0.01 + dy * 0.01);
        if (score > bestMatchScore && score > 0.5) {
          bestMatchScore = score;
          bestMatchId = id;
        }
      });
      
      let objectId: string;
      if (bestMatchId) {
        objectId = bestMatchId;
        trackedObjects.set(objectId, { x: r.x, y: r.y, lastSeen: now });
      } else {
        objectIdCounterRef.current++;
        objectId = `obj_${type}_${objectIdCounterRef.current}`;
        trackedObjects.set(objectId, { x: r.x, y: r.y, lastSeen: now });
      }
      
      return {
        id: objectId,
        type,
        confidence,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        color: type === "person" ? "#22c55e" : type === "vehicle" ? "#f59e0b" : "#6b7280"
      };
    });
  };

  const startWebcam = async () => {
    try {
      setWebcamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'environment'
        } 
      });
      setWebcamStream(stream);
      setIsDetecting(true);
      toast.success("Laptop camera connected - detection active");
    } catch (err: any) {
      console.error("Webcam error:", err);
      setWebcamError(err.message || "Failed to access camera");
      toast.error("Could not access camera. Check permissions.");
    }
  };

  const stopWebcam = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
  };

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
          {isRecording ? "REC" : "LIVE"}: {
            activeCam === 'gimbal' ? (thermalMode ? 'THERMAL' : 'GIMBAL') : 
            activeCam === 'thermal' ? 'THERMAL' : 
            activeCam === 'webcam' ? 'LAPTOP CAM' : 'FPV'
          }
          {zoom[0] > 1 && <span className="text-amber-500">{zoom[0].toFixed(1)}x</span>}
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => {
              if (activeCam === 'gimbal') setActiveCam('thermal');
              else if (activeCam === 'thermal') setActiveCam('fpv');
              else if (activeCam === 'fpv') setActiveCam('webcam');
              else setActiveCam('gimbal');
            }} 
            className="p-1 hover:text-white text-muted-foreground text-[10px] uppercase border border-white/20 rounded px-2"
            title="Switch Camera (Gimbal/Thermal/FPV/Laptop)"
          >
            CAM
          </button>
          <button 
            onClick={() => setActiveCam('webcam')} 
            className={cn("p-1 hover:text-white text-muted-foreground", activeCam === 'webcam' && "text-primary")}
            title="Laptop Camera (Test Mode)"
          >
            <Laptop className="h-3 w-3" />
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
          className="w-full h-full"
        >
          {activeCam === 'webcam' ? (
            webcamStream ? (
              <div className="relative w-full h-full">
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Detection overlays */}
                {detectedObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className="absolute border-2 rounded pointer-events-none"
                    style={{
                      left: `${(obj.x / videoDimensions.width) * 100}%`,
                      top: `${(obj.y / videoDimensions.height) * 100}%`,
                      width: `${(obj.width / videoDimensions.width) * 100}%`,
                      height: `${(obj.height / videoDimensions.height) * 100}%`,
                      borderColor: obj.color,
                    }}
                  >
                    <div 
                      className="absolute -top-4 left-0 text-[8px] px-1 font-bold text-black"
                      style={{ backgroundColor: obj.color }}
                    >
                      {obj.type.toUpperCase()} {obj.confidence}%
                    </div>
                  </div>
                ))}
                
                {/* Detection status */}
                <div className="absolute top-10 left-2 flex gap-1">
                  <Badge className={isDetecting ? "bg-emerald-500 text-[8px]" : "bg-gray-500 text-[8px]"}>
                    {isDetecting ? "DETECT ON" : "DETECT OFF"}
                  </Badge>
                  {detectedObjects.length > 0 && (
                    <Badge className="bg-amber-500 text-[8px]">{detectedObjects.length} OBJ</Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                {webcamError ? (
                  <div className="text-center p-4">
                    <Laptop className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{webcamError}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={startWebcam}
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Laptop className="h-8 w-8 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm">Connecting to camera...</p>
                  </div>
                )}
              </div>
            )
          ) : (
            <img 
              src={activeCam === 'fpv' ? fpvImg : aerialImg} 
              alt="Drone Feed" 
              className={cn(
                "w-full h-full object-cover",
                thermalMode ? "opacity-90 hue-rotate-[280deg] saturate-[200%]" : "opacity-90"
              )}
            />
          )}
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
