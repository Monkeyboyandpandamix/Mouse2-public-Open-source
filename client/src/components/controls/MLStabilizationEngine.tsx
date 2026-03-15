import { useEffect, useRef, useCallback } from "react";

interface IMUData {
  accelX: number; accelY: number; accelZ: number;
  gyroX: number; gyroY: number; gyroZ: number;
}

interface TelemetrySnapshot {
  attitude?: { pitch: number; roll: number; yaw: number };
  altitude?: number;
  groundSpeed?: number;
  heading?: number;
  position?: { lat: number; lng: number };
  batteryPercent?: number;
  batteryVoltage?: number;
  motors?: { rpm: number; current: number; temp: number }[];
  gpsStatus?: string;
  gpsSatellites?: number;
  verticalSpeed?: number;
  airSpeed?: number;
  vibrationX?: number;
  vibrationY?: number;
  vibrationZ?: number;
}

interface WeatherData {
  temperature_c: number;
  humidity: number;
  pressure: number;
  iaq_score: number;
}

interface CameraFeatureData {
  avgFeatureSize: number;
  featureCount: number;
  frameWidth: number;
  frameHeight: number;
  opticalFlowX: number;
  opticalFlowY: number;
  brightness: number;
}

interface KalmanVector {
  x: number; y: number; z: number;
}

interface KalmanFilterState {
  position: KalmanVector;
  velocity: KalmanVector;
  attitude: { roll: number; pitch: number; yaw: number };
  accelBias: KalmanVector;
  gyroBias: KalmanVector;
  positionUncertainty: number;
  velocityUncertainty: number;
  attitudeUncertainty: number;
}

interface NeuralNetLayer {
  weights: number[][];
  biases: number[];
}

interface MLModel {
  layers: NeuralNetLayer[];
  inputNorm: { mean: number[]; std: number[] };
  outputScale: number[];
  trained: boolean;
  epochs: number;
  loss: number;
}

interface PIDState {
  integral: number;
  lastError: number;
  lastTime: number;
  outputMin: number;
  outputMax: number;
  integralMin: number;
  integralMax: number;
}

type FrameType = "quad_x" | "quad_plus" | "quad_h" | "hex_x" | "hex_plus" | "octo_x" | "octo_plus" | "octo_v" | "y6" | "y4" | "tri" | "coax_quad";

interface FrameArchProfile {
  motorCount: number;
  rollGainScale: number;
  pitchGainScale: number;
  yawGainScale: number;
  thrustGainScale: number;
  inertiaScale: { x: number; y: number; z: number };
  redundancyLevel: number;
}

const FRAME_ARCH_PROFILES: Record<FrameType, FrameArchProfile> = {
  quad_x: { motorCount: 4, rollGainScale: 1.0, pitchGainScale: 1.0, yawGainScale: 1.0, thrustGainScale: 1.0, inertiaScale: { x: 1.0, y: 1.0, z: 1.0 }, redundancyLevel: 0 },
  quad_plus: { motorCount: 4, rollGainScale: 1.0, pitchGainScale: 1.0, yawGainScale: 1.0, thrustGainScale: 1.0, inertiaScale: { x: 1.0, y: 1.0, z: 1.0 }, redundancyLevel: 0 },
  quad_h: { motorCount: 4, rollGainScale: 1.0, pitchGainScale: 0.9, yawGainScale: 1.0, thrustGainScale: 1.0, inertiaScale: { x: 1.0, y: 1.3, z: 1.1 }, redundancyLevel: 0 },
  hex_x: { motorCount: 6, rollGainScale: 0.85, pitchGainScale: 0.85, yawGainScale: 0.9, thrustGainScale: 0.9, inertiaScale: { x: 1.4, y: 1.4, z: 1.8 }, redundancyLevel: 1 },
  hex_plus: { motorCount: 6, rollGainScale: 0.85, pitchGainScale: 0.85, yawGainScale: 0.9, thrustGainScale: 0.9, inertiaScale: { x: 1.4, y: 1.4, z: 1.8 }, redundancyLevel: 1 },
  octo_x: { motorCount: 8, rollGainScale: 0.75, pitchGainScale: 0.75, yawGainScale: 0.8, thrustGainScale: 0.85, inertiaScale: { x: 1.8, y: 1.8, z: 2.5 }, redundancyLevel: 2 },
  octo_plus: { motorCount: 8, rollGainScale: 0.75, pitchGainScale: 0.75, yawGainScale: 0.8, thrustGainScale: 0.85, inertiaScale: { x: 1.8, y: 1.8, z: 2.5 }, redundancyLevel: 2 },
  octo_v: { motorCount: 8, rollGainScale: 0.78, pitchGainScale: 0.72, yawGainScale: 0.8, thrustGainScale: 0.85, inertiaScale: { x: 1.7, y: 2.0, z: 2.4 }, redundancyLevel: 2 },
  y6: { motorCount: 6, rollGainScale: 0.9, pitchGainScale: 0.88, yawGainScale: 0.85, thrustGainScale: 0.92, inertiaScale: { x: 1.3, y: 1.3, z: 1.6 }, redundancyLevel: 1 },
  y4: { motorCount: 4, rollGainScale: 1.0, pitchGainScale: 0.95, yawGainScale: 0.85, thrustGainScale: 0.95, inertiaScale: { x: 1.0, y: 1.1, z: 1.1 }, redundancyLevel: 0 },
  tri: { motorCount: 3, rollGainScale: 1.1, pitchGainScale: 1.1, yawGainScale: 0.7, thrustGainScale: 1.05, inertiaScale: { x: 0.9, y: 0.9, z: 0.85 }, redundancyLevel: 0 },
  coax_quad: { motorCount: 8, rollGainScale: 0.82, pitchGainScale: 0.82, yawGainScale: 0.85, thrustGainScale: 0.88, inertiaScale: { x: 1.2, y: 1.2, z: 1.6 }, redundancyLevel: 2 },
};

