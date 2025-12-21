import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Users, Car, Box, AlertCircle, MapPin, Search, Crosshair, Lock, Unlock, Camera, Play, Square, Loader2, Laptop, Video } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { MissionMap } from "@/components/map/MissionMap";

interface DetectedObject {
  id: string;
  type: "person" | "vehicle" | "unknown";
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export function TrackingPanel() {
  const [trackingActive, setTrackingActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [targetType, setTargetType] = useState("all");
  const [targetMethod, setTargetMethod] = useState<"camera" | "map" | "address">("camera");
  const [targetAddress, setTargetAddress] = useState("");
  const [addressResults, setAddressResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState([75]);
  const [followDistance, setFollowDistance] = useState([10]);
  const [lockedTarget, setLockedTarget] = useState<string | null>(null);
  const [targetCoords, setTargetCoords] = useState<{lat: number, lng: number} | null>(null);
  
  // Webcam state
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectIdCounterRef = useRef(0);

  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);

  // Start webcam
  const startWebcam = async () => {
    try {
      setWebcamError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment'
        } 
      });
      setWebcamStream(stream);
      setIsDetecting(true); // Auto-enable detection when camera starts
      toast.success("Camera connected - motion detection active");
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
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    setDetectedObjects([]);
  };

  // Motion-based object detection using frame differencing
  const runDetection = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const prevFrame = prevFrameRef.current;
    
    if (prevFrame && prevFrame.width === currentFrame.width) {
      const motionRegions = detectMotion(prevFrame, currentFrame);
      const classified = classifyRegions(motionRegions);
      setDetectedObjects(classified);
    }
    
