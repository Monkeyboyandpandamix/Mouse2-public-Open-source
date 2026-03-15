import { useEffect, useRef, useCallback } from "react";
import { dispatchBackendCommand } from "@/lib/commandService";

interface Pose {
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  confidence: number;
  source: string;
  timestamp: number;
}

interface SceneSignature {
  featureHash: number[];
  brightness: number;
  edgeDensity: number;
  colorHistogram: number[];
  timestamp: number;
  pose: Pose;
}

interface VisualOdomUpdate {
  dx: number;
  dy: number;
  confidence: number;
  frameWidth: number;
  frameHeight: number;
  timestamp: number;
}

interface TelemetryLike {
  position?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  heading?: number;
  groundSpeed?: number;
  altitude?: number;
  gpsSatellites?: number;
  verticalSpeed?: number;
  airSpeed?: number;
  attitude?: { pitch: number; roll: number; yaw: number };
}

interface MLNavConfig {
  enabled: boolean;
  sceneMatchingEnabled: boolean;
  landmarkLearningEnabled: boolean;
  commsLostAutoRtl: boolean;
  commsLostTimeoutSec: number;
  gpsLostTimeoutSec: number;
  minSatellites: number;
  positionFusionMethod: "ml_weighted" | "dead_reckoning" | "visual_only" | "hybrid";
  maxSceneMemory: number;
  destinationNav: boolean;
  routeReplanInterval: number;
}

const DEFAULT_CONFIG: MLNavConfig = {
  enabled: true,
  sceneMatchingEnabled: true,
  landmarkLearningEnabled: true,
  commsLostAutoRtl: true,
  commsLostTimeoutSec: 30,
  gpsLostTimeoutSec: 10,
  minSatellites: 6,
  positionFusionMethod: "ml_weighted",
  maxSceneMemory: 200,
  destinationNav: true,
  routeReplanInterval: 5000,
};

const EARTH_RADIUS_M = 6371000;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function metersToLatLonDelta(northM: number, eastM: number, atLat: number) {
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = (eastM / (EARTH_RADIUS_M * Math.cos((atLat * Math.PI) / 180))) * (180 / Math.PI);
  return { dLat, dLng };
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

class SceneMemory {
  private scenes: SceneSignature[] = [];
  private maxScenes: number;

  constructor(maxScenes: number = 200) {
    this.maxScenes = maxScenes;
  }

  addScene(scene: SceneSignature): void {
    this.scenes.push(scene);
    if (this.scenes.length > this.maxScenes) {
      this.scenes.shift();
    }
  }

  findBestMatch(query: SceneSignature): { scene: SceneSignature; similarity: number } | null {
    if (this.scenes.length === 0) return null;

    let bestScore = -1;
    let bestScene: SceneSignature | null = null;

    for (const scene of this.scenes) {
      const score = this.computeSimilarity(query, scene);
      if (score > bestScore) {
        bestScore = score;
        bestScene = scene;
      }
    }

    if (!bestScene || bestScore < 0.3) return null;
    return { scene: bestScene, similarity: bestScore };
  }

  private computeSimilarity(a: SceneSignature, b: SceneSignature): number {
    let hashSim = 0;
    const minLen = Math.min(a.featureHash.length, b.featureHash.length);
    if (minLen > 0) {
      let matching = 0;
      for (let i = 0; i < minLen; i++) {
        if (Math.abs(a.featureHash[i] - b.featureHash[i]) < 0.15) matching++;
      }
      hashSim = matching / minLen;
    }

    const brightDiff = Math.abs(a.brightness - b.brightness) / 255;
    const brightSim = 1 - clamp(brightDiff, 0, 1);

    const edgeDiff = Math.abs(a.edgeDensity - b.edgeDensity);
    const edgeSim = 1 - clamp(edgeDiff, 0, 1);

    let histSim = 0;
    const histLen = Math.min(a.colorHistogram.length, b.colorHistogram.length);
    if (histLen > 0) {
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < histLen; i++) {
        dotProduct += a.colorHistogram[i] * b.colorHistogram[i];
        normA += a.colorHistogram[i] ** 2;
        normB += b.colorHistogram[i] ** 2;
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB);
      histSim = denom > 0 ? dotProduct / denom : 0;
    }

    return hashSim * 0.4 + brightSim * 0.15 + edgeSim * 0.15 + histSim * 0.3;
  }

  getSceneCount(): number { return this.scenes.length; }
  getScenes(): SceneSignature[] { return [...this.scenes]; }
  clear(): void { this.scenes = []; }
}