interface StabilizationConfig {
  enabled: boolean;
  mlAssistEnabled: boolean;
  cameraGroundEstEnabled: boolean;
  windCompensationEnabled: boolean;
  payloadCompensationEnabled: boolean;
  weatherAdaptationEnabled: boolean;
  takeoffAssistEnabled: boolean;
  adaptiveGainsEnabled: boolean;
  maxRollCorrection: number;
  maxPitchCorrection: number;
  maxYawRate: number;
  maxThrottleCorrection: number;
  targetHoverAltitude: number;
  payloadMass: number;
  vehicleMass: number;
  frameType: FrameType;
}

const DEFAULT_CONFIG: StabilizationConfig = {
  enabled: true,
  mlAssistEnabled: true,
  cameraGroundEstEnabled: true,
  windCompensationEnabled: true,
  payloadCompensationEnabled: true,
  weatherAdaptationEnabled: true,
  takeoffAssistEnabled: true,
  adaptiveGainsEnabled: true,
  maxRollCorrection: 20,
  maxPitchCorrection: 20,
  maxYawRate: 180,
  maxThrottleCorrection: 8,
  targetHoverAltitude: 20,
  payloadMass: 0,
  vehicleMass: 2.5,
  frameType: "quad_x",
};

const GRAVITY = 9.80665;
const LOOP_INTERVAL_MS = 200;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-clamp(x, -10, 10)));
}

function relu(x: number): number {
  return Math.max(0, x);
}

function xavier(fanIn: number, fanOut: number): number {
  const limit = Math.sqrt(6 / (fanIn + fanOut));
  return (Math.random() * 2 - 1) * limit;
}

function createLayer(inputSize: number, outputSize: number): NeuralNetLayer {
  return {
    weights: Array.from({ length: outputSize }, () =>
      Array.from({ length: inputSize }, () => xavier(inputSize, outputSize))
    ),
    biases: new Array(outputSize).fill(0),
  };
}

function forwardLayer(layer: NeuralNetLayer, input: number[], activation: (x: number) => number): number[] {
  return layer.weights.map((row, i) => {
    const sum = row.reduce((s, w, j) => s + w * (input[j] ?? 0), 0) + layer.biases[i];
    return activation(sum);
  });
}

function createPID(outputMin: number, outputMax: number, integralLimit: number): PIDState {
  return {
    integral: 0, lastError: 0, lastTime: Date.now(),
    outputMin, outputMax, integralMin: -integralLimit, integralMax: integralLimit,
  };
}

function computePID(
  pid: PIDState, error: number, kp: number, ki: number, kd: number, dt: number
): number {
  pid.integral = clamp(pid.integral + error * dt, pid.integralMin, pid.integralMax);
  const derivative = dt > 0.01 ? (error - pid.lastError) / dt : 0;
  pid.lastError = error;
  pid.lastTime = Date.now();
  return clamp(kp * error + ki * pid.integral + kd * derivative, pid.outputMin, pid.outputMax);
}

class ClientKalmanFilter {
  private x: number[] = new Array(15).fill(0);
  private P: number[] = new Array(15).fill(1.0);
  private Q: number[] = [
    0.001, 0.001, 0.001,
    0.01, 0.01, 0.01,
    0.005, 0.005, 0.005,
    0.0001, 0.0001, 0.0001,
    0.0001, 0.0001, 0.0001,
  ];

  predict(dt: number, accel: number[], gyro: number[]): void {
    const ax = accel[0] - this.x[9];
    const ay = accel[1] - this.x[10];
    const az = accel[2] - this.x[11];

    this.x[0] += this.x[3] * dt + 0.5 * ax * dt * dt;
    this.x[1] += this.x[4] * dt + 0.5 * ay * dt * dt;
    this.x[2] += this.x[5] * dt + 0.5 * az * dt * dt;
    this.x[3] += ax * dt;
    this.x[4] += ay * dt;
    this.x[5] += az * dt;

    this.x[6] += (gyro[0] - this.x[12]) * dt;
    this.x[7] += (gyro[1] - this.x[13]) * dt;
    this.x[8] += (gyro[2] - this.x[14]) * dt;

    for (let i = 0; i < 15; i++) {
      this.P[i] += this.Q[i] * dt;
    }
  }

  updatePosition(pos: number[], R: number): void {
    for (let i = 0; i < 3; i++) {
      const S = this.P[i] + R;
      const K = this.P[i] / Math.max(S, 1e-10);
      this.x[i] += K * (pos[i] - this.x[i]);
      this.P[i] *= (1 - K);
    }
  }

  updateAltitude(alt: number, R: number): void {
    const S = this.P[2] + R;
    const K = this.P[2] / Math.max(S, 1e-10);
    this.x[2] += K * (alt - this.x[2]);
    this.x[5] += K * 0.2 * (alt - this.x[2]);
    this.P[2] *= (1 - K);
  }

  updateAttitude(att: number[], R: number): void {
    for (let i = 0; i < 3; i++) {
      const idx = 6 + i;
      const S = this.P[idx] + R;
      const K = this.P[idx] / Math.max(S, 1e-10);
      this.x[idx] += K * (att[i] - this.x[idx]);
      this.P[idx] *= (1 - K);
    }
  }

  getState(): KalmanFilterState {
    return {
      position: { x: this.x[0], y: this.x[1], z: this.x[2] },
      velocity: { x: this.x[3], y: this.x[4], z: this.x[5] },
      attitude: { roll: this.x[6], pitch: this.x[7], yaw: this.x[8] },
      accelBias: { x: this.x[9], y: this.x[10], z: this.x[11] },
      gyroBias: { x: this.x[12], y: this.x[13], z: this.x[14] },
      positionUncertainty: Math.sqrt(this.P[0] + this.P[1] + this.P[2]),
      velocityUncertainty: Math.sqrt(this.P[3] + this.P[4] + this.P[5]),
      attitudeUncertainty: Math.sqrt(this.P[6] + this.P[7] + this.P[8]),
    };
  }