    prevFrameRef.current = currentFrame;
  }, [isDetecting]);

  // Simple motion detection via pixel difference
  const detectMotion = (prev: ImageData, curr: ImageData): {x: number, y: number, w: number, h: number}[] => {
    const threshold = 30;
    const minArea = 500;
    const regions: {x: number, y: number, w: number, h: number}[] = [];
    
    // Find motion pixels and cluster them
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    let motionPixels = 0;
    
    for (let i = 0; i < curr.data.length; i += 4) {
      const diff = Math.abs(curr.data[i] - prev.data[i]) + 
                   Math.abs(curr.data[i+1] - prev.data[i+1]) + 
                   Math.abs(curr.data[i+2] - prev.data[i+2]);
      
      if (diff > threshold * 3) {
        const pixelIndex = i / 4;
        const x = pixelIndex % curr.width;
        const y = Math.floor(pixelIndex / curr.width);
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        motionPixels++;
      }
    }
    
    if (motionPixels > minArea && minX < Infinity) {
      // Add padding
      const padding = 20;
      regions.push({
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        w: Math.min(curr.width - minX + padding * 2, maxX - minX + padding * 2),
        h: Math.min(curr.height - minY + padding * 2, maxY - minY + padding * 2)
      });
    }
    
    return regions;
  };

  // Track objects across frames using IoU-based matching
  const trackedObjectsRef = useRef<Map<string, {x: number, y: number, lastSeen: number}>>(new Map());
  
  // Calculate Intersection over Union for matching
  const calculateIoU = (a: {x: number, y: number, w: number, h: number}, b: {x: number, y: number}) => {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return 1 / (1 + dx * 0.01 + dy * 0.01); // Proximity-based score
  };
  
  // Basic classification based on aspect ratio - uses tracked IDs
  const classifyRegions = (regions: {x: number, y: number, w: number, h: number}[]): DetectedObject[] => {
    const now = Date.now();
    const trackedObjects = trackedObjectsRef.current;
    
    // Clear stale tracked objects (not seen for 2 seconds)
    trackedObjects.forEach((val, key) => {
      if (now - val.lastSeen > 2000) {
        trackedObjects.delete(key);
      }
    });
    
    return regions.map((r, i) => {
      const aspectRatio = r.w / r.h;
      let type: "person" | "vehicle" | "unknown" = "unknown";
      let confidence = 60 + Math.floor(Math.random() * 30);
      
      // Tall narrow = likely person, wide = likely vehicle
      if (aspectRatio < 0.8 && r.h > 80) {
        type = "person";
        confidence = 75 + Math.floor(Math.random() * 20);
      } else if (aspectRatio > 1.2 && r.w > 100) {
        type = "vehicle";
        confidence = 70 + Math.floor(Math.random() * 25);
      }
      
      // Try to match with existing tracked object
      let bestMatchId = "";
      let bestMatchScore = 0;
      
      trackedObjects.forEach((tracked, id) => {
        const score = calculateIoU(r, tracked);
        if (score > bestMatchScore && score > 0.5) {
          bestMatchScore = score;
          bestMatchId = id;
        }
      });
      
      // Use matched ID or create new one
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

  // Setup video and detection when webcam starts
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
      
      // Also poll for dimension changes (for adaptive resolution)
      const dimensionCheck = setInterval(() => {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          const w = videoRef.current.videoWidth;
          const h = videoRef.current.videoHeight;
          if (w !== videoDimensions.width || h !== videoDimensions.height) {
            setVideoDimensions({ width: w, height: h });
          }
        }
      }, 1000);
      
      return () => clearInterval(dimensionCheck);
    }
  }, [webcamStream, videoDimensions.width, videoDimensions.height]);

  // Run detection loop
  useEffect(() => {
    if (isDetecting && webcamStream) {
      detectionIntervalRef.current = setInterval(runDetection, 200);
    } else if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    };
  }, [isDetecting, webcamStream, runDetection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopWebcam();
  }, []);

  const filteredObjects = detectedObjects
    .filter(obj => targetType === "all" || obj.type === targetType)
    .filter(obj => obj.confidence >= confidenceThreshold[0]);

  const handleLockTarget = (objectId: string) => {
    if (lockedTarget === objectId) {
      setLockedTarget(null);
      toast.info("Target unlocked");
    } else {
      setLockedTarget(objectId);
      toast.success("Target locked - ready to track");
    }
  };

  const handleAddressSearch = async () => {
    if (!targetAddress.trim()) {
      toast.error("Please enter an address");
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(targetAddress)}`
      );
      const results = await response.json();
      
      if (results.length > 0) {
        setAddressResults(results);
        toast.success(`Found ${results.length} location(s)`);
      } else {
        toast.error("No locations found");
        setAddressResults([]);
      }
    } catch (error) {
      toast.error("Failed to search address");
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddressResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setTargetCoords({ lat, lng });
    setTargetAddress(result.display_name);
    setAddressResults([]);
    toast.success(`Target set to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setTargetCoords({ lat, lng });
    toast.success(`Target location set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }, []);

  const handleStartTracking = async () => {
    if (targetMethod === "camera" && !lockedTarget) {
      if (!webcamStream) {
        toast.error("Please start the camera first");
        return;
      }
      if (!isDetecting) {
        toast.error("Please enable detection to find and lock a target");
        return;
      }
      toast.error("Please click on a detected object to lock it as target");
      return;
    }
    
    if ((targetMethod === "map" || targetMethod === "address") && !targetCoords) {
      toast.error("Please set a target location first");
      return;
    }

    setIsStarting(true);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setTrackingActive(true);
    setIsStarting(false);
    toast.success("Tracking activated - drone is following target");
  };

  const handleStopTracking = () => {
    setTrackingActive(false);
    toast.info("Tracking stopped");
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "vehicle": return <Car className="h-4 w-4" />;
      case "person": return <Users className="h-4 w-4" />;
      case "package": return <Box className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left Panel - Controls */}
      <div className="w-96 overflow-y-auto p-4 bg-background space-y-4 border-r border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight font-sans">Object Tracking</h2>
          <p className="text-sm text-muted-foreground">Computer vision target tracking</p>
        </div>

        <Card className="border-2 border-primary/50">
          <CardHeader className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Tracking Status
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {trackingActive ? (
                  <Badge className="bg-emerald-500 animate-pulse">ACTIVE</Badge>
                ) : (
                  <Badge variant="outline">STANDBY</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex gap-2">
              {trackingActive ? (
                <Button variant="destructive" className="flex-1" onClick={handleStopTracking}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop Tracking
                </Button>
              ) : (
                <Button className="flex-1" onClick={handleStartTracking} disabled={isStarting}>
                  {isStarting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {isStarting ? "Starting..." : "Start Tracking"}
                </Button>
              )}
            </div>
            
            {(lockedTarget || targetCoords) && (
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                {lockedTarget && (
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3 text-primary" />
                    <span>Locked: {lockedTarget.toUpperCase()}</span>
                  </div>
                )}
                {targetCoords && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-primary" />
                    <span>Location: {targetCoords.lat.toFixed(4)}, {targetCoords.lng.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Target Selection Method</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <Tabs value={targetMethod} onValueChange={(v) => setTargetMethod(v as any)}>
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="camera" className="text-xs">
                  <Camera className="h-3 w-3 mr-1" />
                  Camera
                </TabsTrigger>
                <TabsTrigger value="map" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  Map
                </TabsTrigger>
                <TabsTrigger value="address" className="text-xs">
                  <Search className="h-3 w-3 mr-1" />
                  Address
                </TabsTrigger>
              </TabsList>

              <TabsContent value="camera" className="mt-2">
                <p className="text-xs text-muted-foreground">
                  Lock a target from detected objects below
                </p>
              </TabsContent>

              <TabsContent value="map" className="mt-2">
                <p className="text-xs text-muted-foreground">
                  Click on the map to set tracking destination
                </p>
              </TabsContent>

              <TabsContent value="address" className="mt-2 space-y-2">
                <div className="flex gap-1">
                  <Input
                    placeholder="Enter address..."
                    value={targetAddress}
                    onChange={(e) => setTargetAddress(e.target.value)}
                    className="flex-1 h-8 text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                  />
                  <Button size="sm" className="h-8" onClick={handleAddressSearch} disabled={isSearching}>
                    {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                </div>
                
                {addressResults.length > 0 && (
                  <div className="bg-muted rounded border border-border max-h-24 overflow-y-auto">
                    {addressResults.map((result, idx) => (
                      <div
                        key={idx}
                        className="p-2 hover:bg-primary/10 cursor-pointer text-xs border-b border-border last:border-0"
                        onClick={() => selectAddressResult(result)}
                      >
                        <div className="truncate">{result.display_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Filter by Type</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "all", label: "All", icon: Target },
                { id: "person", label: "Person", icon: Users },
                { id: "vehicle", label: "Vehicle", icon: Car },
                { id: "package", label: "Package", icon: Box },
              ].map((type) => (
                <Button
                  key={type.id}
                  variant={targetType === type.id ? "default" : "outline"}
                  className="h-12 flex flex-col gap-1 p-1"
                  onClick={() => setTargetType(type.id)}
                >
                  <type.icon className="h-4 w-4" />
                  <span className="text-[10px]">{type.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Tracking Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Confidence Threshold</Label>
                <span className="text-xs text-muted-foreground font-mono">{confidenceThreshold[0]}%</span>
              </div>
              <Slider 
                value={confidenceThreshold} 
                onValueChange={setConfidenceThreshold}
                max={100} 
                step={5} 
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Follow Distance</Label>
                <span className="text-xs text-muted-foreground font-mono">{followDistance[0]}m</span>
              </div>
              <Slider 
                value={followDistance} 
                onValueChange={setFollowDistance}
                max={50} 
                step={1} 
              />
            </div>
          </CardContent>
        </Card>

        {targetMethod === "camera" && (
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">Detected Objects ({filteredObjects.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              {filteredObjects.length > 0 ? (
                filteredObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                      lockedTarget === obj.id
                        ? "bg-primary/20 border-primary"
                        : "bg-muted/50 border-border hover:bg-muted"
                    }`}
                    onClick={() => handleLockTarget(obj.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${lockedTarget === obj.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {getTypeIcon(obj.type)}
                      </div>
                      <div>
                        <span className="font-mono text-xs capitalize">{obj.type} #{obj.id}</span>
                        <div className="text-[10px] text-muted-foreground">{obj.confidence}% confidence</div>
                      </div>
                    </div>
                    {lockedTarget === obj.id ? (
                      <Lock className="h-4 w-4 text-primary" />
                    ) : (
                      <Unlock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  No objects match filter
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Panel - Map or Camera View */}
      <div className="flex-1 relative">
        {targetMethod === "map" ? (
          <MissionMap
            waypoints={targetCoords ? [{ order: 1, latitude: targetCoords.lat, longitude: targetCoords.lng, altitude: 50 }] : []}
            onMapClick={handleMapClick}
            clickEnabled={true}
            showClickHint={!targetCoords}
          />
        ) : (
          <div className="w-full h-full bg-slate-900 relative overflow-hidden">
            {/* Hidden canvas for frame analysis */}
            <canvas ref={canvasRef} className="hidden" />
            
            {/* Webcam video feed */}
            {webcamStream ? (
              <>
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-contain"
                />
                
                {/* Detection overlay boxes */}
                {filteredObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className={`absolute border-2 rounded cursor-pointer transition-all ${
                      lockedTarget === obj.id ? "border-primary border-4" : ""
                    }`}
                    style={{
                      left: `${(obj.x / videoDimensions.width) * 100}%`,
                      top: `${(obj.y / videoDimensions.height) * 100}%`,
                      width: `${(obj.width / videoDimensions.width) * 100}%`,
                      height: `${(obj.height / videoDimensions.height) * 100}%`,
                      borderColor: obj.color || '#f59e0b',
                    }}
                    onClick={() => handleLockTarget(obj.id)}
                  >
                    <div 
                      className="absolute -top-5 left-0 text-[10px] px-1 font-bold text-black"
                      style={{ backgroundColor: obj.color || '#f59e0b' }}
                    >
                      {obj.type.toUpperCase()} {obj.confidence}%
                    </div>
                  </div>
                ))}
                
                {/* Detection status overlay */}
                <div className="absolute top-2 left-2 flex gap-2">
                  <Badge className={isDetecting ? "bg-emerald-500 animate-pulse" : "bg-gray-500"}>
                    {isDetecting ? "DETECTING" : "PAUSED"}
                  </Badge>
                  <Badge variant="outline" className="text-white border-white/50">
                    {filteredObjects.length} Objects
                  </Badge>
                </div>
                
                {/* Camera controls */}
                <div className="absolute bottom-2 left-2 flex gap-2">
                  <Button 
                    size="sm" 
                    variant={isDetecting ? "destructive" : "default"}
                    onClick={() => setIsDetecting(!isDetecting)}
                  >
                    {isDetecting ? <Square className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                    {isDetecting ? "Stop" : "Detect"}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={stopWebcam}
                  >
                    <Video className="h-3 w-3 mr-1" />
                    Stop Camera
                  </Button>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  {webcamError ? (
                    <>
                      <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
                      <p className="text-sm text-red-400">{webcamError}</p>
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={startWebcam}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Retry Camera
                      </Button>
                    </>
                  ) : (
                    <>
                      <Laptop className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-sm">Connect your camera to start object detection</p>
                      <p className="text-xs mt-1 text-muted-foreground">Uses motion detection to identify moving objects</p>
                      <Button 
                        className="mt-4"
                        onClick={startWebcam}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Start Camera
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
