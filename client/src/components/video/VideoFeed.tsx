import { useState, useRef, useEffect, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2, Eye, EyeOff, Flame, ZoomIn, ZoomOut, RotateCcw, Camera, Video, Laptop, Settings2, Crosshair, Move, Upload, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import aerialImg from "@assets/generated_images/aerial_drone_view_of_a_suburban_street_with_overlaid_bounding_boxes.png";
import fpvImg from "@assets/generated_images/fpv_drone_view_forward_facing_with_horizon.png";

interface CameraConfig {
  model: string;
  resolution: string;
  thermalResolution: string;
  lens: string;
  streamUrl: string;
  streamEnabled: boolean;
}

interface DetectedObject {
  id: string;
  type: "person" | "vehicle" | "animal" | "aircraft" | "unknown";
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isLocked: boolean;
  isMoving: boolean;
  velocity: { vx: number; vy: number };
  colorSignature: number[];
  framesSeen: number;
  lastPredictedPos: { x: number; y: number };
}

interface TrackedObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  lastSeen: number;
  framesSeen: number;
  colorSignature: number[];
  isLocked: boolean;
  isMoving: boolean;
  type: "person" | "vehicle" | "animal" | "aircraft" | "unknown";
  confidence: number;
}

const defaultCameraConfig: CameraConfig = {
  model: "Skydroid C12",
  resolution: "2K HD (2560x1440)",
  thermalResolution: "384x288",
  lens: "7mm",
  streamUrl: "",
  streamEnabled: false
};