  reset(): void {
    this.x.fill(0);
    this.P.fill(1.0);
  }
}

class DisturbancePredictor {
  private model: MLModel;
  private historyBuffer: number[][] = [];
  private trainingBuffer: { input: number[]; target: number[] }[] = [];
  private readonly inputSize = 24;
  private readonly hiddenSize1 = 48;
  private readonly hiddenSize2 = 24;
  private readonly outputSize = 9;
  private readonly maxHistory = 60;
  private readonly maxTraining = 3000;
  private readonly learningRate = 0.0005;

  constructor() {
    this.model = {
      layers: [
        createLayer(this.inputSize, this.hiddenSize1),
        createLayer(this.hiddenSize1, this.hiddenSize2),
        createLayer(this.hiddenSize2, this.outputSize),
      ],
      inputNorm: {
        mean: new Array(this.inputSize).fill(0),
        std: new Array(this.inputSize).fill(1),
      },
      outputScale: new Array(this.outputSize).fill(5.0),
      trained: false,
      epochs: 0,
      loss: -1,
    };
  }

  private normalize(input: number[]): number[] {
    return input.map((v, i) => {
      const std = this.model.inputNorm.std[i] || 1;
      return (v - (this.model.inputNorm.mean[i] || 0)) / std;
    });
  }

  private updateNormalization(): void {
    if (this.historyBuffer.length < 10) return;
    const n = this.historyBuffer.length;
    for (let i = 0; i < this.inputSize; i++) {
      let sum = 0;
      for (const row of this.historyBuffer) sum += row[i] ?? 0;
      const mean = sum / n;
      let varSum = 0;
      for (const row of this.historyBuffer) varSum += ((row[i] ?? 0) - mean) ** 2;
      const std = Math.sqrt(varSum / n) || 1;
      this.model.inputNorm.mean[i] = this.model.inputNorm.mean[i] * 0.95 + mean * 0.05;
      this.model.inputNorm.std[i] = this.model.inputNorm.std[i] * 0.95 + std * 0.05;
    }
  }

  forward(features: number[]): number[] {
    const normalized = this.normalize(features);
    const h1 = forwardLayer(this.model.layers[0], normalized, relu);
    const h2 = forwardLayer(this.model.layers[1], h1, relu);
    const raw = forwardLayer(this.model.layers[2], h2, (x) => Math.tanh(x));
    return raw.map((v, i) => v * (this.model.outputScale[i] ?? 5.0));
  }

  addSample(features: number[]): void {
    const padded = features.slice(0, this.inputSize);
    while (padded.length < this.inputSize) padded.push(0);
    this.historyBuffer.push(padded);
    if (this.historyBuffer.length > this.maxHistory) this.historyBuffer.shift();
  }

  addTrainingSample(input: number[], target: number[]): void {
    this.trainingBuffer.push({
      input: input.slice(0, this.inputSize),
      target: target.slice(0, this.outputSize),
    });
    if (this.trainingBuffer.length > this.maxTraining) this.trainingBuffer.shift();
  }

  train(): { loss: number; epoch: number } {
    if (this.trainingBuffer.length < 30) return { loss: -1, epoch: this.model.epochs };

    this.updateNormalization();
    const batchSize = Math.min(32, this.trainingBuffer.length);
    let totalLoss = 0;

    for (let b = 0; b < batchSize; b++) {
      const idx = Math.floor(Math.random() * this.trainingBuffer.length);
      const sample = this.trainingBuffer[idx];
      const normalized = this.normalize(sample.input);

      const h1Raw = this.model.layers[0].weights.map((row, i) =>
        row.reduce((s, w, j) => s + w * (normalized[j] ?? 0), 0) + this.model.layers[0].biases[i]
      );
      const h1 = h1Raw.map(relu);

      const h2Raw = this.model.layers[1].weights.map((row, i) =>
        row.reduce((s, w, j) => s + w * (h1[j] ?? 0), 0) + this.model.layers[1].biases[i]
      );
      const h2 = h2Raw.map(relu);

      const outRaw = this.model.layers[2].weights.map((row, i) =>
        row.reduce((s, w, j) => s + w * (h2[j] ?? 0), 0) + this.model.layers[2].biases[i]
      );
      const predicted = outRaw.map((v, i) => Math.tanh(v) * (this.model.outputScale[i] ?? 5));

      const errors = predicted.map((p, i) => p - (sample.target[i] ?? 0));
      totalLoss += errors.reduce((s, e) => s + e * e, 0) / errors.length;

      const dOut = errors.map((e, i) => {
        const t = Math.tanh(outRaw[i]);
        return e * (1 - t * t) * (this.model.outputScale[i] ?? 5);
      });

      for (let i = 0; i < this.outputSize; i++) {
        for (let j = 0; j < this.hiddenSize2; j++) {
          this.model.layers[2].weights[i][j] -= this.learningRate * dOut[i] * h2[j];
        }
        this.model.layers[2].biases[i] -= this.learningRate * dOut[i];
      }

      const dH2 = new Array(this.hiddenSize2).fill(0);
      for (let j = 0; j < this.hiddenSize2; j++) {
        for (let i = 0; i < this.outputSize; i++) {
          dH2[j] += dOut[i] * this.model.layers[2].weights[i][j];
        }
        dH2[j] *= h2Raw[j] > 0 ? 1 : 0;
      }

      for (let i = 0; i < this.hiddenSize2; i++) {
        for (let j = 0; j < this.hiddenSize1; j++) {
          this.model.layers[1].weights[i][j] -= this.learningRate * dH2[i] * h1[j];
        }
        this.model.layers[1].biases[i] -= this.learningRate * dH2[i];
      }

      const dH1 = new Array(this.hiddenSize1).fill(0);
      for (let j = 0; j < this.hiddenSize1; j++) {
        for (let i = 0; i < this.hiddenSize2; i++) {
          dH1[j] += dH2[i] * this.model.layers[1].weights[i][j];
        }
        dH1[j] *= h1Raw[j] > 0 ? 1 : 0;
      }

      for (let i = 0; i < this.hiddenSize1; i++) {
        for (let j = 0; j < this.inputSize; j++) {
          this.model.layers[0].weights[i][j] -= this.learningRate * dH1[i] * (normalized[j] ?? 0);
        }
        this.model.layers[0].biases[i] -= this.learningRate * dH1[i];
      }
    }

    this.model.epochs++;
    this.model.loss = totalLoss / batchSize;
    if (this.model.epochs > 15) this.model.trained = true;
    return { loss: this.model.loss, epoch: this.model.epochs };
  }

