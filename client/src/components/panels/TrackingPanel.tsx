import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Target, Users, Car, Box, AlertCircle, Lock, Unlock, Camera, Play, Square, Loader2, Laptop, Video, Zap, ScanText, Trash2, Save } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
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
  areaRatio?: number;
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
  areaRatio: number;
}

interface PlateRecord {
  id: string;
  plateText: string;
  confidence: number;
  targetId: string;
  timestamp: number;
}

const VEHICLE_CLASSES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'train', 'boat'];
const PERSON_CLASSES = ['person'];
const ANIMAL_CLASSES = ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'];
const AIRCRAFT_CLASSES = ['airplane', 'kite'];
const PACKAGE_CLASSES = ['backpack', 'handbag', 'suitcase', 'umbrella'];
const ALL_TRACKABLE_CLASSES = [...PERSON_CLASSES, ...VEHICLE_CLASSES, ...ANIMAL_CLASSES, ...AIRCRAFT_CLASSES, ...PACKAGE_CLASSES];

const AERIAL_CONFIDENCE_BOOST: Record<string, number> = {
  person: 12, car: 15, truck: 15, bus: 15, motorcycle: 10,
  bicycle: 8, boat: 12, airplane: 18, bird: 5,
  backpack: 5, suitcase: 5, umbrella: 5,
  dog: 5, cat: 3, horse: 8, cow: 8,
};
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function TrackingPanel() {
  const { hasPermission } = usePermissions();
  const canTrack = hasPermission('object_tracking');
  const [trackingActive, setTrackingActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [targetType, setTargetType] = useState("all");
  const [targetMethod] = useState<"camera">("camera");
  const [confidenceThreshold, setConfidenceThreshold] = useState([40]);
  const [followDistance, setFollowDistance] = useState([10]);
  const [lockedTargets, setLockedTargets] = useState<Set<string>>(new Set());
  
  // ML Model state
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  
  // Webcam state
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectIdCounterRef = useRef(0);
  
  // Multi-object tracking state
  const trackedObjectsRef = useRef<Map<string, TrackedObject>>(new Map());
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [plateScanEnabled, setPlateScanEnabled] = useState(false);
  const [plateRecords, setPlateRecords] = useState<PlateRecord[]>(() => {
    try {
      const saved = localStorage.getItem("mouse_plate_records");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [manualPlateText, setManualPlateText] = useState("");
  const lastPlateScanAtRef = useRef(0);

  useEffect(() => {
    localStorage.setItem("mouse_plate_records", JSON.stringify(plateRecords.slice(0, 200)));
  }, [plateRecords]);
  
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

  const computeTrackMatchScore = (
    track: TrackedObject,
    det: { bbox: number[]; confidence: number; label: string },
  ) => {
    const detBox = { x: det.bbox[0], y: det.bbox[1], width: det.bbox[2], height: det.bbox[3] };
    const trackBox = { x: track.x, y: track.y, width: track.width, height: track.height };
    const iou = calculateIoU(detBox, trackBox);

    const detCenterX = det.bbox[0] + det.bbox[2] / 2;
    const detCenterY = det.bbox[1] + det.bbox[3] / 2;
    const trackCenterX = track.x + track.width / 2 + track.velocity.dx * 0.5;
    const trackCenterY = track.y + track.height / 2 + track.velocity.dy * 0.5;

    const centerDist = Math.hypot(detCenterX - trackCenterX, detCenterY - trackCenterY);
    const centerScore = Math.max(0, 1 - centerDist / 220);

    const detArea = det.bbox[2] * det.bbox[3];
    const trackArea = Math.max(1, track.width * track.height);
    const areaRatio = Math.min(detArea, trackArea) / Math.max(detArea, trackArea);
    const sizeScore = Math.max(0, Math.min(1, areaRatio));

    const classMatch =
      track.label === det.label ||
      (PERSON_CLASSES.includes(track.label) && PERSON_CLASSES.includes(det.label)) ||
      (VEHICLE_CLASSES.includes(track.label) && VEHICLE_CLASSES.includes(det.label)) ||
      (ANIMAL_CLASSES.includes(track.label) && ANIMAL_CLASSES.includes(det.label)) ||
      (AIRCRAFT_CLASSES.includes(track.label) && AIRCRAFT_CLASSES.includes(det.label)) ||
      (PACKAGE_CLASSES.includes(track.label) && PACKAGE_CLASSES.includes(det.label));

    const classScore = classMatch ? 1 : 0.5;
    return (iou * 0.45 + centerScore * 0.3 + sizeScore * 0.2 + classScore * 0.05);
  };
  
  // Hungarian-style assignment for multi-object tracking
  const assignDetectionsToTracks = (
    detections: Array<{label: string, confidence: number, bbox: number[]}>,
    tracks: Map<string, TrackedObject>
  ): DetectedObject[] => {
    const now = Date.now();
    const MATCH_THRESHOLD = 0.28;
    const CONFIDENCE_SMOOTHING = 0.7;
    const frameArea = Math.max(1, videoDimensions.width * videoDimensions.height);
    
    const assignments: DetectedObject[] = [];
    const usedDetections = new Set<number>();
    const usedTracks = new Set<string>();
    
    // First pass: match existing tracks with detections.
    const matchScores: Array<{trackId: string, detIdx: number, score: number}> = [];
    
    tracks.forEach((track, trackId) => {
      detections.forEach((det, detIdx) => {
        const score = computeTrackMatchScore(track, det);
        if (score > MATCH_THRESHOLD) {
          matchScores.push({ trackId, detIdx, score });
        }
      });
    });
    
    // Sort by match score descending for greedy assignment
    matchScores.sort((a, b) => b.score - a.score);
    
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
      
      const aerialBoost = AERIAL_CONFIDENCE_BOOST[det.label] || 0;
      const boostedRawConf = Math.min(99, det.confidence * 100 + aerialBoost);
      const smoothedConf = CONFIDENCE_SMOOTHING * track.smoothedConfidence + 
                          (1 - CONFIDENCE_SMOOTHING) * boostedRawConf;
      const frameBonus = Math.min(10, track.framesSeen * 1.5);
      
      const type = PERSON_CLASSES.includes(det.label) ? "person" : 
                   VEHICLE_CLASSES.includes(det.label) ? "vehicle" :
                   ANIMAL_CLASSES.includes(det.label) ? "animal" :
                   AIRCRAFT_CLASSES.includes(det.label) ? "aircraft" :
                   PACKAGE_CLASSES.includes(det.label) ? "package" : "unknown";
      const areaRatio = (det.bbox[2] * det.bbox[3]) / frameArea;
      
      const updatedTrack: TrackedObject = {
        ...track,
        x: det.bbox[0],
        y: det.bbox[1],
        width: det.bbox[2],
        height: det.bbox[3],
        confidence: Math.min(99, boostedRawConf + frameBonus),
        smoothedConfidence: Math.min(99, smoothedConf + frameBonus),
        velocity: { dx, dy },
        framesSeen: track.framesSeen + 1,
        lastSeen: now,
        label: det.label,
        type,
        areaRatio,
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
        areaRatio: updatedTrack.areaRatio,
      });
    }
    
    // Create new tracks for unmatched detections
    detections.forEach((det, idx) => {
      if (usedDetections.has(idx)) return;
      if (!ALL_TRACKABLE_CLASSES.includes(det.label) && det.confidence < 0.45) return;
      
      objectIdCounterRef.current++;
      const newId = `track_${objectIdCounterRef.current}`;
      
      const type = PERSON_CLASSES.includes(det.label) ? "person" : 
                   VEHICLE_CLASSES.includes(det.label) ? "vehicle" :
                   ANIMAL_CLASSES.includes(det.label) ? "animal" :
                   AIRCRAFT_CLASSES.includes(det.label) ? "aircraft" :
                   PACKAGE_CLASSES.includes(det.label) ? "package" : "unknown";
      
      const color = type === "person" ? "#22c55e" : 
                    type === "vehicle" ? "#f59e0b" :
                    type === "animal" ? "#eab308" :
                    type === "aircraft" ? "#a855f7" :
                    type === "package" ? "#06b6d4" : "#6b7280";
      
      const newTrack: TrackedObject = {
        id: newId,
        type,
        label: det.label,
        x: det.bbox[0],
        y: det.bbox[1],
        width: det.bbox[2],
        height: det.bbox[3],
        confidence: Math.min(99, det.confidence * 100 + (AERIAL_CONFIDENCE_BOOST[det.label] || 0)),
        smoothedConfidence: Math.min(99, det.confidence * 100 + (AERIAL_CONFIDENCE_BOOST[det.label] || 0)),
        velocity: { dx: 0, dy: 0 },
        framesSeen: 1,
        lastSeen: now,
        color,
        areaRatio: (det.bbox[2] * det.bbox[3]) / frameArea,
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
        areaRatio: newTrack.areaRatio,
      });
    });
    
    // Remove stale tracks. Locked targets persist longer with predictive updates.
    tracks.forEach((track, trackId) => {
      if (!usedTracks.has(trackId)) {
        const trackIsLocked = lockedTargets.has(trackId);
        const maxFramesMissing = trackIsLocked ? 12 : 8;
        const framesMissing = (now - track.lastSeen) / 100;
        if (framesMissing > maxFramesMissing) {
          tracks.delete(trackId);
          if (trackIsLocked) {
            setLockedTargets((prev) => {
              const next = new Set(prev);
              next.delete(trackId);
              return next;
            });
          }
        } else {
          // Keep predicting position for temporary occlusions.
          const predictedTrack = {
            ...track,
            x: track.x + track.velocity.dx * 0.65,
            y: track.y + track.velocity.dy * 0.65,
            smoothedConfidence: track.smoothedConfidence * (trackIsLocked ? 0.95 : 0.88),
          };
          tracks.set(trackId, predictedTrack);
          
          // Continue rendering predicted objects for lock reacquisition.
          if (trackingActive && trackIsLocked && predictedTrack.smoothedConfidence > 45) {
            if (
              predictedTrack.x < -predictedTrack.width ||
              predictedTrack.y < -predictedTrack.height ||
              predictedTrack.x > videoDimensions.width ||
              predictedTrack.y > videoDimensions.height
            ) {
              return;
            }
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
              areaRatio: predictedTrack.areaRatio,
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

      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = "Camera access requires HTTPS or localhost. Your browser may block getUserMedia on insecure connections.";
        setWebcamError(msg);
        toast.error(msg);
        return;
      }
      
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
    setLockedTargets(new Set());
    setVideoReady(false);
  };

  // Ref for motion detection fallback
  const prevFrameRef = useRef<ImageData | null>(null);
  
  // Fallback motion detection when ML model is not available
  const runMotionDetection = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement): Array<{label: string, confidence: number, bbox: number[]}> => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const prevFrame = prevFrameRef.current;
    
    const detections: Array<{label: string, confidence: number, bbox: number[]}> = [];
    
    if (prevFrame && prevFrame.width === currentFrame.width) {
      const threshold = 30;
      const minArea = 500;
      
      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      let motionPixels = 0;
      
      for (let i = 0; i < currentFrame.data.length; i += 4) {
        const diff = Math.abs(currentFrame.data[i] - prevFrame.data[i]) + 
                     Math.abs(currentFrame.data[i+1] - prevFrame.data[i+1]) + 
                     Math.abs(currentFrame.data[i+2] - prevFrame.data[i+2]);
        
        if (diff > threshold * 3) {
          const pixelIndex = i / 4;
          const x = pixelIndex % currentFrame.width;
          const y = Math.floor(pixelIndex / currentFrame.width);
          
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          motionPixels++;
        }
      }
      
      if (motionPixels > minArea && minX < Infinity) {
        const padding = 20;
        const x = Math.max(0, minX - padding);
        const y = Math.max(0, minY - padding);
        const w = Math.min(currentFrame.width - x, maxX - minX + padding * 2);
        const h = Math.min(currentFrame.height - y, maxY - minY + padding * 2);
        
        const aspectRatio = w / h;
        let label = "unknown";
        let confidence = 0.5;
        
        if (aspectRatio < 0.8 && h > 80) {
          label = "person";
          confidence = 0.6;
        } else if (aspectRatio > 1.2 && w > 100) {
          label = "car";
          confidence = 0.55;
        }
        
        detections.push({ label, confidence, bbox: [x, y, w, h] });
      }
    }
    
    prevFrameRef.current = currentFrame;
    return detections;
  }, []);
  
  // ML-based object detection using COCO-SSD with fallback
  const runDetection = useCallback(async () => {
    if (!videoRef.current || !isDetecting) return;
    
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.readyState < 2) return;
    
    let mlDetections: Array<{label: string, confidence: number, bbox: number[]}> = [];
    
    // Use ML model if available, otherwise fall back to motion detection
    if (modelRef.current) {
      try {
        const predictions = await modelRef.current.detect(video);
        mlDetections = predictions.map(p => ({
          label: p.class,
          confidence: p.score,
          bbox: p.bbox
        }));
      } catch (error) {
        console.error("ML detection error, falling back to motion:", error);
        if (canvasRef.current) {
          mlDetections = runMotionDetection(video, canvasRef.current);
        }
      }
    } else if (canvasRef.current) {
      // Fallback to motion detection when model not loaded
      mlDetections = runMotionDetection(video, canvasRef.current);
    }
    
    // Run multi-object tracking assignment
    const trackedResults = assignDetectionsToTracks(
      mlDetections, 
      trackedObjectsRef.current
    );
    
    setDetectedObjects(trackedResults);
  }, [isDetecting, assignDetectionsToTracks, runMotionDetection]);

  // Setup video and detection when webcam starts
  useEffect(() => {
    if (videoRef.current && webcamStream) {
      videoRef.current.srcObject = webcamStream;
      
      const updateDimensions = () => {
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          setVideoReady(true);
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

  useEffect(() => {
    if (webcamStream) return;
    setDetectedObjects([]);
    trackedObjectsRef.current.clear();
    setLockedTargets(new Set());
    setVideoReady(false);
  }, [webcamStream]);

  // Run detection loop
  useEffect(() => {
    if (isDetecting && webcamStream) {
      detectionIntervalRef.current = setInterval(runDetection, 200);
    } else if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      setDetectedObjects([]);
      if (!trackingActive) {
        trackedObjectsRef.current.clear();
      }
    }
    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    };
  }, [isDetecting, webcamStream, runDetection, trackingActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopWebcam();
  }, []);

  const filteredObjects = detectedObjects
    .filter((obj) => targetType === "all" || obj.type === targetType)
    .filter((obj) => {
      // Preserve lock continuity even when confidence dips temporarily.
      if (lockedTargets.has(obj.id)) return true;
      const sizeBoost = obj.areaRatio && obj.areaRatio < 0.01 ? 8 : 0;
      const temporalBoost = Math.min(12, obj.framesSeen * 1.1);
      return obj.confidence + sizeBoost + temporalBoost >= confidenceThreshold[0];
    });

  // Publish tracking state for downstream control/stabilization logic.
  useEffect(() => {
    const lockedCandidates = filteredObjects.filter((obj) => lockedTargets.has(obj.id));
    const lockedTarget = lockedCandidates.sort(
      (a, b) =>
        (b.confidence + b.framesSeen * 0.8 + (b.areaRatio || 0) * 100) -
        (a.confidence + a.framesSeen * 0.8 + (a.areaRatio || 0) * 100),
    )[0];
    const targetOffsetX = lockedTarget
      ? ((lockedTarget.x + lockedTarget.width / 2) / videoDimensions.width - 0.5) * 2
      : undefined;
    const targetOffsetY = lockedTarget
      ? ((lockedTarget.y + lockedTarget.height / 2) / videoDimensions.height - 0.5) * 2
      : undefined;
    const targetSizeRatio = lockedTarget?.areaRatio ?? 0;
    const targetDistanceMeters =
      targetSizeRatio > 0 ? Math.max(2, Math.min(120, 0.8 / Math.sqrt(targetSizeRatio))) : undefined;
    const desiredDistanceMeters = followDistance[0];

    window.dispatchEvent(
      new CustomEvent("tracking-update", {
        detail: {
          trackingActive,
          lockedCount: lockedTargets.size,
          targetOffsetX,
          targetOffsetY,
          targetSizeRatio,
          targetDistanceMeters,
          desiredDistanceMeters,
          confidence: lockedTarget?.confidence ?? null,
        },
      }),
    );
  }, [trackingActive, lockedTargets, filteredObjects, videoDimensions.width, videoDimensions.height, followDistance]);

  // Publish simple obstacle avoidance hints from camera detections.
  useEffect(() => {
    if (!isDetecting || filteredObjects.length === 0) {
      window.dispatchEvent(
        new CustomEvent("obstacle-update", {
          detail: { riskLevel: "none", avoidanceYaw: 0, avoidanceForward: 0, avoidanceLateral: 0 },
        }),
      );
      return;
    }

    const centerX = videoDimensions.width / 2;
    const centerY = videoDimensions.height / 2;
    let highestRisk = 0;
    let bestAvoidance = { yaw: 0, forward: 0, lateral: 0 };

    for (const obj of filteredObjects) {
      const objCx = obj.x + obj.width / 2;
      const objCy = obj.y + obj.height / 2;
      const normX = (objCx - centerX) / Math.max(1, centerX);
      const normY = (objCy - centerY) / Math.max(1, centerY);
      const areaRatio = obj.areaRatio ?? (obj.width * obj.height) / Math.max(1, videoDimensions.width * videoDimensions.height);
      const centeredness = Math.max(0, 1 - Math.hypot(normX, normY));
      const confidenceFactor = Math.max(0.25, Math.min(1, obj.confidence / 100));
      const risk = Math.max(0, Math.min(1, areaRatio * 2.7 * centeredness * confidenceFactor));

      if (risk > highestRisk) {
        highestRisk = risk;
        bestAvoidance = {
          yaw: clamp(normX > 0 ? -risk : risk, -1, 1),
          forward: clamp(-risk, -1, 0),
          lateral: clamp(normX > 0 ? -risk : risk, -1, 1),
        };
      }
    }

    const riskLevel = highestRisk > 0.55 ? "high" : highestRisk > 0.3 ? "medium" : highestRisk > 0.12 ? "low" : "none";
    window.dispatchEvent(
      new CustomEvent("obstacle-update", {
        detail: {
          riskLevel,
          avoidanceYaw: bestAvoidance.yaw,
          avoidanceForward: bestAvoidance.forward,
          avoidanceLateral: bestAvoidance.lateral,
        },
      }),
    );
  }, [filteredObjects, videoDimensions.width, videoDimensions.height, isDetecting]);

  // Publish potential emergency landing zone quality inferred from camera detections.
  useEffect(() => {
    if (!isDetecting || !videoReady) {
      window.dispatchEvent(
        new CustomEvent("landing-zone-update", {
          detail: { safe: false, clearScore: 0, blockedBy: ["camera_offline"], roadRisk: "unknown" },
        }),
      );
      return;
    }

    const zoneX = videoDimensions.width * 0.3;
    const zoneY = videoDimensions.height * 0.3;
    const zoneW = videoDimensions.width * 0.4;
    const zoneH = videoDimensions.height * 0.4;
    const zoneArea = Math.max(1, zoneW * zoneH);

    const blockedBy: string[] = [];
    let occupiedArea = 0;
    let roadRiskScore = 0;

    for (const obj of filteredObjects) {
      const interLeft = Math.max(zoneX, obj.x);
      const interTop = Math.max(zoneY, obj.y);
      const interRight = Math.min(zoneX + zoneW, obj.x + obj.width);
      const interBottom = Math.min(zoneY + zoneH, obj.y + obj.height);
      const interW = Math.max(0, interRight - interLeft);
      const interH = Math.max(0, interBottom - interTop);
      const overlap = interW * interH;
      if (overlap <= 0) continue;

      occupiedArea += overlap;
      if (obj.type === "person") blockedBy.push("person");
      if (obj.type === "vehicle") {
        blockedBy.push("vehicle");
        roadRiskScore += overlap / zoneArea;
      }
      if (obj.type === "unknown") blockedBy.push("unknown_object");
    }

    const clearScore = clamp(1 - occupiedArea / zoneArea, 0, 1);
    const safe = clearScore >= 0.72 && blockedBy.length === 0;
    const roadRisk = roadRiskScore > 0.18 ? "high" : roadRiskScore > 0.06 ? "medium" : "low";

    window.dispatchEvent(
      new CustomEvent("landing-zone-update", {
        detail: {
          safe,
          clearScore,
          blockedBy: Array.from(new Set(blockedBy)),
          roadRisk,
        },
      }),
    );
  }, [filteredObjects, isDetecting, videoReady, videoDimensions.width, videoDimensions.height]);

  const parsePlate = (text: string) => {
    const sanitized = text
      .toUpperCase()
      .replace(/[^A-Z0-9- ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const matches = sanitized.match(/[A-Z0-9-]{4,10}/g);
    return matches?.[0] ?? null;
  };

  const savePlateRecord = (plateText: string, confidence: number, targetId: string) => {
    const normalized = parsePlate(plateText);
    if (!normalized) return;
    setPlateRecords((prev) => {
      const existingIdx = prev.findIndex((r) => r.plateText === normalized);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], confidence: Math.max(copy[existingIdx].confidence, confidence), timestamp: Date.now(), targetId };
        return copy.sort((a, b) => b.timestamp - a.timestamp);
      }
      return [
        {
          id: `plate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          plateText: normalized,
          confidence,
          targetId,
          timestamp: Date.now(),
        },
        ...prev,
      ].slice(0, 200);
    });
  };

  // Local plate scan: uses on-device OCR engine if one is already available in-browser.
  const attemptLockedVehiclePlateScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !plateScanEnabled || !trackingActive) return;
    const now = Date.now();
    if (now - lastPlateScanAtRef.current < 2500) return;
    lastPlateScanAtRef.current = now;

    const lockedVehicles = filteredObjects.filter(
      (obj) => lockedTargets.has(obj.id) && obj.type === "vehicle",
    );
    if (lockedVehicles.length === 0) return;
    const primary = lockedVehicles.sort((a, b) => b.confidence - a.confidence)[0];

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const px = Math.max(0, Math.floor(primary.x + primary.width * 0.2));
    const py = Math.max(0, Math.floor(primary.y + primary.height * 0.58));
    const pw = Math.max(40, Math.floor(primary.width * 0.6));
    const ph = Math.max(18, Math.floor(primary.height * 0.24));
    const crop = ctx.getImageData(
      px,
      py,
      Math.min(pw, canvas.width - px),
      Math.min(ph, canvas.height - py),
    );

    const ocrEngine = (window as any).Tesseract;
    if (ocrEngine?.recognize) {
      try {
        const result = await ocrEngine.recognize(crop, "eng");
        const text = result?.data?.text || "";
        const plate = parsePlate(text);
        if (plate) {
          savePlateRecord(plate, Math.round(primary.confidence), primary.id);
          toast.success(`Plate captured: ${plate}`);
        }
      } catch {
        // Keep silent to avoid toast flooding when OCR engine is absent or busy.
      }
    }
  }, [filteredObjects, lockedTargets, plateScanEnabled, trackingActive]);

  useEffect(() => {
    void attemptLockedVehiclePlateScan();
  }, [attemptLockedVehiclePlateScan, filteredObjects]);

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


  const handleStartTracking = async () => {
    if (lockedTargets.size === 0) {
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

  const saveManualPlate = () => {
    const plate = parsePlate(manualPlateText);
    if (!plate) {
      toast.error("Enter a valid plate format (letters/numbers)");
      return;
    }
    savePlateRecord(plate, 100, "manual");
    setManualPlateText("");
    toast.success(`Saved plate ${plate}`);
  };

  const deletePlate = (id: string) => {
    setPlateRecords((prev) => prev.filter((p) => p.id !== id));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "vehicle": return <Car className="h-4 w-4" />;
      case "person": return <Users className="h-4 w-4" />;
      case "package": return <Box className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  // Show permission denied if user doesn't have access
  if (!canTrack) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access object tracking.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

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
            
            {lockedTargets.size > 0 && (
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
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Target Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-xs text-muted-foreground">
              Lock a target from detected objects below. Start the camera and enable detection to identify and track objects in real-time.
            </p>
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

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ScanText className="h-4 w-4" />
              License Plate Capture (Local)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-xs">Auto-scan locked vehicles</Label>
              <Switch checked={plateScanEnabled} onCheckedChange={setPlateScanEnabled} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Runs on-device. If a local OCR engine is available, captures are automatic. You can always save plates manually below.
            </p>
            <div className="flex gap-2">
              <Input
                value={manualPlateText}
                onChange={(e) => setManualPlateText(e.target.value)}
                placeholder="Manual plate entry"
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === "Enter" && saveManualPlate()}
              />
              <Button size="sm" className="h-8" onClick={saveManualPlate}>
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {plateRecords.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">No saved plates.</div>
              ) : (
                plateRecords.slice(0, 30).map((record) => (
                  <div key={record.id} className="flex items-center justify-between text-xs bg-muted/40 border border-border rounded px-2 py-1">
                    <div>
                      <span className="font-mono font-semibold">{record.plateText}</span>
                      <span className="ml-2 text-muted-foreground">{new Date(record.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deletePlate(record.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

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
      </div>

      {/* Right Panel - Camera View */}
      <div className="flex-1 relative">
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
                {videoReady && isDetecting && filteredObjects.map((obj) => (
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
                  {modelLoaded ? (
                    <Badge className="bg-blue-500">
                      <Zap className="h-3 w-3 mr-1" />
                      AI Active
                    </Badge>
                  ) : !modelLoading && (
                    <Badge className="bg-gray-600">
                      Motion Mode
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
      </div>
    </div>
  );
}