class PositionEstimatorNN {
  private weights1: number[][] = [];
  private biases1: number[] = [];
  private weights2: number[][] = [];
  private biases2: number[] = [];
  private weights3: number[][] = [];
  private biases3: number[] = [];
  private inputSize = 16;
  private hidden1 = 32;
  private hidden2 = 16;
  private outputSize = 4;
  private trained = false;
  private epochs = 0;
  private trainingBuffer: { input: number[]; target: number[] }[] = [];
  private maxBuffer = 2000;
  private lr = 0.0008;

  constructor() {
    this.initWeights();
  }

  private initWeights(): void {
    const xav = (fi: number, fo: number) => (Math.random() * 2 - 1) * Math.sqrt(6 / (fi + fo));
    const makeMat = (r: number, c: number, fi: number, fo: number) =>
      Array.from({ length: r }, () => Array.from({ length: c }, () => xav(fi, fo)));

    this.weights1 = makeMat(this.hidden1, this.inputSize, this.inputSize, this.hidden1);
    this.biases1 = new Array(this.hidden1).fill(0);
    this.weights2 = makeMat(this.hidden2, this.hidden1, this.hidden1, this.hidden2);
    this.biases2 = new Array(this.hidden2).fill(0);
    this.weights3 = makeMat(this.outputSize, this.hidden2, this.hidden2, this.outputSize);
    this.biases3 = new Array(this.outputSize).fill(0);
  }

  predict(features: number[]): { dLat: number; dLng: number; dAlt: number; confidence: number } {
    const input = features.slice(0, this.inputSize);
    while (input.length < this.inputSize) input.push(0);

    const h1 = this.weights1.map((row, i) => {
      const sum = row.reduce((s, w, j) => s + w * (input[j] ?? 0), 0) + this.biases1[i];
      return Math.max(0, sum);
    });

    const h2 = this.weights2.map((row, i) => {
      const sum = row.reduce((s, w, j) => s + w * (h1[j] ?? 0), 0) + this.biases2[i];
      return Math.max(0, sum);
    });

    const out = this.weights3.map((row, i) => {
      const sum = row.reduce((s, w, j) => s + w * (h2[j] ?? 0), 0) + this.biases3[i];
      return Math.tanh(sum);
    });

    const basConf = this.trained ? 0.6 : 0.2;
    const epochScale = clamp(this.epochs / 50, 0, 1);

    return {
      dLat: out[0] * 0.0001,
      dLng: out[1] * 0.0001,
      dAlt: out[2] * 5,
      confidence: clamp(basConf * (0.5 + 0.5 * epochScale) * clamp(Math.abs(out[3]) + 0.3, 0, 1), 0.05, 0.9),
    };
  }

  addTraining(input: number[], target: number[]): void {
    this.trainingBuffer.push({ input: input.slice(0, this.inputSize), target: target.slice(0, this.outputSize) });
    if (this.trainingBuffer.length > this.maxBuffer) this.trainingBuffer.shift();
  }