  getModelInfo() {
    return {
      trained: this.model.trained,
      epochs: this.model.epochs,
      loss: this.model.loss,
      trainingDataSize: this.trainingBuffer.length,
      historySize: this.historyBuffer.length,
    };
  }

  getConfidence(): number {
    const histFactor = clamp(this.historyBuffer.length / this.maxHistory, 0, 1);
    const trainFactor = this.model.trained ? 0.7 : 0.25;
    const lossFactor = this.model.loss > 0 ? clamp(1 - this.model.loss / 10, 0, 1) : 0.5;
    return clamp(trainFactor * histFactor * (0.4 + 0.6 * lossFactor), 0.05, 0.95);
  }
}

class GroundDistanceEstimator {
  private history: { dist: number; conf: number; ts: number }[] = [];
  private calibrationFeatureSize = 50;
  private calibrationAlt = 10;

  estimate(
    camera: CameraFeatureData,
    attitude: { roll: number; pitch: number },
    baroAlt: number
  ): { distance: number; confidence: number; method: string } {
    if (camera.featureCount < 3) {
      return { distance: baroAlt, confidence: 0.1, method: "baro_fallback" };
    }

    const featureScale = this.calibrationFeatureSize / Math.max(camera.avgFeatureSize, 0.1);
    let estDist = this.calibrationAlt * featureScale;
    let confidence = clamp(camera.featureCount / 80, 0.1, 0.7);
    let method = "feature_scale";

    if (camera.opticalFlowX !== 0 || camera.opticalFlowY !== 0) {
      const flowMag = Math.sqrt(camera.opticalFlowX ** 2 + camera.opticalFlowY ** 2);
      if (flowMag > 0.5) {
        const flowDist = baroAlt * 0.8;
        estDist = estDist * 0.6 + flowDist * 0.4;
        confidence = Math.min(confidence + 0.1, 0.85);
        method = "feature_flow_fused";
      }
    }

    const cosCorrection = Math.cos(attitude.roll) * Math.cos(attitude.pitch);
    if (cosCorrection > 0.1) estDist /= cosCorrection;

    estDist = clamp(estDist, 0.05, 500);

    this.history.push({ dist: estDist, conf: confidence, ts: Date.now() });
    if (this.history.length > 20) this.history.shift();

    if (this.history.length > 3) {
      const recent = this.history.slice(-5);
      const avg = recent.reduce((s, h) => s + h.dist, 0) / recent.length;
      const variance = recent.reduce((s, h) => s + (h.dist - avg) ** 2, 0) / recent.length;
      if (variance < 9) {
        estDist = avg * 0.4 + estDist * 0.6;
        confidence = Math.min(confidence + 0.08, 0.92);
      }
    }

    const baroBlend = clamp(1 - confidence, 0.1, 0.9);
    estDist = estDist * (1 - baroBlend * 0.3) + baroAlt * baroBlend * 0.3;

    return { distance: estDist, confidence, method };
  }
}

class WindEstimator {
  private estimatedWind = { x: 0, y: 0, z: 0 };
  private gustHistory: number[] = [];
  private alpha = 0.08;

  update(
    measuredAccel: { x: number; y: number; z: number },
    expectedAccel: { x: number; y: number; z: number },
    airspeed: number,
    groundSpeed: number,
    heading: number
  ): { x: number; y: number; z: number; gustLevel: number } {
    const residualX = measuredAccel.x - expectedAccel.x;
    const residualY = measuredAccel.y - expectedAccel.y;
    const residualZ = measuredAccel.z - expectedAccel.z;

    const windFromAccel = {
      x: -residualX * 3.5,
      y: -residualY * 3.5,
      z: -residualZ * 2.0,
    };

    const headRad = (heading * Math.PI) / 180;
    const speedDiff = airspeed - groundSpeed;
    const windFromSpeed = {
      x: speedDiff * Math.cos(headRad),
      y: speedDiff * Math.sin(headRad),
    };

    this.estimatedWind.x = this.estimatedWind.x * (1 - this.alpha) + (windFromAccel.x * 0.4 + windFromSpeed.x * 0.6) * this.alpha;
    this.estimatedWind.y = this.estimatedWind.y * (1 - this.alpha) + (windFromAccel.y * 0.4 + windFromSpeed.y * 0.6) * this.alpha;
    this.estimatedWind.z = this.estimatedWind.z * (1 - this.alpha) + windFromAccel.z * this.alpha;

    const mag = Math.sqrt(this.estimatedWind.x ** 2 + this.estimatedWind.y ** 2);
    this.gustHistory.push(mag);
    if (this.gustHistory.length > 30) this.gustHistory.shift();

    let gustLevel = 0;
    if (this.gustHistory.length > 5) {
      const avg = this.gustHistory.reduce((s, v) => s + v, 0) / this.gustHistory.length;
      const variance = this.gustHistory.reduce((s, v) => s + (v - avg) ** 2, 0) / this.gustHistory.length;
      gustLevel = clamp(Math.sqrt(variance) / 3, 0, 1);
    }

    return { ...this.estimatedWind, gustLevel };
  }

  getWind() { return { ...this.estimatedWind }; }
}

class PayloadCompensator {
  private payloadMass = 0;
  private cgBias = { roll: 0, pitch: 0 };
  private releaseInProgress = false;
  private releaseProgress = 0;
  private biasAlpha = 0.015;
  private priorMass = 0;

