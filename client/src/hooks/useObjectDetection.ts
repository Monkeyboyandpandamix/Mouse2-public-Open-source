import { useEffect, useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { toast } from "sonner";

export const AERIAL_CONFIDENCE_BOOST: Record<string, number> = {
  person: 12, car: 15, truck: 15, bus: 15, motorcycle: 10,
  bicycle: 8, boat: 12, airplane: 18, bird: 5,
  backpack: 5, suitcase: 5, umbrella: 5, handbag: 5,
  dog: 5, cat: 3, horse: 8, cow: 8, sheep: 6, bear: 8,
  kite: 5,
  "fire hydrant": 3, bench: 3, "stop sign": 3, "traffic light": 3,
};

export type DetectionType = "person" | "vehicle" | "animal" | "aircraft" | "unknown";

export const COCO_TO_TYPE: Record<string, DetectionType> = {
  person: "person",
  bicycle: "vehicle",
  car: "vehicle",
  motorcycle: "vehicle",
  bus: "vehicle",
  truck: "vehicle",
  boat: "vehicle",
  airplane: "aircraft",
  bird: "animal",
  cat: "animal",
  dog: "animal",
  horse: "animal",
  sheep: "animal",
  cow: "animal",
  bear: "animal",
};

export interface UnifiedDetection {
  bbox: [number, number, number, number];
  class: string;
  type: DetectionType;
  rawConfidence: number;
  confidence: number;
  colorSignature: number[];
}

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

async function ensureModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.ready();
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      return cocoSsd.load({ base: "lite_mobilenet_v2" });
    })();
  }
  return modelPromise;
}

function extractColorSignature(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  bbox: [number, number, number, number]
): number[] {
  try {
    const [x, y, w, h] = bbox;
    if (w < 4 || h < 4) return [0, 0, 0];
    const tmp = document.createElement("canvas");
    tmp.width = 16;
    tmp.height = 16;
    const ctx = tmp.getContext("2d");
    if (!ctx) return [0, 0, 0];
    ctx.drawImage(source as any, x, y, w, h, 0, 0, 16, 16);
    const data = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0, g = 0, b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  } catch {
    return [0, 0, 0];
  }
}

export function colorSignatureDistance(a: number[], b: number[]): number {
  if (!a?.length || !b?.length) return 1000;
  const dr = (a[0] || 0) - (b[0] || 0);
  const dg = (a[1] || 0) - (b[1] || 0);
  const db = (a[2] || 0) - (b[2] || 0);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export interface UseObjectDetectionResult {
  modelLoaded: boolean;
  modelLoading: boolean;
  loadModel: () => Promise<void>;
  detect: (
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    options?: { minConfidence?: number; maxDetections?: number }
  ) => Promise<UnifiedDetection[]>;
}

export function useObjectDetection(opts?: {
  autoLoad?: boolean;
  notify?: boolean;
}): UseObjectDetectionResult {
  const { autoLoad = false, notify = false } = opts || {};
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  const loadModel = useCallback(async () => {
    if (modelRef.current || modelLoading) return;
    setModelLoading(true);
    try {
      const m = await ensureModel();
      modelRef.current = m;
      setModelLoaded(true);
      if (notify) toast.success("AI model loaded - ready for detection");
    } catch (e) {
      console.error("[useObjectDetection] Failed to load model:", e);
      if (notify) toast.error("Failed to load AI model. Using fallback detection.");
    } finally {
      setModelLoading(false);
    }
  }, [modelLoading, notify]);

  useEffect(() => {
    if (autoLoad) {
      loadModel().catch(() => {});
    }
  }, [autoLoad, loadModel]);

  const detect = useCallback<UseObjectDetectionResult["detect"]>(
    async (source, options) => {
      const { minConfidence = 0.35, maxDetections = 20 } = options || {};
      const model = modelRef.current;
      if (!model) return [];
      let preds: cocoSsd.DetectedObject[] = [];
      try {
        preds = await model.detect(source as any, maxDetections);
      } catch (e) {
        console.warn("[useObjectDetection] detect error:", e);
        return [];
      }
      return preds
        .filter((p) => p.score >= minConfidence)
        .map<UnifiedDetection>((p) => {
          const rawConf = p.score * 100;
          const boost = AERIAL_CONFIDENCE_BOOST[p.class] || 0;
          const conf = Math.min(99, rawConf + boost);
          const sig = extractColorSignature(source, p.bbox);
          return {
            bbox: p.bbox,
            class: p.class,
            type: COCO_TO_TYPE[p.class] || "unknown",
            rawConfidence: rawConf,
            confidence: conf,
            colorSignature: sig,
          };
        });
    },
    []
  );

  return { modelLoaded, modelLoading, loadModel, detect };
}