  train(): { loss: number; epoch: number } {
    if (this.trainingBuffer.length < 20) return { loss: -1, epoch: this.epochs };

    const batchSize = Math.min(16, this.trainingBuffer.length);
    let totalLoss = 0;

    for (let b = 0; b < batchSize; b++) {
      const idx = Math.floor(Math.random() * this.trainingBuffer.length);
      const sample = this.trainingBuffer[idx];
      const input = sample.input;
      while (input.length < this.inputSize) input.push(0);

      const h1Raw = this.weights1.map((row, i) =>
        row.reduce((s, w, j) => s + w * (input[j] ?? 0), 0) + this.biases1[i]
      );
      const h1 = h1Raw.map(v => Math.max(0, v));

      const h2Raw = this.weights2.map((row, i) =>
        row.reduce((s, w, j) => s + w * (h1[j] ?? 0), 0) + this.biases2[i]
      );
      const h2 = h2Raw.map(v => Math.max(0, v));

      const outRaw = this.weights3.map((row, i) =>
        row.reduce((s, w, j) => s + w * (h2[j] ?? 0), 0) + this.biases3[i]
      );
      const predicted = outRaw.map(v => Math.tanh(v));

      const scale = [0.0001, 0.0001, 5, 1];
      const errors = predicted.map((p, i) => p * scale[i] - (sample.target[i] ?? 0));
      totalLoss += errors.reduce((s, e) => s + e * e, 0) / errors.length;

      const dOut = errors.map((e, i) => {
        const t = Math.tanh(outRaw[i]);
        return e * (1 - t * t) / scale[i];
      });

      for (let i = 0; i < this.outputSize; i++) {
        for (let j = 0; j < this.hidden2; j++) {
          this.weights3[i][j] -= this.lr * dOut[i] * h2[j];
        }
        this.biases3[i] -= this.lr * dOut[i];
      }

      const dH2 = new Array(this.hidden2).fill(0);
      for (let j = 0; j < this.hidden2; j++) {
        for (let i = 0; i < this.outputSize; i++) dH2[j] += dOut[i] * this.weights3[i][j];
        dH2[j] *= h2Raw[j] > 0 ? 1 : 0;
      }
      for (let i = 0; i < this.hidden2; i++) {
        for (let j = 0; j < this.hidden1; j++) this.weights2[i][j] -= this.lr * dH2[i] * h1[j];
        this.biases2[i] -= this.lr * dH2[i];
      }

      const dH1 = new Array(this.hidden1).fill(0);
      for (let j = 0; j < this.hidden1; j++) {
        for (let i = 0; i < this.hidden2; i++) dH1[j] += dH2[i] * this.weights2[i][j];
        dH1[j] *= h1Raw[j] > 0 ? 1 : 0;
      }
      for (let i = 0; i < this.hidden1; i++) {
        for (let j = 0; j < this.inputSize; j++) this.weights1[i][j] -= this.lr * dH1[i] * (input[j] ?? 0);
        this.biases1[i] -= this.lr * dH1[i];
      }
    }

    this.epochs++;
    if (this.epochs > 15) this.trained = true;
    return { loss: totalLoss / batchSize, epoch: this.epochs };
  }

  isTrained(): boolean { return this.trained; }
  getEpochs(): number { return this.epochs; }
  getTrainingSize(): number { return this.trainingBuffer.length; }
}

class CommsMonitor {
  private lastServerContact = Date.now();
  private lastGpsTime = Date.now();
  private commsLost = false;
  private gpsLost = false;

  updateServerContact(): void { this.lastServerContact = Date.now(); }
  updateGps(): void { this.lastGpsTime = Date.now(); }

  check(commsTimeout: number, gpsTimeout: number): { commsLost: boolean; gpsLost: boolean; commsLostDuration: number; gpsLostDuration: number } {
    const now = Date.now();
    this.commsLost = (now - this.lastServerContact) > commsTimeout * 1000;
    this.gpsLost = (now - this.lastGpsTime) > gpsTimeout * 1000;
    return {
      commsLost: this.commsLost,
      gpsLost: this.gpsLost,
      commsLostDuration: this.commsLost ? (now - this.lastServerContact) / 1000 : 0,
      gpsLostDuration: this.gpsLost ? (now - this.lastGpsTime) / 1000 : 0,
    };
  }
}