  update(
    attitude: { roll: number; pitch: number },
    verticalSpeed: number,
    config: { payloadMass: number; vehicleMass: number }
  ): {
    thrustCompensation: number;
    rollCompensation: number;
    pitchCompensation: number;
    payloadShiftEstimate: number;
    releaseDetected: boolean;
  } {
    this.payloadMass = config.payloadMass * (1 - this.releaseProgress);

    this.cgBias.roll = this.cgBias.roll * (1 - this.biasAlpha) + attitude.roll * this.biasAlpha;
    this.cgBias.pitch = this.cgBias.pitch * (1 - this.biasAlpha) + attitude.pitch * this.biasAlpha;

    const totalMass = config.vehicleMass + this.payloadMass;
    const thrustCompensation = (this.payloadMass * GRAVITY) / Math.max(totalMass * GRAVITY, 0.01);

    const rollCompensation = clamp(-this.cgBias.roll * 0.35, -12, 12);
    const pitchCompensation = clamp(-this.cgBias.pitch * 0.35, -12, 12);

    const payloadShiftEstimate = clamp(
      Math.abs(this.cgBias.roll) / 15 + Math.abs(this.cgBias.pitch) / 15 + Math.abs(verticalSpeed) / 8,
      0, 1.5
    );

    let releaseDetected = false;
    if (
      this.priorMass > 0.1 && this.payloadMass < this.priorMass * 0.5 &&
      Math.abs(verticalSpeed) > 0.5
    ) {
      releaseDetected = true;
    }
    this.priorMass = this.payloadMass;

    return { thrustCompensation, rollCompensation, pitchCompensation, payloadShiftEstimate, releaseDetected };
  }

  setReleaseProgress(progress: number): void {
    this.releaseProgress = clamp(progress, 0, 1);
    this.releaseInProgress = progress > 0 && progress < 1;
  }

  isReleasing(): boolean { return this.releaseInProgress; }
}

class WeatherAdaptation {
  private densityRatio = 1.0;
  private rainDragFactor = 0;
  private temperatureFactor = 1.0;

  update(weather: WeatherData): {
    thrustMultiplier: number;
    dragIncrease: number;
    stabilityFactor: number;
  } {
    const standardPressure = 1013.25;
    const standardTemp = 15;
    this.densityRatio = (weather.pressure / standardPressure) *
      ((standardTemp + 273.15) / (weather.temperature_c + 273.15));

    this.temperatureFactor = weather.temperature_c < 0 ? 0.92 :
      weather.temperature_c > 40 ? 0.95 : 1.0;

    this.rainDragFactor = weather.humidity > 90 ? 0.08 :
      weather.humidity > 80 ? 0.04 : 0;

    const thrustMultiplier = clamp(1 / Math.max(this.densityRatio, 0.5) * this.temperatureFactor, 0.8, 1.4);
    const dragIncrease = this.rainDragFactor;
    const stabilityFactor = clamp(this.densityRatio * this.temperatureFactor * (1 - this.rainDragFactor), 0.5, 1.2);

    return { thrustMultiplier, dragIncrease, stabilityFactor };
  }
}

class TakeoffAssist {
  private phase: "idle" | "pre_check" | "lift" | "initial_hover" | "stable" = "idle";
  private startTime = 0;
  private targetAlt = 3;
  private groundDistHistory: number[] = [];

  begin(targetAlt: number): void {
    this.phase = "pre_check";
    this.startTime = Date.now();
    this.targetAlt = targetAlt;
    this.groundDistHistory = [];
  }

  update(
    groundDistance: number,
    groundDistConfidence: number,
    altitude: number,
    verticalSpeed: number
  ): {
    phase: string;
    throttleOverride: number;
    altitudeTarget: number;
    complete: boolean;
  } {
    if (this.phase === "idle") {
      return { phase: "idle", throttleOverride: 0, altitudeTarget: 0, complete: false };
    }

    const elapsed = (Date.now() - this.startTime) / 1000;

    if (groundDistance > 0 && groundDistConfidence > 0.2) {
      this.groundDistHistory.push(groundDistance);
      if (this.groundDistHistory.length > 10) this.groundDistHistory.shift();
    }

    const effectiveAlt = groundDistance > 0 && groundDistConfidence > 0.3
      ? groundDistance * 0.6 + altitude * 0.4
      : altitude;

    if (this.phase === "pre_check") {
      if (elapsed > 2) {
        this.phase = "lift";
      }
      return { phase: "pre_check", throttleOverride: 0.05, altitudeTarget: 0.5, complete: false };
    }

    if (this.phase === "lift") {
      const liftProgress = clamp(effectiveAlt / Math.max(this.targetAlt * 0.7, 0.5), 0, 1);
      const throttle = clamp(0.55 + liftProgress * 0.15, 0.4, 0.75);

      if (effectiveAlt > this.targetAlt * 0.8) {
        this.phase = "initial_hover";
      }
      return { phase: "lift", throttleOverride: throttle, altitudeTarget: this.targetAlt, complete: false };
    }

    if (this.phase === "initial_hover") {
      const hoverError = this.targetAlt - effectiveAlt;
      const settling = Math.abs(verticalSpeed) < 0.3 && Math.abs(hoverError) < 0.5;

      if (settling && elapsed > 5) {
        this.phase = "stable";
      }
      return { phase: "initial_hover", throttleOverride: 0, altitudeTarget: this.targetAlt, complete: false };
    }

    return { phase: "stable", throttleOverride: 0, altitudeTarget: this.targetAlt, complete: true };
  }

  getPhase(): string { return this.phase; }
  reset(): void { this.phase = "idle"; }
}

