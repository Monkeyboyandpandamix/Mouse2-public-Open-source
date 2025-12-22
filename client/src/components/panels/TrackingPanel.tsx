import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Users, Car, Box, AlertCircle, MapPin, Search, Crosshair, Lock, Unlock, Camera, Play, Square, Loader2, Laptop, Video, Zap } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { MissionMap } from "@/components/map/MissionMap";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

interface DetectedObject {
  id: string;
  type: "person" | "vehicle" | "unknown";
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  velocity?: { dx: number; dy: number };
  framesSeen: number;
  lastSeen: number;
}

interface TrackedObject {
  id: string;
  type: "person" | "vehicle" | "unknown";
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  smoothedConfidence: number;
  velocity: { dx: number; dy: number };
  framesSeen: number;
  lastSeen: number;
  color: string;
}

const VEHICLE_CLASSES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'];
const PERSON_CLASSES = ['person'];
const ALL_TRACKABLE_CLASSES = [...PERSON_CLASSES, ...VEHICLE_CLASSES];

export function TrackingPanel() {
  const [trackingActive, setTrackingActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [targetType, setTargetType] = useState("all");
  const [targetMethod, setTargetMethod] = useState<"camera" | "map" | "address">("camera");
  const [targetAddress, setTargetAddress] = useState("");
  const [addressResults, setAddressResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState([40]);
  const [followDistance, setFollowDistance] = useState([10]);
  const [lockedTargets, setLockedTargets] = useState<Set<string>>(new Set());
  const [targetCoords, setTargetCoords] = useState<{lat: number, lng: number} | null>(null);
  
  // ML Model state
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  
  // Webcam state
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectIdCounterRef = useRef(0);
  
  // Multi-object tracking state
  const trackedObjectsRef = useRef<Map<string, TrackedObject>>(new Map());
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  
  // Load TensorFlow.js and COCO-SSD model
  const loadModel = useCallback(async () => {
    if (modelRef.current || modelLoading) return;
    
    setModelLoading(true);
    try {
      await tf.ready();
      await tf.setBackend('webgl');
      const model = await cocoSsd.load({
        base: 'lite_mobilenet_v2'
      });
      modelRef.current = model;
      setModelLoaded(true);
      toast.success("AI model loaded - ready for detection");
    } catch (error) {
      console.error("Failed to load ML model:", error);
      toast.error("Failed to load AI model. Using fallback detection.");
    } finally {
      setModelLoading(false);
    }
  }, [modelLoading]);
  
  // Calculate IoU for object matching
  const calculateIoU = (boxA: {x: number, y: number, width: number, height: number}, 
                        boxB: {x: number, y: number, width: number, height: number}): number => {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
    
    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = boxA.width * boxA.height;
    const boxBArea = boxB.width * boxB.height;
    const unionArea = boxAArea + boxBArea - interArea;
    
    return unionArea > 0 ? interArea / unionArea : 0;
  };
  
  // Hungarian-style assignment for multi-object tracking
  const assignDetectionsToTracks = (
    detections: Array<{label: string, confidence: number, bbox: number[]}>,
    tracks: Map<string, TrackedObject>
  ): DetectedObject[] => {
    const now = Date.now();
    const IOU_THRESHOLD = 0.3;
    const MAX_FRAMES_MISSING = 15;
    const CONFIDENCE_SMOOTHING = 0.7;
    
    const assignments: DetectedObject[] = [];
    const usedDetections = new Set<number>();
    const usedTracks = new Set<string>();
    
    // First pass: match existing tracks with detections
    const matchScores: Array<{trackId: string, detIdx: number, iou: number}> = [];
    
    tracks.forEach((track, trackId) => {
      detections.forEach((det, detIdx) => {
        const detBox = { x: det.bbox[0], y: det.bbox[1], width: det.bbox[2], height: det.bbox[3] };
        const trackBox = { x: track.x, y: track.y, width: track.width, height: track.height };
        const iou = calculateIoU(detBox, trackBox);
        
        if (iou > IOU_THRESHOLD) {
          matchScores.push({ trackId, detIdx, iou });
        }
      });
    });
    
    // Sort by IoU descending for greedy assignment
    matchScores.sort((a, b) => b.iou - a.iou);
    
    // Greedy assignment
    for (const match of matchScores) {
      if (usedDetections.has(match.detIdx) || usedTracks.has(match.trackId)) continue;
      
      usedDetections.add(match.detIdx);
      usedTracks.add(match.trackId);
      
      const det = detections[match.detIdx];
      const track = tracks.get(match.trackId)!;
      
      // Calculate velocity
      const dx = det.bbox[0] - track.x;
      const dy = det.bbox[1] - track.y;
      
      // Smooth confidence with temporal averaging
      const smoothedConf = CONFIDENCE_SMOOTHING * track.smoothedConfidence + 
                          (1 - CONFIDENCE_SMOOTHING) * (det.confidence * 100);
      
      // Update track
      const type = PERSON_CLASSES.includes(det.label) ? "person" : 
                   VEHICLE_CLASSES.includes(det.label) ? "vehicle" : "unknown";
      
      const updatedTrack: TrackedObject = {
        ...track,
        x: det.bbox[0],
        y: det.bbox[1],
        width: det.bbox[2],
        height: det.bbox[3],
        confidence: det.confidence * 100,
        smoothedConfidence: smoothedConf,
        velocity: { dx, dy },
        framesSeen: track.framesSeen + 1,
        lastSeen: now,
        label: det.label,
        type,
      };
      
      tracks.set(match.trackId, updatedTrack);
      
      assignments.push({
        id: match.trackId,
        type: updatedTrack.type,
        label: updatedTrack.label,
        confidence: Math.round(updatedTrack.smoothedConfidence),
        x: updatedTrack.x,
        y: updatedTrack.y,
        width: updatedTrack.width,
        height: updatedTrack.height,
        color: updatedTrack.color,
        velocity: updatedTrack.velocity,
        framesSeen: updatedTrack.framesSeen,
        lastSeen: updatedTrack.lastSeen,
      });
    }
    
    // Create new tracks for unmatched detections
    detections.forEach((det, idx) => {
      if (usedDetections.has(idx)) return;
      if (!ALL_TRACKABLE_CLASSES.includes(det.label)) return;
      
      objectIdCounterRef.current++;
      const newId = `track_${objectIdCounterRef.current}`;
      
      const type = PERSON_CLASSES.includes(det.label) ? "person" : 
                   VEHICLE_CLASSES.includes(det.label) ? "vehicle" : "unknown";
      
      const color = type === "person" ? "#22c55e" : 
                    type === "vehicle" ? "#f59e0b" : "#6b7280";
      
      const newTrack: TrackedObject = {
        id: newId,
        type,
        label: det.label,
        x: det.bbox[0],
        y: det.bbox[1],
        width: det.bbox[2],
        height: det.bbox[3],
        confidence: det.confidence * 100,
        smoothedConfidence: det.confidence * 100,
        velocity: { dx: 0, dy: 0 },
        framesSeen: 1,
        lastSeen: now,
        color,
      };
      
      tracks.set(newId, newTrack);
      
      assignments.push({
        id: newId,
        type: newTrack.type,
        label: newTrack.label,
        confidence: Math.round(newTrack.smoothedConfidence),
        x: newTrack.x,
        y: newTrack.y,
        width: newTrack.width,
        height: newTrack.height,
        color: newTrack.color,
        velocity: newTrack.velocity,
        framesSeen: newTrack.framesSeen,
        lastSeen: newTrack.lastSeen,
      });
    });
    
    // Remove stale tracks (not seen for too long)
    tracks.forEach((track, trackId) => {
      if (!usedTracks.has(trackId)) {
        const framesMissing = (now - track.lastSeen) / 100;
        if (framesMissing > MAX_FRAMES_MISSING) {
          tracks.delete(trackId);
        } else {
          // Keep predicting position for a few frames using velocity
          const predictedTrack = {
            ...track,
            x: track.x + track.velocity.dx * 0.5,
            y: track.y + track.velocity.dy * 0.5,
            smoothedConfidence: track.smoothedConfidence * 0.9,
          };
          tracks.set(trackId, predictedTrack);
          
          // Still show the predicted object but with lower confidence
          if (predictedTrack.smoothedConfidence > 20) {
            assignments.push({
              id: trackId,
              type: predictedTrack.type,
              label: predictedTrack.label + " (predicted)",
              confidence: Math.round(predictedTrack.smoothedConfidence),
              x: predictedTrack.x,
              y: predictedTrack.y,
              width: predictedTrack.width,
              height: predictedTrack.height,
              color: predictedTrack.color,
              velocity: predictedTrack.velocity,
              framesSeen: predictedTrack.framesSeen,
              lastSeen: predictedTrack.lastSeen,
            });
          }
        }
      }
    });
    
    return assignments;
  };

  // Start webcam and load model
  const startWebcam = async () => {
    try {
      setWebcamError(null);
      
      // Start loading model in parallel
      loadModel();
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment'
        } 
      });
      setWebcamStream(stream);
      setIsDetecting(true);
      toast.success("Camera connected - AI detection starting");
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
    trackedObjectsRef.current.clear();
  };

  // ML-based object detection using COCO-SSD
  const runDetection = useCallback(async () => {
    if (!videoRef.current || !isDetecting) return;
    
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.readyState < 2) return;
    
    // Use ML model if available
    if (modelRef.current) {
      try {
        const predictions = await modelRef.current.detect(video);
        
        // Convert predictions to our format
        const mlDetections = predictions.map(p => ({
          label: p.class,
          confidence: p.score,
          bbox: p.bbox // [x, y, width, height]
        }));
        
        // Run multi-object tracking assignment
        const trackedResults = assignDetectionsToTracks(
          mlDetections, 
          trackedObjectsRef.current
        );
        
        setDetectedObjects(trackedResults);
      } catch (error) {
        console.error("Detection error:", error);
      }
    }
  }, [isDetecting, assignDetectionsToTracks]);

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
    setLockedTargets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(objectId)) {
        newSet.delete(objectId);
        toast.info("Target unlocked");
      } else {
        newSet.add(objectId);
        toast.success(`Target locked (${newSet.size} total)`);
      }
      return newSet;
    });
  };
  
  const handleClearAllLocks = () => {
    setLockedTargets(new Set());
    toast.info("All targets unlocked");
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
    if (targetMethod === "camera" && lockedTargets.size === 0) {
      if (!webcamStream) {
        toast.error("Please start the camera first");
        return;
      }
      if (!isDetecting) {
        toast.error("Please enable detection to find and lock a target");
        return;
      }
      toast.error("Please click on detected objects to lock them as targets");
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
    toast.success(`Tracking ${lockedTargets.size} target(s) - drone is following`);
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
            
            {(lockedTargets.size > 0 || targetCoords) && (
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-1">
                {lockedTargets.size > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-primary" />
                      <span>{lockedTargets.size} target(s) locked</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" onClick={handleClearAllLocks}>
                      Clear All
                    </Button>
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
                      lockedTargets.has(obj.id)
                        ? "bg-primary/20 border-primary"
                        : "bg-muted/50 border-border hover:bg-muted"
                    }`}
                    onClick={() => handleLockTarget(obj.id)}
                    data-testid={`object-card-${obj.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${lockedTargets.has(obj.id) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {getTypeIcon(obj.type)}
                      </div>
                      <div>
                        <span className="font-mono text-xs capitalize">{obj.label || obj.type}</span>
                        <div className="text-[10px] text-muted-foreground">{obj.confidence}% | {obj.framesSeen} frames</div>
                      </div>
                    </div>
                    {lockedTargets.has(obj.id) ? (
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
                      lockedTargets.has(obj.id) ? "border-4 shadow-lg" : ""
                    }`}
                    style={{
                      left: `${(obj.x / videoDimensions.width) * 100}%`,
                      top: `${(obj.y / videoDimensions.height) * 100}%`,
                      width: `${(obj.width / videoDimensions.width) * 100}%`,
                      height: `${(obj.height / videoDimensions.height) * 100}%`,
                      borderColor: lockedTargets.has(obj.id) ? '#3b82f6' : (obj.color || '#f59e0b'),
                    }}
                    onClick={() => handleLockTarget(obj.id)}
                    data-testid={`detection-box-${obj.id}`}
                  >
                    <div 
                      className="absolute -top-5 left-0 text-[10px] px-1 font-bold text-black flex items-center gap-1"
                      style={{ backgroundColor: lockedTargets.has(obj.id) ? '#3b82f6' : (obj.color || '#f59e0b') }}
                    >
                      {lockedTargets.has(obj.id) && <Lock className="h-3 w-3" />}
                      {obj.label?.toUpperCase() || obj.type.toUpperCase()} {obj.confidence}%
                    </div>
                  </div>
                ))}
                
                {/* Detection status overlay */}
                <div className="absolute top-2 left-2 flex gap-2 flex-wrap">
                  {modelLoading && (
                    <Badge className="bg-amber-500 animate-pulse">
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Loading AI...
                    </Badge>
                  )}
                  {modelLoaded && (
                    <Badge className="bg-blue-500">
                      <Zap className="h-3 w-3 mr-1" />
                      AI Active
                    </Badge>
                  )}
                  <Badge className={isDetecting ? "bg-emerald-500 animate-pulse" : "bg-gray-500"}>
                    {isDetecting ? "DETECTING" : "PAUSED"}
                  </Badge>
                  <Badge variant="outline" className="text-white border-white/50">
                    {filteredObjects.length} Objects
                  </Badge>
                  {lockedTargets.size > 0 && (
                    <Badge className="bg-primary">
                      <Lock className="h-3 w-3 mr-1" />
                      {lockedTargets.size} Locked
                    </Badge>
                  )}
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
                      <p className="text-sm">Connect your camera to start AI object detection</p>
                      <p className="text-xs mt-1 text-muted-foreground">Detects people, cars, trucks, and more - even when stationary</p>
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