export function MLNavigationEngine() {
  const configRef = useRef<MLNavConfig>(DEFAULT_CONFIG);
  const poseRef = useRef<Pose>({ lat: 0, lng: 0, alt: 0, heading: 0, confidence: 0, source: "none", timestamp: 0 });
  const homeRef = useRef<{ lat: number; lng: number; alt: number } | null>(null);
  const destinationRef = useRef<{ lat: number; lng: number; alt: number } | null>(null);
  const armedRef = useRef(false);

  const sceneMemRef = useRef(new SceneMemory(200));
  const posEstRef = useRef(new PositionEstimatorNN());
  const commsMonRef = useRef(new CommsMonitor());
  const lastVioRef = useRef<VisualOdomUpdate | null>(null);
  const breadcrumbsRef = useRef<Pose[]>([]);
  const maxBreadcrumbs = 600;
  const lastTickRef = useRef(Date.now());
  const tickCountRef = useRef(0);
  const autoRtlTriggeredRef = useRef(false);
  const sceneIntervalRef = useRef(0);
  const lastSceneTimeRef = useRef(0);

  const loadConfig = useCallback(() => {
    const raw = localStorage.getItem("mouse_ml_nav_config");
    if (raw) {
      try {
        configRef.current = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch { /* defaults */ }
    }
  }, []);

  useEffect(() => {
    loadConfig();

    const onConfigChange = () => loadConfig();
    const onArm = (e: CustomEvent<{ armed: boolean }>) => {
      armedRef.current = Boolean(e.detail?.armed);
      if (!armedRef.current) {
        autoRtlTriggeredRef.current = false;
      }
    };

    const onTelemetry = (e: CustomEvent<TelemetryLike>) => {
      const d = e.detail;
      if (!d) return;

      const gpsPos = d.position || (typeof d.latitude === "number" && typeof d.longitude === "number"
        ? { lat: d.latitude, lng: d.longitude } : null);

      const sats = d.gpsSatellites ?? 99;
      const hasGps = !!gpsPos && sats >= configRef.current.minSatellites;

      if (hasGps && gpsPos) {
        commsMonRef.current.updateGps();
        const newPose: Pose = {
          lat: gpsPos.lat,
          lng: gpsPos.lng,
          alt: d.altitude ?? poseRef.current.alt,
          heading: d.heading ?? poseRef.current.heading,
          confidence: clamp(sats / 12, 0.3, 1),
          source: "gps",
          timestamp: Date.now(),
        };
        poseRef.current = newPose;

        if (!homeRef.current) {
          homeRef.current = { lat: gpsPos.lat, lng: gpsPos.lng, alt: d.altitude ?? 0 };
        }

        const lastBc = breadcrumbsRef.current[breadcrumbsRef.current.length - 1];
        if (!lastBc || Math.abs(lastBc.lat - newPose.lat) > 0.000005 || Math.abs(lastBc.lng - newPose.lng) > 0.000005) {
          breadcrumbsRef.current.push(newPose);
          if (breadcrumbsRef.current.length > maxBreadcrumbs) {
            breadcrumbsRef.current = breadcrumbsRef.current.slice(-maxBreadcrumbs);
          }
        }

        const features = buildFeatureVector(d, newPose);
        posEstRef.current.addTraining(features, [
          newPose.lat - (lastBc?.lat ?? newPose.lat),
          newPose.lng - (lastBc?.lng ?? newPose.lng),
          newPose.alt - (lastBc?.alt ?? newPose.alt),
          newPose.confidence,
        ]);
      }

      commsMonRef.current.updateServerContact();
    };

    const onVisualOdom = (e: CustomEvent<VisualOdomUpdate>) => {
      lastVioRef.current = e.detail;
    };

    const onSceneCapture = (e: CustomEvent<SceneSignature>) => {
      if (e.detail && configRef.current.landmarkLearningEnabled) {
        const scene = { ...e.detail, pose: { ...poseRef.current } };
        sceneMemRef.current.addScene(scene);
      }
    };

    const onNavCommand = (e: CustomEvent<{ command?: string; destination?: { lat: number; lng: number; alt: number } }>) => {
      const cmd = e.detail?.command;
      if (cmd === "set_nav_destination" && e.detail?.destination) {
        destinationRef.current = e.detail.destination;
      }
      if (cmd === "clear_nav_destination") {
        destinationRef.current = null;
      }
      if (cmd === "abort" || cmd === "land") {
        destinationRef.current = null;
        autoRtlTriggeredRef.current = false;
      }
    };
    const onCommandAck = (e: CustomEvent<{ commandType?: string; command?: { type?: string } }>) => {
      const type = String(e.detail?.commandType || e.detail?.command?.type || "").trim().toLowerCase();
      if (type === "abort" || type === "land") {
        destinationRef.current = null;
        autoRtlTriggeredRef.current = false;
      }
    };

    window.addEventListener("ml-nav-config-changed" as any, onConfigChange);
    window.addEventListener("arm-state-changed" as any, onArm);
    window.addEventListener("telemetry-update" as any, onTelemetry);
    window.addEventListener("visual-odometry-update" as any, onVisualOdom);
    window.addEventListener("scene-capture" as any, onSceneCapture);
    window.addEventListener("ml-nav-command" as any, onNavCommand);
    window.addEventListener("command-acked" as any, onCommandAck);

    return () => {
      window.removeEventListener("ml-nav-config-changed" as any, onConfigChange);
      window.removeEventListener("arm-state-changed" as any, onArm);
      window.removeEventListener("telemetry-update" as any, onTelemetry);
      window.removeEventListener("visual-odometry-update" as any, onVisualOdom);
      window.removeEventListener("scene-capture" as any, onSceneCapture);
      window.removeEventListener("ml-nav-command" as any, onNavCommand);
      window.removeEventListener("command-acked" as any, onCommandAck);
    };
  }, [loadConfig]);

  useEffect(() => {
    const interval = setInterval(() => {
      const cfg = configRef.current;
      if (!cfg.enabled) return;

      const now = Date.now();
      const dt = Math.max(0.1, Math.min(1.0, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      tickCountRef.current++;

      const commsStatus = commsMonRef.current.check(cfg.commsLostTimeoutSec, cfg.gpsLostTimeoutSec);
      const pose = poseRef.current;
      const vio = lastVioRef.current;

      let estimatedPose = { ...pose };
      let navMethod = pose.source;
      let posConfidence = pose.confidence;

      if (commsStatus.gpsLost && armedRef.current) {
        const telCache = ((window as any).__currentTelemetry || {}) as TelemetryLike;
        const heading = telCache.heading ?? pose.heading;
        const speed = telCache.groundSpeed ?? 0;
        const alt = telCache.altitude ?? pose.alt;

        const headRad = (heading * Math.PI) / 180;
        const northM = Math.cos(headRad) * speed * dt;
        const eastM = Math.sin(headRad) * speed * dt;
        const dead = metersToLatLonDelta(northM, eastM, pose.lat);

        let vioDelta = { dLat: 0, dLng: 0 };
        let vioConf = 0;
        if (vio && now - vio.timestamp < 2000) {
          const footprint = Math.max(8, alt * 1.2);
          const fw = Math.max(1, vio.frameWidth);
          const fh = Math.max(1, vio.frameHeight);
          const eastVio = -(vio.dx / fw) * footprint * vio.confidence;
          const northVio = -(vio.dy / fh) * footprint * vio.confidence;
          vioDelta = metersToLatLonDelta(northVio, eastVio, pose.lat);
          vioConf = vio.confidence;
        }

        const features = buildFeatureVector(telCache, pose);
        const mlPred = posEstRef.current.predict(features);
        const mlConf = mlPred.confidence;

        let fusedLat = pose.lat;
        let fusedLng = pose.lng;

        if (cfg.positionFusionMethod === "dead_reckoning") {
          fusedLat += dead.dLat;
          fusedLng += dead.dLng;
          navMethod = "dead_reckoning";
          posConfidence = 0.3;
        } else if (cfg.positionFusionMethod === "visual_only") {
          fusedLat += vioDelta.dLat;
          fusedLng += vioDelta.dLng;
          navMethod = "visual_odometry";
          posConfidence = vioConf * 0.6;
        } else if (cfg.positionFusionMethod === "hybrid") {
          fusedLat += dead.dLat * 0.5 + vioDelta.dLat * 0.5;
          fusedLng += dead.dLng * 0.5 + vioDelta.dLng * 0.5;
          navMethod = "hybrid";
          posConfidence = 0.3 + vioConf * 0.2;
        } else {
          const totalConf = 0.3 + vioConf + mlConf;
          const wDead = 0.3 / totalConf;
          const wVio = vioConf / totalConf;
          const wMl = mlConf / totalConf;

          fusedLat += dead.dLat * wDead + vioDelta.dLat * wVio + mlPred.dLat * wMl;
          fusedLng += dead.dLng * wDead + vioDelta.dLng * wVio + mlPred.dLng * wMl;
          navMethod = "ml_weighted";
          posConfidence = clamp(wDead * 0.3 + wVio * vioConf + wMl * mlConf, 0.1, 0.85);
        }

        if (cfg.sceneMatchingEnabled && sceneMemRef.current.getSceneCount() > 5 && now - lastSceneTimeRef.current > 3000) {
          lastSceneTimeRef.current = now;
          const queryScene: SceneSignature = {
            featureHash: features.slice(0, 8),
            brightness: features[8] ?? 128,
            edgeDensity: features[9] ?? 0.5,
            colorHistogram: features.slice(10, 16),
            timestamp: now,
            pose: { ...pose },
          };
          const match = sceneMemRef.current.findBestMatch(queryScene);
          if (match && match.similarity > 0.5) {
            const sceneLat = match.scene.pose.lat;
            const sceneLng = match.scene.pose.lng;
            const sceneBlend = clamp(match.similarity * 0.3, 0, 0.3);
            fusedLat = fusedLat * (1 - sceneBlend) + sceneLat * sceneBlend;
            fusedLng = fusedLng * (1 - sceneBlend) + sceneLng * sceneBlend;
            posConfidence = clamp(posConfidence + match.similarity * 0.15, 0, 0.9);
            navMethod = "ml_scene_fused";
          }
        }

        estimatedPose = {
          lat: fusedLat,
          lng: fusedLng,
          alt: alt,
          heading: heading,
          confidence: posConfidence,
          source: navMethod,
          timestamp: now,
        };
        poseRef.current = estimatedPose;

        const lastBc = breadcrumbsRef.current[breadcrumbsRef.current.length - 1];
        if (!lastBc || Math.abs(lastBc.lat - fusedLat) > 0.000003 || Math.abs(lastBc.lng - fusedLng) > 0.000003) {
          breadcrumbsRef.current.push(estimatedPose);
          if (breadcrumbsRef.current.length > maxBreadcrumbs) {
            breadcrumbsRef.current = breadcrumbsRef.current.slice(-maxBreadcrumbs);
          }
        }
      }

      if (commsStatus.commsLost && cfg.commsLostAutoRtl && armedRef.current && !autoRtlTriggeredRef.current && homeRef.current) {
        autoRtlTriggeredRef.current = true;
        destinationRef.current = homeRef.current;
        void dispatchBackendCommand({ commandType: "rtl" }).catch((error) => {
          window.dispatchEvent(new CustomEvent("system-error", {
            detail: {
              type: "critical",
              title: "Comms Lost RTL Command Failed",
              message: error instanceof Error ? error.message : "Failed to dispatch RTL command",
            },
          }));
        });
        window.dispatchEvent(new CustomEvent("ml-nav-guidance", {
          detail: { command: "guided-waypoint", source: "ml_nav_comms_lost_rtl", target: homeRef.current },
        }));
        window.dispatchEvent(new CustomEvent("system-error", {
          detail: { type: "warning", title: "Comms Lost - Auto RTL", message: "Communication lost. Navigating to home position using ML navigation." },
        }));
      }

      if (destinationRef.current && armedRef.current && commsStatus.gpsLost) {
        const dist = haversineDistance(estimatedPose.lat, estimatedPose.lng, destinationRef.current.lat, destinationRef.current.lng);
        const bearing = bearingTo(estimatedPose.lat, estimatedPose.lng, destinationRef.current.lat, destinationRef.current.lng);

        if (dist > 3) {
          window.dispatchEvent(new CustomEvent("ml-nav-guidance", {
            detail: {
              command: "guided-waypoint",
              source: "ml_nav_destination",
              target: destinationRef.current,
              bearing,
              distance: dist,
            },
          }));
        } else {
          destinationRef.current = null;
        }
      }

      if (tickCountRef.current % 10 === 0) {
        posEstRef.current.train();
      }

      const destInfo = destinationRef.current ? {
        lat: destinationRef.current.lat,
        lng: destinationRef.current.lng,
        alt: destinationRef.current.alt,
        distance: haversineDistance(estimatedPose.lat, estimatedPose.lng, destinationRef.current.lat, destinationRef.current.lng),
        bearing: bearingTo(estimatedPose.lat, estimatedPose.lng, destinationRef.current.lat, destinationRef.current.lng),
      } : null;

      window.dispatchEvent(new CustomEvent("ml-navigation-status", {
        detail: {
          enabled: cfg.enabled,
          armed: armedRef.current,
          gpsLost: commsStatus.gpsLost,
          gpsLostDuration: Math.round(commsStatus.gpsLostDuration),
          commsLost: commsStatus.commsLost,
          commsLostDuration: Math.round(commsStatus.commsLostDuration),
          autoRtlTriggered: autoRtlTriggeredRef.current,

          estimatedPosition: {
            lat: Math.round(estimatedPose.lat * 1e7) / 1e7,
            lng: Math.round(estimatedPose.lng * 1e7) / 1e7,
            alt: Math.round(estimatedPose.alt * 10) / 10,
          },
          heading: Math.round(estimatedPose.heading),
          positionConfidence: Math.round(posConfidence * 100) / 100,
          navigationMethod: navMethod,

          home: homeRef.current ? {
            lat: Math.round(homeRef.current.lat * 1e7) / 1e7,
            lng: Math.round(homeRef.current.lng * 1e7) / 1e7,
            distance: homeRef.current ? haversineDistance(estimatedPose.lat, estimatedPose.lng, homeRef.current.lat, homeRef.current.lng) : 0,
          } : null,

          destination: destInfo,

          mlModel: {
            trained: posEstRef.current.isTrained(),
            epochs: posEstRef.current.getEpochs(),
            trainingDataSize: posEstRef.current.getTrainingSize(),
          },

          sceneMemory: {
            sceneCount: sceneMemRef.current.getSceneCount(),
            maxScenes: cfg.maxSceneMemory,
          },

          breadcrumbCount: breadcrumbsRef.current.length,
          fusionMethod: cfg.positionFusionMethod,
        },
      }));
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return null;
}

function buildFeatureVector(tel: TelemetryLike, pose: Pose): number[] {
  const att = tel.attitude ?? { pitch: 0, roll: 0, yaw: 0 };
  return [
    att.pitch, att.roll, att.yaw,
    tel.groundSpeed ?? 0,
    tel.verticalSpeed ?? 0,
    tel.airSpeed ?? tel.groundSpeed ?? 0,
    pose.heading,
    pose.alt,
    pose.confidence,
    tel.gpsSatellites ?? 0,
    pose.lat * 1000 % 1,
    pose.lng * 1000 % 1,
    Math.sin(Date.now() / 10000),
    Math.cos(Date.now() / 10000),
    (tel.altitude ?? 0) / 100,
    (tel.groundSpeed ?? 0) / 20,
  ];
}