export function MLStabilizationEngine() {
  const configRef = useRef<StabilizationConfig>(DEFAULT_CONFIG);
  const armedRef = useRef(false);
  const telemetryRef = useRef<TelemetrySnapshot>({});
  const weatherRef = useRef<WeatherData>({ temperature_c: 20, humidity: 50, pressure: 1013.25, iaq_score: 80 });
  const cameraRef = useRef<CameraFeatureData | null>(null);
  const flightPhaseRef = useRef<"ground" | "takeoff" | "flying" | "landing" | "rtl">("ground");
  const holdAltRef = useRef<number | null>(null);

  const kalmanRef = useRef(new ClientKalmanFilter());
  const predictorRef = useRef(new DisturbancePredictor());
  const groundEstRef = useRef(new GroundDistanceEstimator());
  const windEstRef = useRef(new WindEstimator());
  const payloadCompRef = useRef(new PayloadCompensator());
  const weatherAdaptRef = useRef(new WeatherAdaptation());
  const takeoffRef = useRef(new TakeoffAssist());

  const pidRollRef = useRef(createPID(-20, 20, 25));
  const pidPitchRef = useRef(createPID(-20, 20, 25));
  const pidYawRef = useRef(createPID(-18, 18, 20));
  const pidAltRef = useRef(createPID(-8, 8, 15));
  const pidVelXRef = useRef(createPID(-5, 5, 10));
  const pidVelYRef = useRef(createPID(-5, 5, 10));

  const lastTickRef = useRef(Date.now());
  const tickCountRef = useRef(0);
  const lastVerticalSpeedRef = useRef(0);
  const imuRef = useRef<IMUData>({ accelX: 0, accelY: 0, accelZ: -GRAVITY, gyroX: 0, gyroY: 0, gyroZ: 0 });

  const loadConfig = useCallback(() => {
    const raw = localStorage.getItem("mouse_ml_stabilization_config");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        configRef.current = { ...DEFAULT_CONFIG, ...parsed };
      } catch { /* keep defaults */ }
    }
  }, []);

  useEffect(() => {
    loadConfig();

    const onConfigChange = () => loadConfig();
    const onArm = (e: CustomEvent<{ armed: boolean }>) => {
      armedRef.current = Boolean(e.detail?.armed);
      if (!armedRef.current) {
        holdAltRef.current = null;
        flightPhaseRef.current = "ground";
        takeoffRef.current.reset();
      }
    };

    const onTelemetry = (e: CustomEvent<TelemetrySnapshot>) => {
      const d = e.detail;
      if (!d) return;
      telemetryRef.current = { ...telemetryRef.current, ...d };

      if (d.attitude) {
        kalmanRef.current.updateAttitude(
          [d.attitude.roll * Math.PI / 180, d.attitude.pitch * Math.PI / 180, d.attitude.yaw * Math.PI / 180],
          0.01
        );
      }
      if (d.altitude != null) {
        kalmanRef.current.updateAltitude(d.altitude, 0.5);
      }
      if (d.position) {
        kalmanRef.current.updatePosition([d.position.lat, d.position.lng, d.altitude ?? 0], 2.5);
      }

      if (d.verticalSpeed != null) lastVerticalSpeedRef.current = d.verticalSpeed;

      if (holdAltRef.current == null && armedRef.current) {
        holdAltRef.current = d.altitude ?? 20;
      }
    };

    const onWeather = (e: CustomEvent<WeatherData>) => {
      if (e.detail) weatherRef.current = e.detail;
    };

    const onIMU = (e: CustomEvent<IMUData>) => {
      if (e.detail) {
        imuRef.current = e.detail;
        kalmanRef.current.predict(0.02, [e.detail.accelX, e.detail.accelY, e.detail.accelZ], [e.detail.gyroX, e.detail.gyroY, e.detail.gyroZ]);
      }
    };

    const onCameraFeatures = (e: CustomEvent<CameraFeatureData>) => {
      if (e.detail) cameraRef.current = e.detail;
    };

    const onCommandAck = (e: CustomEvent<{ commandType?: string; command?: { type?: string; payload?: { altitude?: number } } }>) => {
      const cmd = String(e.detail?.commandType || e.detail?.command?.type || "").trim().toLowerCase();
      const payload = e.detail?.command?.payload || {};
      if (cmd === "takeoff") {
        flightPhaseRef.current = "takeoff";
        const targetAlt = payload.altitude ?? configRef.current.targetHoverAltitude;
        holdAltRef.current = targetAlt;
        if (configRef.current.takeoffAssistEnabled) {
          takeoffRef.current.begin(targetAlt);
        }
      } else if (cmd === "land") {
        flightPhaseRef.current = "landing";
        holdAltRef.current = 0;
      } else if (cmd === "rtl") {
        flightPhaseRef.current = "rtl";
      } else if (cmd === "abort") {
        holdAltRef.current = null;
        flightPhaseRef.current = "ground";
        takeoffRef.current.reset();
      }
    };

    const onPayloadRelease = (e: CustomEvent<{ progress: number }>) => {
      payloadCompRef.current.setReleaseProgress(e.detail?.progress ?? 0);
    };

    window.addEventListener("ml-stabilization-config-changed" as any, onConfigChange);
    window.addEventListener("arm-state-changed" as any, onArm);
    window.addEventListener("telemetry-update" as any, onTelemetry);
    window.addEventListener("weather-update" as any, onWeather);
    window.addEventListener("imu-update" as any, onIMU);
    window.addEventListener("camera-features" as any, onCameraFeatures);
    window.addEventListener("command-acked" as any, onCommandAck);
    window.addEventListener("payload-release" as any, onPayloadRelease);

    return () => {
      window.removeEventListener("ml-stabilization-config-changed" as any, onConfigChange);
      window.removeEventListener("arm-state-changed" as any, onArm);
      window.removeEventListener("telemetry-update" as any, onTelemetry);
      window.removeEventListener("weather-update" as any, onWeather);
      window.removeEventListener("imu-update" as any, onIMU);
      window.removeEventListener("camera-features" as any, onCameraFeatures);
      window.removeEventListener("command-acked" as any, onCommandAck);
      window.removeEventListener("payload-release" as any, onPayloadRelease);
    };
  }, [loadConfig]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!armedRef.current || !configRef.current.enabled) return;

      const cfg = configRef.current;
      const tel = telemetryRef.current;
      const now = Date.now();
      const dt = Math.max(0.05, Math.min(0.5, (now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      tickCountRef.current++;

      const attitude = tel.attitude ?? { pitch: 0, roll: 0, yaw: 0 };
      const currentAlt = tel.altitude ?? 0;
      const holdAlt = holdAltRef.current ?? currentAlt;
      const verticalSpeed = lastVerticalSpeedRef.current;
      const heading = tel.heading ?? 0;
      const groundSpeed = tel.groundSpeed ?? 0;
      const airSpeed = tel.airSpeed ?? groundSpeed;

      const ks = kalmanRef.current.getState();

      let groundDist = -1;
      let groundDistConf = 0;
      let groundDistMethod = "none";
      if (cfg.cameraGroundEstEnabled && cameraRef.current) {
        const camEst = groundEstRef.current.estimate(
          cameraRef.current,
          { roll: attitude.roll * Math.PI / 180, pitch: attitude.pitch * Math.PI / 180 },
          currentAlt
        );
        groundDist = camEst.distance;
        groundDistConf = camEst.confidence;
        groundDistMethod = camEst.method;
      }

      const windEst = cfg.windCompensationEnabled
        ? windEstRef.current.update(
            { x: imuRef.current.accelX, y: imuRef.current.accelY, z: imuRef.current.accelZ },
            { x: 0, y: 0, z: -GRAVITY },
            airSpeed, groundSpeed, heading
          )
        : { x: 0, y: 0, z: 0, gustLevel: 0 };

      const weatherAdapt = cfg.weatherAdaptationEnabled
        ? weatherAdaptRef.current.update(weatherRef.current)
        : { thrustMultiplier: 1, dragIncrease: 0, stabilityFactor: 1 };

      const payloadComp = cfg.payloadCompensationEnabled
        ? payloadCompRef.current.update(attitude, verticalSpeed, { payloadMass: cfg.payloadMass, vehicleMass: cfg.vehicleMass })
        : { thrustCompensation: 0, rollCompensation: 0, pitchCompensation: 0, payloadShiftEstimate: 0, releaseDetected: false };

      let takeoffState = { phase: "idle", throttleOverride: 0, altitudeTarget: holdAlt, complete: false };
      if (cfg.takeoffAssistEnabled && flightPhaseRef.current === "takeoff") {
        takeoffState = takeoffRef.current.update(groundDist, groundDistConf, currentAlt, verticalSpeed);
        if (takeoffState.complete) {
          flightPhaseRef.current = "flying";
        }
      }

      const features = [
        attitude.roll, attitude.pitch, attitude.yaw,
        ks.velocity.x, ks.velocity.y, ks.velocity.z,
        imuRef.current.gyroX, imuRef.current.gyroY, imuRef.current.gyroZ,
        windEst.x, windEst.y, windEst.z,
        cfg.payloadMass, payloadComp.payloadShiftEstimate,
        weatherRef.current.pressure, weatherRef.current.temperature_c,
        weatherRef.current.humidity, windEst.gustLevel,
        currentAlt - holdAlt, verticalSpeed,
        groundSpeed, airSpeed,
        tel.vibrationX ?? 0, tel.vibrationY ?? 0,
      ];

      predictorRef.current.addSample(features);
      let mlPrediction = new Array(9).fill(0);
      let mlConfidence = 0;

      if (cfg.mlAssistEnabled) {
        mlPrediction = predictorRef.current.forward(features);
        mlConfidence = predictorRef.current.getConfidence();
      }

      const frameProfile = FRAME_ARCH_PROFILES[cfg.frameType] ?? FRAME_ARCH_PROFILES.quad_x;

      const disturbanceScale = 1 + windEst.gustLevel * 0.6 + payloadComp.payloadShiftEstimate * 0.5;
      const adaptiveKp = cfg.adaptiveGainsEnabled ? 0.22 * disturbanceScale * weatherAdapt.stabilityFactor : 0.22;
      const adaptiveKi = cfg.adaptiveGainsEnabled ? 0.06 * disturbanceScale : 0.06;
      const adaptiveKd = cfg.adaptiveGainsEnabled ? 0.12 * disturbanceScale * weatherAdapt.stabilityFactor : 0.12;

      const rollKp = adaptiveKp * frameProfile.rollGainScale;
      const rollKi = adaptiveKi * frameProfile.rollGainScale;
      const rollKd = adaptiveKd * frameProfile.rollGainScale;
      const pitchKp = adaptiveKp * frameProfile.pitchGainScale;
      const pitchKi = adaptiveKi * frameProfile.pitchGainScale;
      const pitchKd = adaptiveKd * frameProfile.pitchGainScale;
      const thrustScale = frameProfile.thrustGainScale;

      const rollError = -attitude.roll + payloadComp.rollCompensation;
      const pitchError = -attitude.pitch + payloadComp.pitchCompensation;
      const altError = holdAlt - currentAlt;

      const rollCorr = computePID(pidRollRef.current, rollError, rollKp, rollKi, rollKd, dt);
      const pitchCorr = computePID(pidPitchRef.current, pitchError, pitchKp, pitchKi, pitchKd, dt);
      const altCorr = computePID(pidAltRef.current, altError, adaptiveKp * 0.55 * thrustScale, adaptiveKi * 1.1 * thrustScale, adaptiveKd * 0.65 * thrustScale, dt);

      const windYawCorr = cfg.windCompensationEnabled
        ? clamp(-Math.atan2(windEst.y, windEst.x + 0.001) * 2, -8, 8) : 0;
      const yawCorr = computePID(pidYawRef.current, windYawCorr, 0.15 * frameProfile.yawGainScale, 0.03 * frameProfile.yawGainScale, 0.08 * frameProfile.yawGainScale, dt);

      const mlRollAdj = mlConfidence * (mlPrediction[0] ?? 0) * 0.15;
      const mlPitchAdj = mlConfidence * (mlPrediction[1] ?? 0) * 0.15;
      const mlAltAdj = mlConfidence * (mlPrediction[2] ?? 0) * 0.1;

      let finalRoll = clamp(rollCorr + mlRollAdj, -cfg.maxRollCorrection, cfg.maxRollCorrection);
      let finalPitch = clamp(pitchCorr + mlPitchAdj, -cfg.maxPitchCorrection, cfg.maxPitchCorrection);
      let finalThrottle = clamp(
        (altCorr + mlAltAdj + payloadComp.thrustCompensation * 4) * weatherAdapt.thrustMultiplier,
        -cfg.maxThrottleCorrection, cfg.maxThrottleCorrection
      );
      const finalYaw = clamp(yawCorr, -16, 16);

      if (takeoffState.phase === "lift" && takeoffState.throttleOverride > 0) {
        finalThrottle = clamp(takeoffState.throttleOverride * 10, 2, 8);
        finalRoll *= 0.3;
        finalPitch *= 0.3;
      }

      const windForwardCorr = cfg.windCompensationEnabled
        ? clamp(-windEst.x * 0.12, -3, 3) : 0;
      const windLateralCorr = cfg.windCompensationEnabled
        ? clamp(-windEst.y * 0.12, -3, 3) : 0;

      if (tickCountRef.current % 8 === 0 && cfg.mlAssistEnabled) {
        const actualDisturbance = [
          rollError, pitchError, altError,
          windEst.x, windEst.y, windEst.z,
          payloadComp.payloadShiftEstimate, windEst.gustLevel,
          weatherAdapt.stabilityFactor,
        ];
        predictorRef.current.addTrainingSample(features, actualDisturbance);
        predictorRef.current.train();
      }

      window.dispatchEvent(new CustomEvent("stabilizer-command", {
        detail: {
          command: "stabilize_adjust",
          source: "ml_stabilizer",
          corrections: {
            roll: finalRoll,
            pitch: finalPitch,
            yaw: finalYaw,
            throttle: finalThrottle,
            forward: windForwardCorr,
            lateral: windLateralCorr,
          },
          mlConfidence,
          payloadShiftEstimate: payloadComp.payloadShiftEstimate,
          obstacleRisk: "none",
        },
      }));

      const modelInfo = predictorRef.current.getModelInfo();

      window.dispatchEvent(new CustomEvent("stabilizer-status", {
        detail: {
          armed: armedRef.current,
          payloadShiftEstimate: Math.round(payloadComp.payloadShiftEstimate * 100) / 100,
          disturbanceCompensation: Math.round(disturbanceScale * 100) / 100,
          holdAltitude: holdAlt,
          altitudeError: Math.round((holdAlt - currentAlt) * 100) / 100,
          adaptiveScale: Math.round(disturbanceScale * 100) / 100,
        },
      }));

      window.dispatchEvent(new CustomEvent("ml-stabilization-status", {
        detail: {
          enabled: cfg.enabled,
          armed: armedRef.current,
          flightPhase: flightPhaseRef.current,
          takeoffPhase: takeoffState.phase,

          kalmanState: ks,

          mlEnabled: cfg.mlAssistEnabled,
          mlConfidence: Math.round(mlConfidence * 1000) / 1000,
          mlTrained: modelInfo.trained,
          mlEpochs: modelInfo.epochs,
          mlLoss: modelInfo.loss > 0 ? Math.round(modelInfo.loss * 10000) / 10000 : -1,
          mlTrainingDataSize: modelInfo.trainingDataSize,
          mlPrediction: mlPrediction.slice(0, 6).map(v => Math.round(v * 100) / 100),

          groundDistance: Math.round(groundDist * 100) / 100,
          groundDistConfidence: Math.round(groundDistConf * 100) / 100,
          groundDistMethod,

          windEstimate: {
            x: Math.round(windEst.x * 100) / 100,
            y: Math.round(windEst.y * 100) / 100,
            z: Math.round(windEst.z * 100) / 100,
            gustLevel: Math.round(windEst.gustLevel * 100) / 100,
          },

          weatherAdaptation: {
            thrustMultiplier: Math.round(weatherAdapt.thrustMultiplier * 1000) / 1000,
            dragIncrease: Math.round(weatherAdapt.dragIncrease * 1000) / 1000,
            stabilityFactor: Math.round(weatherAdapt.stabilityFactor * 1000) / 1000,
          },

          payloadCompensation: {
            thrustComp: Math.round(payloadComp.thrustCompensation * 1000) / 1000,
            rollComp: Math.round(payloadComp.rollCompensation * 100) / 100,
            pitchComp: Math.round(payloadComp.pitchCompensation * 100) / 100,
            shiftEstimate: Math.round(payloadComp.payloadShiftEstimate * 100) / 100,
            releaseDetected: payloadComp.releaseDetected,
          },

          corrections: {
            roll: Math.round(finalRoll * 100) / 100,
            pitch: Math.round(finalPitch * 100) / 100,
            yaw: Math.round(finalYaw * 100) / 100,
            throttle: Math.round(finalThrottle * 100) / 100,
            forward: Math.round(windForwardCorr * 100) / 100,
            lateral: Math.round(windLateralCorr * 100) / 100,
          },

          adaptiveGains: {
            kp: Math.round(adaptiveKp * 1000) / 1000,
            ki: Math.round(adaptiveKi * 1000) / 1000,
            kd: Math.round(adaptiveKd * 1000) / 1000,
          },

          frameType: cfg.frameType,
          frameProfile: {
            label: (cfg.frameType ?? "quad_x").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            motorCount: frameProfile.motorCount,
            redundancyLevel: frameProfile.redundancyLevel,
            rollGainScale: frameProfile.rollGainScale,
            pitchGainScale: frameProfile.pitchGainScale,
            yawGainScale: frameProfile.yawGainScale,
            thrustGainScale: frameProfile.thrustGainScale,
          },
        },
      }));
    }, LOOP_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return null;
}