export function VideoFeed() {
  const [isMain, setIsMain] = useState(false);
  const [visible, setVisible] = useState(true);
  const [activeCam, setActiveCam] = useState<'gimbal' | 'thermal' | 'fpv' | 'webcam' | 'stream'>('gimbal');
  const [thermalMode, setThermalMode] = useState(false);
  const [zoom, setZoom] = useState([1]);
  const [showControls, setShowControls] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(() => {
    const saved = localStorage.getItem('mouse_camera_config');
    return saved ? JSON.parse(saved) : defaultCameraConfig;
  });
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [streamUrl, setStreamUrl] = useState(cameraConfig.streamUrl);
  
  // Draggable position state - bottom-left corner by default
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('mouse_camera_position');
    return saved ? JSON.parse(saved) : { x: 16, y: 220 };
  });
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [panelDragStart, setPanelDragStart] = useState({ x: 0, y: 0 });
  
  // Recording state
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const backgroundModelRef = useRef<Float32Array | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trackedObjectsRef = useRef<Map<string, TrackedObject>>(new Map());
  const objectIdCounterRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedObjectIdRef = useRef<string | null>(null);
  const frameCountRef = useRef(0);
  const globalMotionRef = useRef({ dx: 0, dy: 0 });
  const lastMappingSyncRef = useRef(0);
  
  useEffect(() => {
    localStorage.setItem('mouse_camera_config', JSON.stringify(cameraConfig));
  }, [cameraConfig]);

  useEffect(() => {
    localStorage.setItem('mouse_camera_position', JSON.stringify(position));
  }, [position]);

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
          const nextWidth = videoRef.current.videoWidth;
          const nextHeight = videoRef.current.videoHeight;
          setVideoDimensions((prev) => {
            if (prev.width === nextWidth && prev.height === nextHeight) {
              return prev;
            }
            return {
              width: nextWidth,
              height: nextHeight,
            };
          });
        }
      };
      
      videoRef.current.onloadedmetadata = updateDimensions;
      videoRef.current.onresize = updateDimensions;
      return () => {
        if (videoRef.current) {
          videoRef.current.onloadedmetadata = null;
          videoRef.current.onresize = null;
        }
      };
    }
  }, [webcamStream]);

  // Advanced object detection for webcam
  useEffect(() => {
    if (isDetecting && webcamStream && activeCam === 'webcam') {
      // Reset background model when starting detection
      backgroundModelRef.current = null;
      frameCountRef.current = 0;
      
      detectionIntervalRef.current = setInterval(() => {
        detectObjects();
      }, 150); // Faster detection rate for smoother tracking
      
      return () => {
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
      };
    }
  }, [isDetecting, webcamStream, activeCam]);

  // Recording duration timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingDuration(0);
    }
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  // Calculate color histogram for an image region (for object re-identification)
  const calculateColorHistogram = (imageData: ImageData, x: number, y: number, w: number, h: number): number[] => {
    const histogram = new Array(48).fill(0); // 16 bins per channel (R, G, B)
    const data = imageData.data;
    const width = imageData.width;
    let pixelCount = 0;
    
    for (let py = Math.max(0, y); py < Math.min(imageData.height, y + h); py += 4) {
      for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 4) {
        const i = (py * width + px) * 4;
        histogram[Math.floor(data[i] / 16)] += 1;
        histogram[16 + Math.floor(data[i + 1] / 16)] += 1;
        histogram[32 + Math.floor(data[i + 2] / 16)] += 1;
        pixelCount++;
      }
    }
    
    // Normalize
    if (pixelCount > 0) {
      for (let i = 0; i < histogram.length; i++) {
        histogram[i] /= pixelCount;
      }
    }
    return histogram;
  };

  // Compare two color histograms (returns similarity 0-1)
  const compareHistograms = (h1: number[], h2: number[]): number => {
    if (!h1.length || !h2.length || h1.length !== h2.length) return 0;
    let similarity = 0;
    for (let i = 0; i < h1.length; i++) {
      similarity += Math.min(h1[i], h2[i]);
    }
    return Math.min(1, similarity);
  };

  // Calculate IoU (Intersection over Union) between two boxes
  const calculateIoU = (box1: {x: number, y: number, w: number, h: number}, 
                        box2: {x: number, y: number, w: number, h: number}): number => {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.w, box2.x + box2.w);
    const y2 = Math.min(box1.y + box1.h, box2.y + box2.h);
    
    if (x2 <= x1 || y2 <= y1) return 0;
    
    const intersection = (x2 - x1) * (y2 - y1);
    const union = box1.w * box1.h + box2.w * box2.h - intersection;
    return intersection / union;
  };

  // Estimate global camera motion between frames
  const estimateGlobalMotion = (prev: ImageData, curr: ImageData): { dx: number; dy: number } => {
    const width = curr.width;
    const height = curr.height;
    const sampleSize = 8;
    const blockSize = 32;
    const searchRange = 16;
    
    let totalDx = 0, totalDy = 0, validBlocks = 0;
    
    // Sample blocks across the frame
    for (let by = 0; by < sampleSize; by++) {
      for (let bx = 0; bx < sampleSize; bx++) {
        const startX = Math.floor((width - blockSize) * bx / (sampleSize - 1));
        const startY = Math.floor((height - blockSize) * by / (sampleSize - 1));
        
        let bestDx = 0, bestDy = 0, minSAD = Infinity;
        
        // Search for best match
        for (let dy = -searchRange; dy <= searchRange; dy += 4) {
          for (let dx = -searchRange; dx <= searchRange; dx += 4) {
            const searchX = startX + dx;
            const searchY = startY + dy;
            
            if (searchX < 0 || searchY < 0 || searchX + blockSize > width || searchY + blockSize > height) continue;
            
            let sad = 0;
            for (let py = 0; py < blockSize; py += 8) {
              for (let px = 0; px < blockSize; px += 8) {
                const prevI = ((startY + py) * width + startX + px) * 4;
                const currI = ((searchY + py) * width + searchX + px) * 4;
                sad += Math.abs(prev.data[prevI] - curr.data[currI]);
              }
            }
            
            if (sad < minSAD) {
              minSAD = sad;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
        
        if (minSAD < 5000) {
          totalDx += bestDx;
          totalDy += bestDy;
          validBlocks++;
        }
      }
    }
    
    return validBlocks > 0 ? { dx: totalDx / validBlocks, dy: totalDy / validBlocks } : { dx: 0, dy: 0 };
  };

  // Enhanced object detection using edge detection + motion + background subtraction
  const detectObjects = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const width = currentFrame.width;
    const height = currentFrame.height;
    frameCountRef.current++;
    
    // Initialize or update background model (for static object detection)
    if (!backgroundModelRef.current) {
      backgroundModelRef.current = new Float32Array(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        backgroundModelRef.current[i * 3] = currentFrame.data[i * 4];
        backgroundModelRef.current[i * 3 + 1] = currentFrame.data[i * 4 + 1];
        backgroundModelRef.current[i * 3 + 2] = currentFrame.data[i * 4 + 2];
      }
    }
    
    const bgModel = backgroundModelRef.current;
    const learningRate = 0.02;
    
    // Estimate global camera motion for motion compensation
    if (prevFrameRef.current) {
      globalMotionRef.current = estimateGlobalMotion(prevFrameRef.current, currentFrame);
    }
    
    // Multi-scale detection with different block sizes for various distances
    const scales = [
      { blockSize: 8, minArea: 100, label: 'far' },      // Far objects (100+ feet)
      { blockSize: 16, minArea: 400, label: 'medium' },  // Medium distance (30-100 feet)
      { blockSize: 32, minArea: 1600, label: 'near' }    // Near objects (10-30 feet)
    ];
    
    const allRegions: { x: number; y: number; w: number; h: number; isMoving: boolean; scale: string }[] = [];
    
    for (const scale of scales) {
      const { blockSize, minArea } = scale;
      const foregroundMask = new Uint8Array(Math.ceil(width / blockSize) * Math.ceil(height / blockSize));
      const motionMask = new Uint8Array(foregroundMask.length);
      
      // Process blocks
      for (let by = 0; by < height; by += blockSize) {
        for (let bx = 0; bx < width; bx += blockSize) {
          let bgDiff = 0, motionDiff = 0, edgeStrength = 0;
          let pixelCount = 0;
          
          for (let py = by; py < Math.min(by + blockSize, height); py += 2) {
            for (let px = bx; px < Math.min(bx + blockSize, width); px += 2) {
              const i = py * width + px;
              const di = i * 4;
              const bi = i * 3;
              
              // Background subtraction (detects both static and moving foreground objects)
              bgDiff += Math.abs(currentFrame.data[di] - bgModel[bi]) +
                       Math.abs(currentFrame.data[di + 1] - bgModel[bi + 1]) +
                       Math.abs(currentFrame.data[di + 2] - bgModel[bi + 2]);
              
              // Motion detection (with global motion compensation)
              if (prevFrameRef.current) {
                const compX = Math.round(px - globalMotionRef.current.dx);
                const compY = Math.round(py - globalMotionRef.current.dy);
                if (compX >= 0 && compX < width && compY >= 0 && compY < height) {
                  const prevI = (compY * width + compX) * 4;
                  motionDiff += Math.abs(currentFrame.data[di] - prevFrameRef.current.data[prevI]) +
                               Math.abs(currentFrame.data[di + 1] - prevFrameRef.current.data[prevI + 1]) +
                               Math.abs(currentFrame.data[di + 2] - prevFrameRef.current.data[prevI + 2]);
                }
              }
              
              // Edge detection (Sobel-like for object boundaries)
              if (px > 0 && px < width - 1 && py > 0 && py < height - 1) {
                const gx = Math.abs(currentFrame.data[(py * width + px + 1) * 4] - currentFrame.data[(py * width + px - 1) * 4]);
                const gy = Math.abs(currentFrame.data[((py + 1) * width + px) * 4] - currentFrame.data[((py - 1) * width + px) * 4]);
                edgeStrength += gx + gy;
              }
              
              pixelCount++;
            }
          }
          
          const blockIdx = Math.floor(by / blockSize) * Math.ceil(width / blockSize) + Math.floor(bx / blockSize);
          const avgBgDiff = bgDiff / pixelCount;
          const avgMotionDiff = motionDiff / pixelCount;
          const avgEdge = edgeStrength / pixelCount;
          
          // Mark as foreground if significantly different from background OR has strong edges
          if (avgBgDiff > 60 || avgEdge > 40) {
            foregroundMask[blockIdx] = 1;
          }
          
          // Mark as moving if there's local motion after compensating for camera movement
          if (avgMotionDiff > 50) {
            motionMask[blockIdx] = 1;
          }
          
          // Update background model only for non-foreground regions
          if (avgBgDiff < 30) {
            for (let py = by; py < Math.min(by + blockSize, height); py += 4) {
              for (let px = bx; px < Math.min(bx + blockSize, width); px += 4) {
                const i = py * width + px;
                const di = i * 4;
                const bi = i * 3;
                bgModel[bi] = bgModel[bi] * (1 - learningRate) + currentFrame.data[di] * learningRate;
                bgModel[bi + 1] = bgModel[bi + 1] * (1 - learningRate) + currentFrame.data[di + 1] * learningRate;
                bgModel[bi + 2] = bgModel[bi + 2] * (1 - learningRate) + currentFrame.data[di + 2] * learningRate;
              }
            }
          }
        }
      }
      
      // Connected component labeling to find object regions
      const blocksW = Math.ceil(width / blockSize);
      const blocksH = Math.ceil(height / blockSize);
      const labels = new Int32Array(foregroundMask.length);
      let currentLabel = 0;
      
      const floodFill = (startIdx: number, label: number): { minX: number; minY: number; maxX: number; maxY: number; hasMotion: boolean } => {
        const stack = [startIdx];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasMotion = false;
        
        while (stack.length > 0) {
          const idx = stack.pop()!;
          if (labels[idx] !== 0 || foregroundMask[idx] === 0) continue;
          
          labels[idx] = label;
          const bx = idx % blocksW;
          const by = Math.floor(idx / blocksW);
          minX = Math.min(minX, bx * blockSize);
          minY = Math.min(minY, by * blockSize);
          maxX = Math.max(maxX, (bx + 1) * blockSize);
          maxY = Math.max(maxY, (by + 1) * blockSize);
          if (motionMask[idx]) hasMotion = true;
          
          // 8-connectivity
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = bx + dx, ny = by + dy;
              if (nx >= 0 && nx < blocksW && ny >= 0 && ny < blocksH) {
                const nIdx = ny * blocksW + nx;
                if (foregroundMask[nIdx] === 1 && labels[nIdx] === 0) {
                  stack.push(nIdx);
                }
              }
            }
          }
        }
        
        return { minX, minY, maxX, maxY, hasMotion };
      };
      
      // Find all regions
      for (let i = 0; i < foregroundMask.length; i++) {
        if (foregroundMask[i] === 1 && labels[i] === 0) {
          currentLabel++;
          const region = floodFill(i, currentLabel);
          const area = (region.maxX - region.minX) * (region.maxY - region.minY);
          
          if (area >= minArea && region.maxX - region.minX >= 15 && region.maxY - region.minY >= 15) {
            allRegions.push({
              x: region.minX,
              y: region.minY,
              w: region.maxX - region.minX,
              h: region.maxY - region.minY,
              isMoving: region.hasMotion,
              scale: scale.label
            });
          }
        }
      }
    }
    
    // Merge overlapping regions from different scales
    const mergedRegions = mergeOverlappingRegions(allRegions);
    
    // Track and classify objects
    const objects = trackAndClassifyObjects(mergedRegions, currentFrame);
    setDetectedObjects(objects);
    window.dispatchEvent(
      new CustomEvent("visual-odometry-update", {
        detail: {
          dx: globalMotionRef.current.dx,
          dy: globalMotionRef.current.dy,
          confidence: Math.min(1, Math.max(0, objects.length / 6)),
          frameWidth: width,
          frameHeight: height,
          timestamp: Date.now(),
        },
      }),
    );

    if (objects.length > 0) {
      const centerX = width / 2;
      const centerY = height / 2;
      let highestRisk = 0;
      let avoidance = { yaw: 0, forward: 0, lateral: 0 };

      for (const obj of objects) {
        const objCx = obj.x + obj.width / 2;
        const objCy = obj.y + obj.height / 2;
        const normX = (objCx - centerX) / Math.max(1, centerX);
        const normY = (objCy - centerY) / Math.max(1, centerY);
        const areaRatio = (obj.width * obj.height) / Math.max(1, width * height);
        const centeredness = Math.max(0, 1 - Math.hypot(normX, normY));
        const confidenceFactor = Math.max(0.25, Math.min(1, obj.confidence / 100));
        const risk = Math.max(0, Math.min(1, areaRatio * 2.8 * centeredness * confidenceFactor));

        if (risk > highestRisk) {
          highestRisk = risk;
          avoidance = {
            yaw: Math.max(-1, Math.min(1, normX > 0 ? -risk : risk)),
            forward: Math.max(-1, Math.min(0, -risk)),
            lateral: Math.max(-1, Math.min(1, normX > 0 ? -risk : risk)),
          };
        }
      }

      const riskLevel = highestRisk > 0.55 ? "high" : highestRisk > 0.3 ? "medium" : highestRisk > 0.12 ? "low" : "none";
      window.dispatchEvent(
        new CustomEvent("obstacle-update", {
          detail: {
            riskLevel,
            avoidanceYaw: avoidance.yaw,
            avoidanceForward: avoidance.forward,
            avoidanceLateral: avoidance.lateral,
          },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("obstacle-update", {
          detail: { riskLevel: "none", avoidanceYaw: 0, avoidanceForward: 0, avoidanceLateral: 0 },
        }),
      );
    }

    const now = Date.now();
    if (now - lastMappingSyncRef.current > 1000) {
      lastMappingSyncRef.current = now;
      void fetch("/api/mapping/3d/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: now,
          cameraMode: activeCam,
          thermalMode,
          frameWidth: width,
          frameHeight: height,
          odometry: {
            dx: globalMotionRef.current.dx,
            dy: globalMotionRef.current.dy,
            confidence: Math.min(1, Math.max(0.05, objects.length / 8)),
          },
          detections: objects.map((obj) => ({
            id: obj.id,
            type: obj.type,
            confidence: obj.confidence,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            height: obj.height,
            isMoving: obj.isMoving,
          })),
        }),
      }).catch(() => {
        // Mapping backend can be offline; video feed should continue.
      });
    }
    
    prevFrameRef.current = currentFrame;
  };

  // Merge overlapping regions from multi-scale detection
  const mergeOverlappingRegions = (regions: { x: number; y: number; w: number; h: number; isMoving: boolean; scale: string }[]) => {
    if (regions.length === 0) return [];
    
    const merged: typeof regions = [];
    const used = new Set<number>();
    
    for (let i = 0; i < regions.length; i++) {
      if (used.has(i)) continue;
      
      let current = { ...regions[i] };
      used.add(i);
      
      // Find and merge overlapping regions
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = 0; j < regions.length; j++) {
          if (used.has(j)) continue;
          
          const iou = calculateIoU(
            { x: current.x, y: current.y, w: current.w, h: current.h },
            { x: regions[j].x, y: regions[j].y, w: regions[j].w, h: regions[j].h }
          );
          
          if (iou > 0.3) {
            // Merge by taking bounding box
            const minX = Math.min(current.x, regions[j].x);
            const minY = Math.min(current.y, regions[j].y);
            const maxX = Math.max(current.x + current.w, regions[j].x + regions[j].w);
            const maxY = Math.max(current.y + current.h, regions[j].y + regions[j].h);
            current = {
              x: minX,
              y: minY,
              w: maxX - minX,
              h: maxY - minY,
              isMoving: current.isMoving || regions[j].isMoving,
              scale: current.scale
            };
            used.add(j);
            changed = true;
          }
        }
      }
      
      merged.push(current);
    }
    
    return merged;
  };

  // Advanced object tracking with prediction and re-identification
  const trackAndClassifyObjects = (
    regions: { x: number; y: number; w: number; h: number; isMoving: boolean; scale: string }[],
    currentFrame: ImageData
  ): DetectedObject[] => {
    const now = Date.now();
    const trackedObjects = trackedObjectsRef.current;
    const lockedId = lockedObjectIdRef.current;
    
    // Update tracked objects with prediction (Kalman-like)
    trackedObjects.forEach((obj, id) => {
      // Predict new position based on velocity
      obj.x += obj.vx;
      obj.y += obj.vy;
      
      // Compensate for camera motion
      obj.x -= globalMotionRef.current.dx;
      obj.y -= globalMotionRef.current.dy;
    });
    
    // Match regions to existing tracked objects
    const matchedRegions = new Set<number>();
    const matchedObjects = new Set<string>();
    
    // Priority matching for locked object
    if (lockedId && trackedObjects.has(lockedId)) {
      const locked = trackedObjects.get(lockedId)!;
      let bestIdx = -1;
      let bestScore = 0;
      
      for (let i = 0; i < regions.length; i++) {
        const r = regions[i];
        const iou = calculateIoU(
          { x: locked.x, y: locked.y, w: locked.width, h: locked.height },
          { x: r.x, y: r.y, w: r.w, h: r.h }
        );
        const colorSim = compareHistograms(
          locked.colorSignature,
          calculateColorHistogram(currentFrame, r.x, r.y, r.w, r.h)
        );
        const score = iou * 0.6 + colorSim * 0.4;
        
        if (score > bestScore && score > 0.25) {
          bestScore = score;
          bestIdx = i;
        }
      }
      
      if (bestIdx >= 0) {
        const r = regions[bestIdx];
        const newVx = (r.x - locked.x) * 0.3 + locked.vx * 0.7;
        const newVy = (r.y - locked.y) * 0.3 + locked.vy * 0.7;
        
        trackedObjects.set(lockedId, {
          ...locked,
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          vx: newVx,
          vy: newVy,
          lastSeen: now,
          framesSeen: locked.framesSeen + 1,
          colorSignature: calculateColorHistogram(currentFrame, r.x, r.y, r.w, r.h),
          isMoving: r.isMoving
        });
        
        matchedRegions.add(bestIdx);
        matchedObjects.add(lockedId);
      }
    }
    
    // Match remaining regions to tracked objects
    for (let i = 0; i < regions.length; i++) {
      if (matchedRegions.has(i)) continue;
      
      const r = regions[i];
      let bestId = "";
      let bestScore = 0;
      
      trackedObjects.forEach((obj, id) => {
        if (matchedObjects.has(id)) return;
        
        const iou = calculateIoU(
          { x: obj.x, y: obj.y, w: obj.width, h: obj.height },
          { x: r.x, y: r.y, w: r.w, h: r.h }
        );
        const colorSim = compareHistograms(
          obj.colorSignature,
          calculateColorHistogram(currentFrame, r.x, r.y, r.w, r.h)
        );
        const score = iou * 0.5 + colorSim * 0.5;
        
        if (score > bestScore && score > 0.2) {
          bestScore = score;
          bestId = id;
        }
      });
      
      if (bestId) {
        const obj = trackedObjects.get(bestId)!;
        const newVx = (r.x - obj.x) * 0.3 + obj.vx * 0.7;
        const newVy = (r.y - obj.y) * 0.3 + obj.vy * 0.7;
        
        trackedObjects.set(bestId, {
          ...obj,
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          vx: newVx,
          vy: newVy,
          lastSeen: now,
          framesSeen: obj.framesSeen + 1,
          colorSignature: calculateColorHistogram(currentFrame, r.x, r.y, r.w, r.h),
          isMoving: r.isMoving
        });
        
        matchedRegions.add(i);
        matchedObjects.add(bestId);
      }
    }
    
    // Create new tracked objects for unmatched regions
    for (let i = 0; i < regions.length; i++) {
      if (matchedRegions.has(i)) continue;
      
      const r = regions[i];
      objectIdCounterRef.current++;
      const newId = `obj_${objectIdCounterRef.current}`;
      const colorSig = calculateColorHistogram(currentFrame, r.x, r.y, r.w, r.h);
      
      // Classify object type based on aspect ratio and size
      const aspectRatio = r.w / r.h;
      const area = r.w * r.h;
      let type: "person" | "vehicle" | "animal" | "aircraft" | "unknown" = "unknown";
      let confidence = 55;
      
      if (aspectRatio > 0.3 && aspectRatio < 0.9 && r.h > 40) {
        type = "person";
        confidence = 70 + Math.min(20, r.h / 10);
      } else if (aspectRatio > 1.3 && area > 2000) {
        type = "vehicle";
        confidence = 65 + Math.min(25, area / 1000);
      } else if (aspectRatio > 0.7 && aspectRatio < 1.5 && area < 1500 && area > 100) {
        type = "animal";
        confidence = 55 + Math.min(20, area / 50);
      } else if (aspectRatio > 1.5 && r.y < currentFrame.height * 0.4) {
        type = "aircraft";
        confidence = 50 + Math.min(20, r.w / 20);
      }
      
      trackedObjects.set(newId, {
        id: newId,
        x: r.x,
        y: r.y,
        width: r.w,
        height: r.h,
        vx: 0,
        vy: 0,
        lastSeen: now,
        framesSeen: 1,
        colorSignature: colorSig,
        isLocked: false,
        isMoving: r.isMoving,
        type,
        confidence
      });
    }
    
    // Remove stale tracked objects (keep locked objects longer)
    trackedObjects.forEach((obj, id) => {
      const timeout = id === lockedId ? 10000 : 3000;
      if (now - obj.lastSeen > timeout) {
        if (id === lockedId) {
          lockedObjectIdRef.current = null;
        }
        trackedObjects.delete(id);
      }
    });
    
    // Convert to DetectedObject array
    const result: DetectedObject[] = [];
    trackedObjects.forEach((obj, id) => {
      const isLocked = id === lockedId;
      const typeColors: Record<string, string> = {
        person: "#22c55e",
        vehicle: "#f59e0b", 
        animal: "#8b5cf6",
        aircraft: "#3b82f6",
        unknown: "#6b7280"
      };
      
      result.push({
        id,
        type: obj.type,
        confidence: Math.min(99, obj.confidence + Math.min(15, obj.framesSeen * 2)),
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        color: isLocked ? "#ef4444" : typeColors[obj.type] || "#6b7280",
        isLocked,
        isMoving: obj.isMoving,
        velocity: { vx: obj.vx, vy: obj.vy },
        colorSignature: obj.colorSignature,
        framesSeen: obj.framesSeen,
        lastPredictedPos: { x: obj.x + obj.vx, y: obj.y + obj.vy }
      });
    });
    
    return result;
  };

  // Lock onto a specific object for persistent tracking
  const lockOnObject = (objectId: string) => {
    if (lockedObjectIdRef.current === objectId) {
      lockedObjectIdRef.current = null;
      toast.info("Object lock released");
    } else {
      lockedObjectIdRef.current = objectId;
      toast.success("Object locked for tracking");
    }
    // Force re-render
    setDetectedObjects(prev => [...prev]);
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

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (zoom[0] > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (isDragging && zoom[0] > 1) {
      const maxPan = (zoom[0] - 1) * 100;
      const newPanX = Math.max(-maxPan, Math.min(maxPan, e.clientX - dragStart.x));
      const newPanY = Math.max(-maxPan, Math.min(maxPan, e.clientY - dragStart.y));
      setPanX(newPanX);
      setPanY(newPanY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Panel dragging handlers
  const handlePanelDragStart = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPanel(true);
    setPanelDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: globalThis.MouseEvent) => {
      if (isDraggingPanel) {
        const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - panelDragStart.x));
        const newY = Math.max(0, Math.min(window.innerHeight - 250, e.clientY - panelDragStart.y));
        setPosition({ x: newX, y: newY });
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDraggingPanel(false);
    };

    if (isDraggingPanel) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDraggingPanel, panelDragStart]);

  // Snapshot functionality
  const handleSnapshot = async () => {
    try {
      let imageData: string | null = null;
      
      if (activeCam === 'webcam' && videoRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0);
          imageData = canvas.toDataURL('image/png');
        }
      } else if (containerRef.current) {
        // For demo views, capture the container
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#fff';
          ctx.font = '24px monospace';
          ctx.fillText(`M.O.U.S.E. GCS Snapshot - ${new Date().toISOString()}`, 50, 100);
          ctx.fillText(`Camera: ${activeCam.toUpperCase()} | Mode: ${thermalMode ? 'THERMAL' : 'NORMAL'}`, 50, 150);
          imageData = canvas.toDataURL('image/png');
        }
      }

      if (imageData) {
        const timestamp = Date.now();
        const filename = `snapshot_${timestamp}.png`;
        const base64Data = imageData.split(',')[1];
        
        // Create download link
        const link = document.createElement('a');
        link.download = `mouse_${filename}`;
        link.href = imageData;
        link.click();
        
        // Get current telemetry for location tagging
        const currentTelemetry = (window as any).__currentTelemetry || {};
        
        // Save to database first
        let driveFileId: string | undefined;
        let driveLink: string | undefined;
        let storagePath: string | undefined;
        let pendingSync = false;
        
        try {
          // Upload to Google Drive
          const driveResponse = await fetch('/api/drive/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: filename,
              mimeType: 'image/png',
              data: base64Data
            })
          });
          
          if (driveResponse.ok) {
            const driveResult = await driveResponse.json();
            driveFileId = driveResult.fileId;
            driveLink = driveResult.webViewLink;
            storagePath = driveResult.storagePath || driveResult.localPath || driveResult.webViewLink;
            pendingSync = Boolean(driveResult.pending);
          }
        } catch {
          // Drive upload failed, continue with database save
          pendingSync = true;
        }
        
        // Save metadata to database
        try {
          await fetch('/api/media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: thermalMode ? 'thermal_photo' : 'photo',
              filename,
              mimeType: 'image/png',
              fileSize: Math.ceil(base64Data.length * 0.75),
              storagePath: storagePath || null,
              driveFileId,
              driveLink,
              latitude: currentTelemetry.latitude || null,
              longitude: currentTelemetry.longitude || null,
              altitude: currentTelemetry.altitude || null,
              heading: currentTelemetry.heading || null,
              cameraMode: activeCam,
              zoomLevel: zoom[0],
              syncStatus: pendingSync ? 'pending' : (storagePath || driveFileId ? 'synced' : 'pending'),
              syncError: pendingSync ? 'Cloud unavailable, queued for retry' : null,
              capturedAt: new Date().toISOString(),
            })
          });
          
          toast.success(driveFileId ? "Snapshot saved to database and Google Drive" : "Snapshot saved to database", {
            description: driveLink ? "Click to view" : undefined,
            action: driveLink ? {
              label: "Open",
              onClick: () => window.open(driveLink, '_blank')
            } : undefined
          });
        } catch {
          toast.success("Snapshot saved locally");
        }
      }
    } catch (error) {
      toast.error("Failed to capture snapshot");
    }
  };

  // Recording functionality
  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      if (activeCam === 'webcam' && webcamStream) {
        try {
          const mediaRecorder = new MediaRecorder(webcamStream, {
            mimeType: 'video/webm;codecs=vp9'
          });
          
          const chunks: Blob[] = [];
          
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };
          
          mediaRecorder.onstop = async () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const timestamp = Date.now();
            const filename = `recording_${timestamp}.webm`;
            const duration = recordingDuration;
            
            // Download locally
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `mouse_${filename}`;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            
            // Get current telemetry for location tagging
            const currentTelemetry = (window as any).__currentTelemetry || {};
            
            // Upload to Google Drive and save to database
            setIsUploading(true);
            try {
              const reader = new FileReader();
              reader.onload = async () => {
                const base64Data = (reader.result as string).split(',')[1];
                let driveFileId: string | undefined;
                let driveLink: string | undefined;
                let storagePath: string | undefined;
                let pendingSync = false;
                
                try {
                  const response = await fetch('/api/drive/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      fileName: filename,
                      mimeType: 'video/webm',
                      data: base64Data
                    })
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    driveFileId = result.fileId;
                    driveLink = result.webViewLink;
                    storagePath = result.storagePath || result.localPath || result.webViewLink;
                    pendingSync = Boolean(result.pending);
                  }
                } catch {
                  // Drive upload failed, continue with database save
                  pendingSync = true;
                }
                
                // Save metadata to database
                try {
                  await fetch('/api/media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: thermalMode ? 'thermal_video' : 'video',
                      filename,
                      mimeType: 'video/webm',
                      fileSize: blob.size,
                      duration,
                      storagePath: storagePath || null,
                      driveFileId,
                      driveLink,
                      latitude: currentTelemetry.latitude || null,
                      longitude: currentTelemetry.longitude || null,
                      altitude: currentTelemetry.altitude || null,
                      heading: currentTelemetry.heading || null,
                      cameraMode: activeCam,
                      zoomLevel: zoom[0],
                      syncStatus: pendingSync ? 'pending' : (storagePath || driveFileId ? 'synced' : 'pending'),
                      syncError: pendingSync ? 'Cloud unavailable, queued for retry' : null,
                      capturedAt: new Date().toISOString(),
                    })
                  });
                  
                  toast.success(driveFileId ? "Recording saved to database and Google Drive" : "Recording saved to database", {
                    description: driveLink ? "Click to view" : undefined,
                    action: driveLink ? {
                      label: "Open",
                      onClick: () => window.open(driveLink, '_blank')
                    } : undefined
                  });
                } catch {
                  toast.success("Recording saved locally");
                } finally {
                  setIsUploading(false);
                }
              };
              reader.onerror = () => {
                toast.success("Recording saved locally");
                setIsUploading(false);
              };
              reader.readAsDataURL(blob);
            } catch {
              toast.success("Recording saved locally");
              setIsUploading(false);
            }
          };
          
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start(1000); // Collect data every second
          setIsRecording(true);
          toast.success("Recording started");
        } catch (error) {
          toast.error("Failed to start recording");
        }
      } else {
        toast.error("Recording requires webcam mode");
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!visible) {
    return (
      <button 
        onClick={() => setVisible(true)}
        className="absolute bottom-4 left-16 z-[100] bg-primary text-primary-foreground px-3 py-2 rounded-lg shadow-lg hover:bg-primary/90 flex items-center gap-2"
        data-testid="button-show-camera"
      >
        <Video className="h-4 w-4" />
        <span className="text-xs font-medium">Show Camera</span>
      </button>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "absolute transition-all duration-300 z-[100] bg-black border-2 border-primary/50 shadow-2xl overflow-hidden group",
        isMain 
          ? "inset-2 sm:inset-4 bottom-32 sm:bottom-52 top-16 right-10 sm:right-84" 
          : "w-48 sm:w-80 h-32 sm:h-48 rounded-lg"
      )}
      style={isMain ? {} : {
        left: position.x,
        top: position.y
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-black/60 backdrop-blur flex items-center justify-between px-2 z-10">
        <div className="text-xs font-mono text-primary flex items-center gap-2">
          {/* Drag handle */}
          {!isMain && (
            <button
              onMouseDown={handlePanelDragStart}
              className="cursor-move p-0.5 hover:text-white text-muted-foreground"
              title="Drag to move"
              data-testid="button-drag-camera"
            >
              <Move className="h-3 w-3" />
            </button>
          )}
          <span className={cn("w-2 h-2 rounded-full", isRecording ? "bg-red-500 animate-pulse" : "bg-red-500")} />
          {isRecording ? (
            <span className="text-red-500">REC {formatDuration(recordingDuration)}</span>
          ) : (
            <span>LIVE</span>
          )}: {
            activeCam === 'gimbal' ? (thermalMode ? 'THERMAL' : cameraConfig.model) : 
            activeCam === 'thermal' ? `THERMAL ${cameraConfig.thermalResolution}` : 
            activeCam === 'webcam' ? 'LAPTOP CAM' : 
            activeCam === 'stream' ? 'RTSP STREAM' : 'FPV'
          }
          {zoom[0] > 1 && <span className="text-amber-500">{zoom[0].toFixed(1)}x</span>}
        </div>
        <div className="flex gap-1">
          <button 
            onClick={() => {
              const cams: typeof activeCam[] = ['gimbal', 'thermal', 'fpv', 'webcam'];
              if (cameraConfig.streamUrl) cams.push('stream');
              const idx = cams.indexOf(activeCam);
              setActiveCam(cams[(idx + 1) % cams.length]);
            }} 
            className="p-1 hover:text-white text-muted-foreground text-[10px] uppercase border border-white/20 rounded px-2"
            title="Switch Camera"
            data-testid="button-switch-cam"
          >
            CAM
          </button>
          <button 
            onClick={() => setActiveCam('webcam')} 
            className={cn("p-1 hover:text-white text-muted-foreground", activeCam === 'webcam' && "text-primary")}
            title="Laptop Camera (Test Mode)"
            data-testid="button-laptop-cam"
          >
            <Laptop className="h-3 w-3" />
          </button>
          <button 
            onClick={() => setThermalMode(!thermalMode)} 
            className={cn("p-1 hover:text-white text-muted-foreground", thermalMode && "text-amber-500")}
            title="Toggle Thermal"
            data-testid="button-thermal-mode"
          >
            <Flame className="h-3 w-3" />
          </button>
          <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
            <DialogTrigger asChild>
              <button 
                className="p-1 hover:text-white text-muted-foreground"
                title="Camera Settings"
                data-testid="button-camera-settings"
              >
                <Settings2 className="h-3 w-3" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-primary">Camera Configuration</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 bg-slate-800 rounded-lg space-y-2">
                  <div className="text-sm font-medium text-white">{cameraConfig.model}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>HD Resolution: {cameraConfig.resolution}</div>
                    <div>Thermal: {cameraConfig.thermalResolution}</div>
                    <div>Lens: {cameraConfig.lens}</div>
                    <div>Dual Sensor: Yes</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>RTSP Stream URL (Optional)</Label>
                  <Input 
                    placeholder="rtsp://192.168.1.100:8554/stream"
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    className="bg-slate-800 border-slate-600"
                    data-testid="input-stream-url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the RTSP stream URL from your drone's camera to view live feed
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setCameraConfig(prev => ({ ...prev, streamUrl, streamEnabled: !!streamUrl }));
                      if (streamUrl) {
                        toast.success("Stream URL configured");
                        setActiveCam('stream');
                      }
                      setShowConfigDialog(false);
                    }}
                    data-testid="button-save-stream"
                  >
                    Save & Connect
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => setShowConfigDialog(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <button onClick={() => setIsMain(!isMain)} className="p-1 hover:text-white text-muted-foreground" data-testid="button-toggle-size">
            {isMain ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </button>
          <button onClick={() => setVisible(false)} className="p-1 hover:text-white text-muted-foreground" data-testid="button-hide-feed">
            <EyeOff className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        className={cn("relative w-full h-full bg-slate-900 overflow-hidden", zoom[0] > 1 && "cursor-grab", isDragging && "cursor-grabbing")}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `scale(${zoom[0]}) translate(${panX / zoom[0]}px, ${panY / zoom[0]}px)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
          className="w-full h-full select-none"
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
                    className={cn(
                      "absolute border-2 rounded cursor-pointer transition-all",
                      obj.isLocked && "border-4 animate-pulse"
                    )}
                    style={{
                      left: `${(obj.x / videoDimensions.width) * 100}%`,
                      top: `${(obj.y / videoDimensions.height) * 100}%`,
                      width: `${(obj.width / videoDimensions.width) * 100}%`,
                      height: `${(obj.height / videoDimensions.height) * 100}%`,
                      borderColor: obj.color,
                      boxShadow: obj.isLocked ? `0 0 10px ${obj.color}, 0 0 20px ${obj.color}` : 'none',
                    }}
                    onClick={() => lockOnObject(obj.id)}
                    title={obj.isLocked ? "Click to unlock" : "Click to lock onto this object"}
                    data-testid={`object-bbox-${obj.id}`}
                  >
                    {/* Object label with enhanced info */}
                    <div 
                      className="absolute -top-5 left-0 text-[8px] px-1 font-bold text-black flex items-center gap-1 whitespace-nowrap"
                      style={{ backgroundColor: obj.color }}
                    >
                      {obj.isLocked && <Crosshair className="h-2 w-2" />}
                      {obj.type.toUpperCase()} {obj.confidence}%
                      {obj.isMoving ? " [MOVING]" : " [STATIC]"}
                    </div>
                    
                    {/* Lock indicator */}
                    {obj.isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-3 h-3 border-2 border-red-500 rounded-full animate-ping" />
                        <Crosshair className="absolute h-4 w-4 text-red-500" />
                      </div>
                    )}
                    
                    {/* Velocity vector indicator for moving objects */}
                    {obj.isMoving && Math.abs(obj.velocity.vx) + Math.abs(obj.velocity.vy) > 2 && (
                      <div 
                        className="absolute w-0.5 bg-yellow-400"
                        style={{
                          left: '50%',
                          top: '50%',
                          height: `${Math.min(30, Math.sqrt(obj.velocity.vx ** 2 + obj.velocity.vy ** 2) * 3)}px`,
                          transform: `rotate(${Math.atan2(obj.velocity.vy, obj.velocity.vx) * 180 / Math.PI + 90}deg)`,
                          transformOrigin: 'top center'
                        }}
                      />
                    )}
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
          ) : activeCam === 'stream' && cameraConfig.streamUrl ? (
            <div className="relative w-full h-full">
              <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-slate-800">
                <div className="text-center p-4">
                  <Crosshair className="h-12 w-12 mx-auto mb-3 text-primary animate-pulse" />
                  <p className="text-sm font-medium text-white">RTSP Stream Mode</p>
                  <p className="text-xs mt-1">{cameraConfig.streamUrl}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    RTSP streams require native browser support or a media server.<br/>
                    Configure VLC or GStreamer on the Pi to transcode to HLS/WebRTC.
                  </p>
                  <div className="mt-3 p-2 bg-slate-900 rounded text-[10px] font-mono text-left">
                    <div className="text-emerald-400"># Pi Terminal Command:</div>
                    <div className="text-white">ffmpeg -i {cameraConfig.streamUrl} \</div>
                    <div className="text-white pl-4">-c:v libx264 -f hls /tmp/stream.m3u8</div>
                  </div>
                </div>
              </div>
            </div>
          ) : showPlaceholder ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
              <div className="text-center">
                <div className="relative mb-4">
                  <div className="w-24 h-24 rounded-full border-4 border-primary/30 mx-auto flex items-center justify-center">
                    <Video className="h-10 w-10 text-primary/50" />
                  </div>
                  <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-t-primary mx-auto animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <p className="text-sm font-medium text-white/80">{
                  activeCam === 'gimbal' ? (thermalMode ? 'THERMAL CAMERA' : 'GIMBAL CAMERA') :
                  activeCam === 'thermal' ? 'THERMAL CAMERA' : 'FPV CAMERA'
                }</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting video feed connection</p>
                <p className="text-[10px] text-muted-foreground mt-3">
                  Configure RTSP stream in camera settings<br/>
                  or use Laptop Camera for testing
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => setShowPlaceholder(false)}
                  data-testid="button-show-demo"
                >
                  Show Demo View
                </Button>
              </div>
            </div>
          ) : (
            <img 
              src={activeCam === 'fpv' ? fpvImg : aerialImg} 
              alt="Drone Feed" 
              className={cn(
                "w-full h-full object-cover pointer-events-none",
                thermalMode ? "opacity-90 hue-rotate-[280deg] saturate-[200%]" : "opacity-90"
              )}
              draggable={false}
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
             
            {/* Object Detection Box - only show in demo mode */}
            {activeCam !== 'fpv' && activeCam !== 'webcam' && activeCam !== 'stream' && !thermalMode && !showPlaceholder && (
              <div className="absolute top-1/3 left-1/4 w-24 h-24 border-2 border-amber-500 rounded-sm">
                <div className="absolute -top-4 left-0 bg-amber-500 text-black text-[10px] px-1 font-bold">DEMO OBJ</div>
              </div>
            )}
             
            {/* Thermal Heat Signature */}
            {thermalMode && (
              <div className="absolute top-1/4 right-1/4 w-16 h-20 border-2 border-amber-500 rounded-sm animate-pulse">
                <div className="absolute -top-4 left-0 bg-amber-500 text-black text-[10px] px-1 font-bold">HEAT: 36.5°C</div>
              </div>
            )}
            
            {/* Telemetry HUD - Bottom Left */}
            {activeCam !== 'webcam' && activeCam !== 'stream' && (
              <div className="absolute bottom-8 left-2 text-[9px] font-mono text-white/80 space-y-0.5">
                <div>ALT: 42.3m AGL</div>
                <div>SPD: 8.2 m/s</div>
                <div>HDG: 247°</div>
              </div>
            )}
            
            {/* Camera Info - Bottom Right */}
            {activeCam !== 'webcam' && activeCam !== 'stream' && (
              <div className="absolute bottom-8 right-2 text-[9px] font-mono text-white/80 text-right space-y-0.5">
                <div>{cameraConfig.model}</div>
                <div>{thermalMode ? cameraConfig.thermalResolution : cameraConfig.resolution}</div>
                <div>LENS: {cameraConfig.lens}</div>
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

        {/* Bottom Controls - Always visible */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-7 bg-black/60 hover:bg-black/80 border border-white/20 text-xs"
            onClick={handleSnapshot}
            data-testid="button-snapshot"
          >
            <Camera className="h-3 w-3 mr-1" />
            Snapshot
          </Button>
          <Button 
            variant={isRecording ? "destructive" : "secondary"}
            size="sm" 
            className={cn("h-7 border border-white/20 text-xs", !isRecording && "bg-black/60 hover:bg-black/80")}
            onClick={handleToggleRecording}
            disabled={isUploading}
            data-testid="button-record"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Video className="h-3 w-3 mr-1" />
                {isRecording ? "Stop" : "Record"}
              </>
            )}
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
