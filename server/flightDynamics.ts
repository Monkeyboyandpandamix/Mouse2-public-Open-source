const GRAVITY = 9.80665;
const AIR_DENSITY_SEA_LEVEL = 1.225;
const DRAG_COEFF = 0.47;

export interface QuadrotorParams {
  mass: number;
  armLength: number;
  motorCount: number;
  propDiameter: number;
  maxThrust: number;
  dragArea: number;
  momentOfInertiaX: number;
  momentOfInertiaY: number;
  momentOfInertiaZ: number;
  thrustCoeff: number;
  torqueCoeff: number;
}

export interface VehicleState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  attitude: { roll: number; pitch: number; yaw: number };
  angularRate: { p: number; q: number; r: number };
  motorRpms: number[];
  timestamp: number;
}

export interface EnvironmentState {
  windSpeed: { x: number; y: number; z: number };
  windGusts: number;
  airDensity: number;
  temperature: number;
  humidity: number;
  pressure: number;
  turbulenceIntensity: number;
  rainIntensity: number;
}

export interface PayloadState {
  mass: number;
  cgOffset: { x: number; y: number; z: number };
  momentOfInertia: { x: number; y: number; z: number };
  isReleasing: boolean;
  releaseProgress: number;
}

export interface StabilizationOutput {
  thrustCorrections: number[];
  attitudeCorrections: { roll: number; pitch: number; yaw: number };
  throttleCorrection: number;
  mlConfidence: number;
  predictedDisturbance: { x: number; y: number; z: number };
  estimatedGroundDistance: number;
  windCompensation: { x: number; y: number; z: number };
  payloadCompensation: { roll: number; pitch: number; yaw: number; thrust: number };
  kalmanState: KalmanState;
  dynamicsModel: DynamicsSnapshot;
}

export interface KalmanState {
  estimatedPosition: { x: number; y: number; z: number };
  estimatedVelocity: { x: number; y: number; z: number };
  estimatedAttitude: { roll: number; pitch: number; yaw: number };
  estimatedBias: { ax: number; ay: number; az: number; gx: number; gy: number; gz: number };
  positionUncertainty: number;
  velocityUncertainty: number;
  attitudeUncertainty: number;
}

export interface DynamicsSnapshot {
  totalThrust: number;
  dragForce: { x: number; y: number; z: number };
  gravityForce: number;
  netForce: { x: number; y: number; z: number };
  netTorque: { x: number; y: number; z: number };
  thrustToWeightRatio: number;
  powerConsumption: number;
}

export interface SensorReadings {
  imu: {
    accelX: number; accelY: number; accelZ: number;
    gyroX: number; gyroY: number; gyroZ: number;
    magX: number; magY: number; magZ: number;
    temperature: number;
  };
  barometer: { pressure: number; temperature: number; altitude: number };
  gps: { lat: number; lng: number; alt: number; hdop: number; vdop: number; satellites: number; fix: number };
  rangefinder: { distance: number; valid: boolean };
  opticalFlow: { flowX: number; flowY: number; quality: number };
  cameraGroundDistance: { distance: number; confidence: number; method: string };
}

export interface MLModelWeights {
  disturbancePrediction: {
    inputWeights: number[][];
    hiddenWeights: number[][];
    outputWeights: number[][];
    biases: { hidden1: number[]; hidden2: number[]; output: number[] };
  };
  adaptiveGains: {
    gainNetwork: number[][];
    biases: number[];
  };
  groundDistance: {
    featureWeights: number[];
    bias: number;
  };
}

export type FrameType = "quad_x" | "quad_plus" | "quad_h" | "hex_x" | "hex_plus" | "octo_x" | "octo_plus" | "octo_v" | "y6" | "y4" | "tri" | "coax_quad";

export interface FrameGeometry {
  frameType: FrameType;
  label: string;
  motorCount: number;
  motorAngles: number[];
  motorDirections: number[];
  yawFactors: number[];
  rollFactors: number[];
  pitchFactors: number[];
  thrustFactors: number[];
  defaultArmLength: number;
  defaultMass: number;
  description: string;
}

export const FRAME_GEOMETRIES: Record<FrameType, FrameGeometry> = {
  quad_x: {
    frameType: "quad_x", label: "Quadcopter X", motorCount: 4,
    motorAngles: [45, 135, 225, 315],
    motorDirections: [1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1],
    rollFactors: [0.707, -0.707, -0.707, 0.707],
    pitchFactors: [0.707, 0.707, -0.707, -0.707],
    thrustFactors: [1, 1, 1, 1],
    defaultArmLength: 0.25, defaultMass: 2.5,
    description: "Standard X configuration quadcopter",
  },
  quad_plus: {
    frameType: "quad_plus", label: "Quadcopter +", motorCount: 4,
    motorAngles: [0, 90, 180, 270],
    motorDirections: [1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1],
    rollFactors: [0, -1, 0, 1],
    pitchFactors: [1, 0, -1, 0],
    thrustFactors: [1, 1, 1, 1],
    defaultArmLength: 0.25, defaultMass: 2.5,
    description: "Plus configuration quadcopter",
  },
  quad_h: {
    frameType: "quad_h", label: "Quadcopter H", motorCount: 4,
    motorAngles: [45, 135, 225, 315],
    motorDirections: [1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1],
    rollFactors: [0.707, -0.707, -0.707, 0.707],
    pitchFactors: [0.5, 0.5, -0.5, -0.5],
    thrustFactors: [1, 1, 1, 1],
    defaultArmLength: 0.3, defaultMass: 3.0,
    description: "H-frame quadcopter with elongated body",
  },
  hex_x: {
    frameType: "hex_x", label: "Hexacopter X", motorCount: 6,
    motorAngles: [30, 90, 150, 210, 270, 330],
    motorDirections: [1, -1, 1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1, 1, -1],
    rollFactors: [0.5, 1, 0.5, -0.5, -1, -0.5],
    pitchFactors: [0.866, 0, -0.866, -0.866, 0, 0.866],
    thrustFactors: [1, 1, 1, 1, 1, 1],
    defaultArmLength: 0.35, defaultMass: 4.0,
    description: "X configuration hexacopter — motor redundancy for safety",
  },
  hex_plus: {
    frameType: "hex_plus", label: "Hexacopter +", motorCount: 6,
    motorAngles: [0, 60, 120, 180, 240, 300],
    motorDirections: [1, -1, 1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1, 1, -1],
    rollFactors: [0, 0.866, 0.866, 0, -0.866, -0.866],
    pitchFactors: [1, 0.5, -0.5, -1, -0.5, 0.5],
    thrustFactors: [1, 1, 1, 1, 1, 1],
    defaultArmLength: 0.35, defaultMass: 4.0,
    description: "Plus configuration hexacopter",
  },
  octo_x: {
    frameType: "octo_x", label: "Octocopter X", motorCount: 8,
    motorAngles: [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5],
    motorDirections: [1, -1, 1, -1, 1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1, 1, -1, 1, -1],
    rollFactors: [0.383, 0.924, 0.924, 0.383, -0.383, -0.924, -0.924, -0.383],
    pitchFactors: [0.924, 0.383, -0.383, -0.924, -0.924, -0.383, 0.383, 0.924],
    thrustFactors: [1, 1, 1, 1, 1, 1, 1, 1],
    defaultArmLength: 0.4, defaultMass: 6.0,
    description: "X configuration octocopter — heavy lift with redundancy",
  },
  octo_plus: {
    frameType: "octo_plus", label: "Octocopter +", motorCount: 8,
    motorAngles: [0, 45, 90, 135, 180, 225, 270, 315],
    motorDirections: [1, -1, 1, -1, 1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1, 1, -1, 1, -1],
    rollFactors: [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707],
    pitchFactors: [1, 0.707, 0, -0.707, -1, -0.707, 0, 0.707],
    thrustFactors: [1, 1, 1, 1, 1, 1, 1, 1],
    defaultArmLength: 0.4, defaultMass: 6.0,
    description: "Plus configuration octocopter",
  },
  octo_v: {
    frameType: "octo_v", label: "Octocopter V", motorCount: 8,
    motorAngles: [15, 45, 135, 165, 195, 225, 315, 345],
    motorDirections: [1, -1, 1, -1, 1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1, 1, -1, 1, -1],
    rollFactors: [0.259, 0.707, 0.707, 0.259, -0.259, -0.707, -0.707, -0.259],
    pitchFactors: [0.966, 0.707, -0.707, -0.966, -0.966, -0.707, 0.707, 0.966],
    thrustFactors: [1, 1, 1, 1, 1, 1, 1, 1],
    defaultArmLength: 0.4, defaultMass: 6.5,
    description: "V-layout octocopter for improved forward flight",
  },
  y6: {
    frameType: "y6", label: "Y6 (Coaxial Tri)", motorCount: 6,
    motorAngles: [0, 0, 120, 120, 240, 240],
    motorDirections: [1, -1, 1, -1, 1, -1],
    yawFactors: [1, -1, 1, -1, 1, -1],
    rollFactors: [0, 0, 0.866, 0.866, -0.866, -0.866],
    pitchFactors: [1, 1, -0.5, -0.5, -0.5, -0.5],
    thrustFactors: [1, 0.9, 1, 0.9, 1, 0.9],
    defaultArmLength: 0.35, defaultMass: 3.5,
    description: "Y6 coaxial — 3 arms, 6 motors, compact with redundancy",
  },
  y4: {
    frameType: "y4", label: "Y4 Copter", motorCount: 4,
    motorAngles: [30, 330, 180, 180],
    motorDirections: [1, -1, 1, -1],
    yawFactors: [0, 0, 1, -1],
    rollFactors: [0.5, -0.5, 0, 0],
    pitchFactors: [0.866, 0.866, -1, -1],
    thrustFactors: [1, 1, 0.8, 0.8],
    defaultArmLength: 0.3, defaultMass: 2.0,
    description: "Y4 tricopter-style with rear coaxial pair",
  },
  tri: {
    frameType: "tri", label: "Tricopter", motorCount: 3,
    motorAngles: [0, 120, 240],
    motorDirections: [1, 1, 1],
    yawFactors: [0, 0, 0],
    rollFactors: [0, 0.866, -0.866],
    pitchFactors: [1, -0.5, -0.5],
    thrustFactors: [1, 1, 1],
    defaultArmLength: 0.35, defaultMass: 1.8,
    description: "Tricopter — uses servo-tilting rear motor for yaw",
  },
  coax_quad: {
    frameType: "coax_quad", label: "Coaxial Quad", motorCount: 8,
    motorAngles: [45, 45, 135, 135, 225, 225, 315, 315],
    motorDirections: [1, -1, -1, 1, 1, -1, -1, 1],
    yawFactors: [1, -1, -1, 1, 1, -1, -1, 1],
    rollFactors: [0.707, 0.707, -0.707, -0.707, -0.707, -0.707, 0.707, 0.707],
    pitchFactors: [0.707, 0.707, 0.707, 0.707, -0.707, -0.707, -0.707, -0.707],
    thrustFactors: [1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9],
    defaultArmLength: 0.25, defaultMass: 4.5,
    description: "Coaxial quad — 4 arms, 8 motors stacked for compactness",
  },
};

const DEFAULT_QUAD_PARAMS: QuadrotorParams = {
  mass: 2.5,
  armLength: 0.25,
  motorCount: 4,
  propDiameter: 0.254,
  maxThrust: 15,
  dragArea: 0.04,
  momentOfInertiaX: 0.0142,
  momentOfInertiaY: 0.0142,
  momentOfInertiaZ: 0.0284,
  thrustCoeff: 1.0e-5,
  torqueCoeff: 1.0e-7,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-clamp(x, -10, 10)));
}

function tanh(x: number): number {
  return Math.tanh(clamp(x, -10, 10));
}

function relu(x: number): number {
  return Math.max(0, x);
}

function matVecMul(mat: number[][], vec: number[]): number[] {
  return mat.map(row => row.reduce((sum, w, i) => sum + w * (vec[i] ?? 0), 0));
}

function vecAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

class ExtendedKalmanFilter {
  private stateSize = 15;
  private x: number[];
  private P: number[][];
  private Q: number[][];
  private R_gps: number[][];
  private R_baro: number[];
  private R_imu: number[];
  private lastUpdateTime: number;

  constructor() {
    this.x = new Array(this.stateSize).fill(0);
    this.P = this.identity(this.stateSize, 1.0);
    this.Q = this.identity(this.stateSize, 0.01);
    this.R_gps = this.identity(3, 2.5);
    this.R_baro = [0.5];
    this.R_imu = [0.02, 0.02, 0.02, 0.005, 0.005, 0.005];
    this.lastUpdateTime = Date.now();

    this.Q[0][0] = 0.001; this.Q[1][1] = 0.001; this.Q[2][2] = 0.001;
    this.Q[3][3] = 0.01; this.Q[4][4] = 0.01; this.Q[5][5] = 0.01;
    this.Q[6][6] = 0.005; this.Q[7][7] = 0.005; this.Q[8][8] = 0.005;
    this.Q[9][9] = 0.0001; this.Q[10][10] = 0.0001; this.Q[11][11] = 0.0001;
    this.Q[12][12] = 0.0001; this.Q[13][13] = 0.0001; this.Q[14][14] = 0.0001;
  }

  private identity(n: number, scale: number): number[][] {
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? scale : 0))
    );
  }

  predict(dt: number, imuAccel: number[], imuGyro: number[]): void {
    const ax = imuAccel[0] - this.x[9];
    const ay = imuAccel[1] - this.x[10];
    const az = imuAccel[2] - this.x[11];

    this.x[0] += this.x[3] * dt + 0.5 * ax * dt * dt;
    this.x[1] += this.x[4] * dt + 0.5 * ay * dt * dt;
    this.x[2] += this.x[5] * dt + 0.5 * az * dt * dt;

    this.x[3] += ax * dt;
    this.x[4] += ay * dt;
    this.x[5] += az * dt;

    const gx = imuGyro[0] - this.x[12];
    const gy = imuGyro[1] - this.x[13];
    const gz = imuGyro[2] - this.x[14];
    this.x[6] += gx * dt;
    this.x[7] += gy * dt;
    this.x[8] += gz * dt;

    for (let i = 0; i < this.stateSize; i++) {
      this.P[i][i] += this.Q[i][i] * dt;
    }
  }

  updateGPS(lat: number, lng: number, alt: number, hdop: number): void {
    const R_scale = Math.max(1, hdop);
    const pos = [lat, lng, alt];
    for (let i = 0; i < 3; i++) {
      const innovation = pos[i] - this.x[i];
      const S = this.P[i][i] + this.R_gps[i][i] * R_scale;
      const K = this.P[i][i] / Math.max(S, 1e-10);
      this.x[i] += K * innovation;
      this.P[i][i] *= (1 - K);
    }
  }

  updateBarometer(altitude: number): void {
    const innovation = altitude - this.x[2];
    const S = this.P[2][2] + this.R_baro[0];
    const K = this.P[2][2] / Math.max(S, 1e-10);
    this.x[2] += K * innovation;
    this.x[5] += K * 0.3 * innovation;
    this.P[2][2] *= (1 - K);
  }

  updateIMU(accel: number[], gyro: number[]): void {
    for (let i = 0; i < 3; i++) {
      const innovation = accel[i] - (this.x[3 + i] + this.x[9 + i]);
      const S = this.P[3 + i][3 + i] + this.R_imu[i];
      const K = this.P[3 + i][3 + i] / Math.max(S, 1e-10);
      this.x[3 + i] += K * innovation;
      this.P[3 + i][3 + i] *= (1 - K);
    }
    for (let i = 0; i < 3; i++) {
      const innovation = gyro[i] - (this.x[6 + i] + this.x[12 + i]);
      const S = this.P[6 + i][6 + i] + this.R_imu[3 + i];
      const K = this.P[6 + i][6 + i] / Math.max(S, 1e-10);
      this.x[6 + i] += K * innovation;
      this.P[6 + i][6 + i] *= (1 - K);
    }
  }

  updateRangefinder(distance: number): void {
    const cosRoll = Math.cos(this.x[6]);
    const cosPitch = Math.cos(this.x[7]);
    const projectedAlt = distance * cosRoll * cosPitch;
    const innovation = projectedAlt - this.x[2];
    const R = 0.1;
    const S = this.P[2][2] + R;
    const K = this.P[2][2] / Math.max(S, 1e-10);
    this.x[2] += K * innovation;
    this.P[2][2] *= (1 - K);
  }

  getState(): KalmanState {
    const posUncertainty = Math.sqrt(this.P[0][0] + this.P[1][1] + this.P[2][2]);
    const velUncertainty = Math.sqrt(this.P[3][3] + this.P[4][4] + this.P[5][5]);
    const attUncertainty = Math.sqrt(this.P[6][6] + this.P[7][7] + this.P[8][8]);
    return {
      estimatedPosition: { x: this.x[0], y: this.x[1], z: this.x[2] },
      estimatedVelocity: { x: this.x[3], y: this.x[4], z: this.x[5] },
      estimatedAttitude: { roll: this.x[6], pitch: this.x[7], yaw: this.x[8] },
      estimatedBias: {
        ax: this.x[9], ay: this.x[10], az: this.x[11],
        gx: this.x[12], gy: this.x[13], gz: this.x[14],
      },
      positionUncertainty: posUncertainty,
      velocityUncertainty: velUncertainty,
      attitudeUncertainty: attUncertainty,
    };
  }

  setTimestamp(ts: number) { this.lastUpdateTime = ts; }
  getTimestamp() { return this.lastUpdateTime; }
}

class MLDisturbancePredictor {
  private historyBuffer: number[][] = [];
  private maxHistory = 50;
  private hiddenSize1 = 32;
  private hiddenSize2 = 16;
  private inputSize = 18;
  private outputSize = 6;
  private weights: MLModelWeights;
  private trainingData: { input: number[]; output: number[] }[] = [];
  private maxTrainingData = 2000;
  private learningRate = 0.001;
  private trained = false;
  private epochCount = 0;

  constructor() {
    this.weights = this.initializeWeights();
  }

  private initializeWeights(): MLModelWeights {
    const xavier = (fanIn: number, fanOut: number) => {
      const limit = Math.sqrt(6 / (fanIn + fanOut));
      return () => (Math.random() * 2 - 1) * limit;
    };

    const makeMatrix = (rows: number, cols: number, init: () => number): number[][] =>
      Array.from({ length: rows }, () => Array.from({ length: cols }, init));

    const makeVector = (size: number, init: () => number): number[] =>
      Array.from({ length: size }, init);

    const w1Init = xavier(this.inputSize, this.hiddenSize1);
    const w2Init = xavier(this.hiddenSize1, this.hiddenSize2);
    const w3Init = xavier(this.hiddenSize2, this.outputSize);

    return {
      disturbancePrediction: {
        inputWeights: makeMatrix(this.hiddenSize1, this.inputSize, w1Init),
        hiddenWeights: makeMatrix(this.hiddenSize2, this.hiddenSize1, w2Init),
        outputWeights: makeMatrix(this.outputSize, this.hiddenSize2, w3Init),
        biases: {
          hidden1: makeVector(this.hiddenSize1, () => 0),
          hidden2: makeVector(this.hiddenSize2, () => 0),
          output: makeVector(this.outputSize, () => 0),
        },
      },
      adaptiveGains: {
        gainNetwork: makeMatrix(6, this.inputSize, xavier(this.inputSize, 6)),
        biases: makeVector(6, () => 0.5),
      },
      groundDistance: {
        featureWeights: makeVector(8, () => Math.random() * 0.1),
        bias: 10.0,
      },
    };
  }

  addToHistory(features: number[]): void {
    this.historyBuffer.push(features.slice(0, this.inputSize));
    if (this.historyBuffer.length > this.maxHistory) {
      this.historyBuffer.shift();
    }
  }

  predict(currentFeatures: number[]): { disturbance: number[]; confidence: number; gains: number[] } {
    const input = currentFeatures.slice(0, this.inputSize);
    while (input.length < this.inputSize) input.push(0);

    const dp = this.weights.disturbancePrediction;
    const h1Raw = vecAdd(matVecMul(dp.inputWeights, input), dp.biases.hidden1);
    const h1 = h1Raw.map(relu);
    const h2Raw = vecAdd(matVecMul(dp.hiddenWeights, h1), dp.biases.hidden2);
    const h2 = h2Raw.map(relu);
    const outRaw = vecAdd(matVecMul(dp.outputWeights, h2), dp.biases.output);
    const disturbance = outRaw.map(v => tanh(v) * 5.0);

    const ag = this.weights.adaptiveGains;
    const gainsRaw = vecAdd(matVecMul(ag.gainNetwork, input), ag.biases);
    const gains = gainsRaw.map(v => sigmoid(v) * 2.0);

    const energyInHistory = this.historyBuffer.length > 5
      ? this.historyBuffer.slice(-10).reduce((sum, h) => {
          const energy = h.reduce((s, v) => s + v * v, 0);
          return sum + energy;
        }, 0) / Math.min(10, this.historyBuffer.length)
      : 0;
    const baseConfidence = this.trained ? 0.7 : 0.3;
    const historyFactor = clamp(this.historyBuffer.length / this.maxHistory, 0, 1);
    const stabilityFactor = clamp(1 - energyInHistory / 100, 0, 1);
    const confidence = clamp(baseConfidence * historyFactor * (0.5 + 0.5 * stabilityFactor), 0.05, 0.98);

    return { disturbance, confidence, gains };
  }

  addTrainingSample(input: number[], actualDisturbance: number[]): void {
    this.trainingData.push({
      input: input.slice(0, this.inputSize),
      output: actualDisturbance.slice(0, this.outputSize),
    });
    if (this.trainingData.length > this.maxTrainingData) {
      this.trainingData.shift();
    }
  }

  trainStep(): { loss: number; epochCount: number } {
    if (this.trainingData.length < 20) return { loss: -1, epochCount: this.epochCount };

    let totalLoss = 0;
    const batchSize = Math.min(32, this.trainingData.length);
    const indices: number[] = [];
    for (let i = 0; i < batchSize; i++) {
      indices.push(Math.floor(Math.random() * this.trainingData.length));
    }

    for (const idx of indices) {
      const sample = this.trainingData[idx];
      const input = sample.input;
      const target = sample.output;

      const dp = this.weights.disturbancePrediction;
      const h1Raw = vecAdd(matVecMul(dp.inputWeights, input), dp.biases.hidden1);
      const h1 = h1Raw.map(relu);
      const h2Raw = vecAdd(matVecMul(dp.hiddenWeights, h1), dp.biases.hidden2);
      const h2 = h2Raw.map(relu);
      const outRaw = vecAdd(matVecMul(dp.outputWeights, h2), dp.biases.output);
      const predicted = outRaw.map(v => tanh(v) * 5.0);

      const outputError = predicted.map((p, i) => p - (target[i] ?? 0));
      const sampleLoss = outputError.reduce((s, e) => s + e * e, 0) / outputError.length;
      totalLoss += sampleLoss;

      const dOutput = outputError.map((e, i) => {
        const t = tanh(outRaw[i]);
        return e * (1 - t * t) * 5.0;
      });

      for (let i = 0; i < this.outputSize; i++) {
        for (let j = 0; j < this.hiddenSize2; j++) {
          dp.outputWeights[i][j] -= this.learningRate * dOutput[i] * h2[j];
        }
        dp.biases.output[i] -= this.learningRate * dOutput[i];
      }

      const dH2 = new Array(this.hiddenSize2).fill(0);
      for (let j = 0; j < this.hiddenSize2; j++) {
        for (let i = 0; i < this.outputSize; i++) {
          dH2[j] += dOutput[i] * dp.outputWeights[i][j];
        }
        dH2[j] *= h2Raw[j] > 0 ? 1 : 0;
      }

      for (let i = 0; i < this.hiddenSize2; i++) {
        for (let j = 0; j < this.hiddenSize1; j++) {
          dp.hiddenWeights[i][j] -= this.learningRate * dH2[i] * h1[j];
        }
        dp.biases.hidden2[i] -= this.learningRate * dH2[i];
      }

      const dH1 = new Array(this.hiddenSize1).fill(0);
      for (let j = 0; j < this.hiddenSize1; j++) {
        for (let i = 0; i < this.hiddenSize2; i++) {
          dH1[j] += dH2[i] * dp.hiddenWeights[i][j];
        }
        dH1[j] *= h1Raw[j] > 0 ? 1 : 0;
      }

      for (let i = 0; i < this.hiddenSize1; i++) {
        for (let j = 0; j < this.inputSize; j++) {
          dp.inputWeights[i][j] -= this.learningRate * dH1[i] * (input[j] ?? 0);
        }
        dp.biases.hidden1[i] -= this.learningRate * dH1[i];
      }
    }

    this.epochCount++;
    if (this.epochCount > 10) this.trained = true;
    return { loss: totalLoss / batchSize, epochCount: this.epochCount };
  }

  isTrained(): boolean { return this.trained; }
  getEpochCount(): number { return this.epochCount; }
  getTrainingDataSize(): number { return this.trainingData.length; }
}

class WindModel {
  private baseWind = { x: 0, y: 0, z: 0 };
  private gustAmplitude = 0;
  private gustFrequency = 0.3;
  private turbulence = 0;
  private phase = Math.random() * Math.PI * 2;

  update(env: EnvironmentState): void {
    this.baseWind = { ...env.windSpeed };
    this.gustAmplitude = env.windGusts;
    this.turbulence = env.turbulenceIntensity;
  }

  getWindAtTime(t: number): { x: number; y: number; z: number } {
    const gustX = this.gustAmplitude * Math.sin(this.gustFrequency * t + this.phase) *
      (1 + this.turbulence * Math.sin(2.7 * t + 1.3));
    const gustY = this.gustAmplitude * Math.cos(this.gustFrequency * t * 0.8 + this.phase + 1.5) *
      (1 + this.turbulence * Math.cos(1.9 * t + 0.7));
    const gustZ = this.gustAmplitude * 0.3 * Math.sin(1.5 * this.gustFrequency * t + this.phase + 3.0);

    const turbX = this.turbulence * 2.0 * (Math.sin(5.3 * t) * Math.cos(3.1 * t + 0.5));
    const turbY = this.turbulence * 2.0 * (Math.cos(4.7 * t + 1.2) * Math.sin(2.8 * t));
    const turbZ = this.turbulence * 1.0 * Math.sin(6.1 * t + 2.3);

    return {
      x: this.baseWind.x + gustX + turbX,
      y: this.baseWind.y + gustY + turbY,
      z: this.baseWind.z + gustZ + turbZ,
    };
  }

  estimateWindFromIMU(
    measuredAccel: { x: number; y: number; z: number },
    expectedAccel: { x: number; y: number; z: number },
    airDensity: number,
    dragArea: number,
    mass: number
  ): { x: number; y: number; z: number } {
    const residualX = measuredAccel.x - expectedAccel.x;
    const residualY = measuredAccel.y - expectedAccel.y;
    const residualZ = measuredAccel.z - expectedAccel.z;

    const forceToWind = (force: number) => {
      const dragCoeff = 0.5 * airDensity * dragArea * DRAG_COEFF;
      if (dragCoeff < 1e-10) return 0;
      const absForce = Math.abs(force * mass);
      return Math.sign(force) * Math.sqrt(absForce / Math.max(dragCoeff, 1e-10));
    };

    return {
      x: forceToWind(residualX),
      y: forceToWind(residualY),
      z: forceToWind(residualZ),
    };
  }
}

class QuadrotorDynamics {
  private params: QuadrotorParams;

  constructor(params: QuadrotorParams = DEFAULT_QUAD_PARAMS) {
    this.params = params;
  }

  computeThrust(motorRpms: number[]): number {
    return motorRpms.reduce((sum, rpm) => {
      const omega = (rpm * 2 * Math.PI) / 60;
      return sum + this.params.thrustCoeff * omega * omega;
    }, 0);
  }

  computeTorques(motorRpms: number[], frameGeometry?: FrameGeometry): { x: number; y: number; z: number } {
    const L = this.params.armLength;
    const thrusts = motorRpms.map(rpm => {
      const omega = (rpm * 2 * Math.PI) / 60;
      return this.params.thrustCoeff * omega * omega;
    });
    const reactiveTorques = motorRpms.map(rpm => {
      const omega = (rpm * 2 * Math.PI) / 60;
      return this.params.torqueCoeff * omega * omega;
    });

    if (frameGeometry && frameGeometry.motorCount === thrusts.length) {
      let tauX = 0, tauY = 0, tauZ = 0;
      for (let i = 0; i < frameGeometry.motorCount; i++) {
        const thrust = thrusts[i] ?? 0;
        const reactive = reactiveTorques[i] ?? 0;
        tauX += L * (frameGeometry.rollFactors[i] ?? 0) * thrust;
        tauY += L * (frameGeometry.pitchFactors[i] ?? 0) * thrust;
        tauZ += (frameGeometry.yawFactors[i] ?? 0) * reactive;
      }
      return { x: tauX, y: tauY, z: tauZ };
    }

    while (thrusts.length < 4) thrusts.push(0);
    while (reactiveTorques.length < 4) reactiveTorques.push(0);
    const tauX = L * (thrusts[1] - thrusts[3]);
    const tauY = L * (thrusts[0] - thrusts[2]);
    const tauZ = reactiveTorques[0] - reactiveTorques[1] + reactiveTorques[2] - reactiveTorques[3];

    return { x: tauX, y: tauY, z: tauZ };
  }

  computeDrag(velocity: { x: number; y: number; z: number }, wind: { x: number; y: number; z: number }, airDensity: number): { x: number; y: number; z: number } {
    const relVx = velocity.x - wind.x;
    const relVy = velocity.y - wind.y;
    const relVz = velocity.z - wind.z;
    const factor = 0.5 * airDensity * DRAG_COEFF * this.params.dragArea;
    return {
      x: -factor * relVx * Math.abs(relVx),
      y: -factor * relVy * Math.abs(relVy),
      z: -factor * relVz * Math.abs(relVz),
    };
  }

  computePayloadEffect(payload: PayloadState): { forceOffset: { x: number; y: number; z: number }; torqueOffset: { x: number; y: number; z: number } } {
    const effectiveMass = payload.mass * (1 - payload.releaseProgress);
    const forceOffset = {
      x: -effectiveMass * GRAVITY * Math.sin(Math.atan2(payload.cgOffset.x, 1)),
      y: -effectiveMass * GRAVITY * Math.sin(Math.atan2(payload.cgOffset.y, 1)),
      z: -effectiveMass * GRAVITY,
    };
    const torqueOffset = {
      x: effectiveMass * GRAVITY * payload.cgOffset.y,
      y: -effectiveMass * GRAVITY * payload.cgOffset.x,
      z: 0,
    };
    return { forceOffset, torqueOffset };
  }

  computeRainDrag(rainIntensity: number, velocity: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const rainFactor = rainIntensity * 0.15;
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
    const additionalDrag = rainFactor * speed;
    if (speed < 0.01) return { x: 0, y: 0, z: -rainFactor * 0.5 };
    return {
      x: -additionalDrag * (velocity.x / speed),
      y: -additionalDrag * (velocity.y / speed),
      z: -additionalDrag * (velocity.z / speed) - rainFactor * 0.5,
    };
  }

  getDynamicsSnapshot(
    state: VehicleState,
    wind: { x: number; y: number; z: number },
    payload: PayloadState,
    airDensity: number,
    rainIntensity: number,
  ): DynamicsSnapshot {
    const totalMass = this.params.mass + payload.mass * (1 - payload.releaseProgress);
    const totalThrust = this.computeThrust(state.motorRpms);
    const dragForce = this.computeDrag(state.velocity, wind, airDensity);
    const rainDrag = this.computeRainDrag(rainIntensity, state.velocity);
    const gravityForce = totalMass * GRAVITY;
    const payloadEffect = this.computePayloadEffect(payload);
    const torques = this.computeTorques(state.motorRpms);

    const cosR = Math.cos(state.attitude.roll);
    const sinR = Math.sin(state.attitude.roll);
    const cosP = Math.cos(state.attitude.pitch);
    const sinP = Math.sin(state.attitude.pitch);

    const thrustX = -totalThrust * sinP;
    const thrustY = totalThrust * sinR * cosP;
    const thrustZ = totalThrust * cosR * cosP;

    const netForce = {
      x: thrustX + dragForce.x + rainDrag.x + payloadEffect.forceOffset.x,
      y: thrustY + dragForce.y + rainDrag.y + payloadEffect.forceOffset.y,
      z: thrustZ - gravityForce + dragForce.z + rainDrag.z + payloadEffect.forceOffset.z,
    };

    const netTorque = {
      x: torques.x + payloadEffect.torqueOffset.x,
      y: torques.y + payloadEffect.torqueOffset.y,
      z: torques.z + payloadEffect.torqueOffset.z,
    };

    const thrustToWeightRatio = totalThrust / Math.max(gravityForce, 0.01);

    const motorPower = state.motorRpms.reduce((sum, rpm) => {
      const omega = (rpm * 2 * Math.PI) / 60;
      return sum + this.params.torqueCoeff * omega * omega * omega * 0.001;
    }, 0);

    return {
      totalThrust,
      dragForce,
      gravityForce,
      netForce,
      netTorque,
      thrustToWeightRatio,
      powerConsumption: motorPower,
    };
  }

  getParams(): QuadrotorParams { return { ...this.params }; }
  setParams(p: Partial<QuadrotorParams>) { Object.assign(this.params, p); }
}

class CameraGroundDistanceEstimator {
  private calibrationAltitude = 10;
  private calibrationFeatureSize = 50;
  private history: { distance: number; confidence: number; ts: number }[] = [];

  estimateFromFeatures(
    avgFeatureSize: number,
    featureCount: number,
    frameWidth: number,
    frameHeight: number,
    focalLengthPx: number,
    knownObjectSizePx: number,
    knownObjectRealSize: number,
    attitude: { roll: number; pitch: number }
  ): { distance: number; confidence: number; method: string } {
    let distance = 0;
    let confidence = 0;
    let method = "feature_scale";

    if (knownObjectSizePx > 0 && knownObjectRealSize > 0 && focalLengthPx > 0) {
      distance = (knownObjectRealSize * focalLengthPx) / Math.max(knownObjectSizePx, 1);
      confidence = clamp(knownObjectSizePx / 20, 0.3, 0.95);
      method = "known_object";
    } else if (avgFeatureSize > 0) {
      const scale = this.calibrationFeatureSize / Math.max(avgFeatureSize, 1);
      distance = this.calibrationAltitude * scale;
      confidence = clamp(featureCount / 100, 0.1, 0.6);
      method = "feature_scale";
    } else {
      return { distance: -1, confidence: 0, method: "none" };
    }

    const cosCorrection = Math.cos(attitude.roll) * Math.cos(attitude.pitch);
    if (cosCorrection > 0.1) {
      distance /= cosCorrection;
    }

    distance = clamp(distance, 0.1, 500);

    this.history.push({ distance, confidence, ts: Date.now() });
    if (this.history.length > 30) this.history.shift();

    if (this.history.length > 3) {
      const recent = this.history.slice(-5);
      const avg = recent.reduce((s, h) => s + h.distance, 0) / recent.length;
      const variance = recent.reduce((s, h) => s + (h.distance - avg) ** 2, 0) / recent.length;
      if (variance < 4) {
        distance = avg * 0.3 + distance * 0.7;
        confidence = Math.min(confidence + 0.1, 0.95);
      }
    }

    return { distance, confidence, method };
  }
}

export class FlightDynamicsEngine {
  private kalman: ExtendedKalmanFilter;
  private mlPredictor: MLDisturbancePredictor;
  private windModel: WindModel;
  private dynamics: QuadrotorDynamics;
  private cameraEstimator: CameraGroundDistanceEstimator;
  private vehicleState: VehicleState;
  private environment: EnvironmentState;
  private payload: PayloadState;
  private lastStabilizationOutput: StabilizationOutput | null = null;
  private tickCount = 0;
  private trainingInterval = 10;
  private lastTrainingLoss = -1;
  private startTime: number;

  constructor(quadParams?: Partial<QuadrotorParams>) {
    this.kalman = new ExtendedKalmanFilter();
    this.mlPredictor = new MLDisturbancePredictor();
    this.windModel = new WindModel();
    this.dynamics = new QuadrotorDynamics(quadParams ? { ...DEFAULT_QUAD_PARAMS, ...quadParams } : undefined);
    this.cameraEstimator = new CameraGroundDistanceEstimator();
    this.startTime = Date.now();

    this.vehicleState = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      attitude: { roll: 0, pitch: 0, yaw: 0 },
      angularRate: { p: 0, q: 0, r: 0 },
      motorRpms: [0, 0, 0, 0],
      timestamp: Date.now(),
    };

    this.environment = {
      windSpeed: { x: 0, y: 0, z: 0 },
      windGusts: 0,
      airDensity: AIR_DENSITY_SEA_LEVEL,
      temperature: 20,
      humidity: 50,
      pressure: 1013.25,
      turbulenceIntensity: 0,
      rainIntensity: 0,
    };

    this.payload = {
      mass: 0,
      cgOffset: { x: 0, y: 0, z: 0 },
      momentOfInertia: { x: 0, y: 0, z: 0 },
      isReleasing: false,
      releaseProgress: 0,
    };
  }

  updateSensors(sensors: Partial<SensorReadings>, dt: number): void {
    if (sensors.imu) {
      const accel = [sensors.imu.accelX, sensors.imu.accelY, sensors.imu.accelZ];
      const gyro = [sensors.imu.gyroX, sensors.imu.gyroY, sensors.imu.gyroZ];
      this.kalman.predict(dt, accel, gyro);
      this.kalman.updateIMU(accel, gyro);
      this.vehicleState.angularRate = { p: sensors.imu.gyroX, q: sensors.imu.gyroY, r: sensors.imu.gyroZ };
    }

    if (sensors.gps && sensors.gps.fix >= 3) {
      this.kalman.updateGPS(sensors.gps.lat, sensors.gps.lng, sensors.gps.alt, sensors.gps.hdop);
    }

    if (sensors.barometer) {
      this.kalman.updateBarometer(sensors.barometer.altitude);
      this.environment.pressure = sensors.barometer.pressure;
      this.environment.temperature = sensors.barometer.temperature;
      this.environment.airDensity = (sensors.barometer.pressure * 100) / (287.05 * (sensors.barometer.temperature + 273.15));
    }

    if (sensors.rangefinder?.valid) {
      this.kalman.updateRangefinder(sensors.rangefinder.distance);
    }

    const ks = this.kalman.getState();
    this.vehicleState.position = ks.estimatedPosition;
    this.vehicleState.velocity = ks.estimatedVelocity;
    this.vehicleState.attitude = ks.estimatedAttitude;
    this.vehicleState.timestamp = Date.now();
  }

  updateEnvironment(env: Partial<EnvironmentState>): void {
    Object.assign(this.environment, env);
    this.windModel.update(this.environment);
  }

  updatePayload(payload: Partial<PayloadState>): void {
    Object.assign(this.payload, payload);
  }

  updateMotorRpms(rpms: number[]): void {
    this.vehicleState.motorRpms = rpms.slice(0, this.dynamics.getParams().motorCount);
  }

  computeStabilization(
    targetAltitude: number,
    targetAttitude: { roll: number; pitch: number; yaw: number },
    cameraFeatures?: { avgSize: number; count: number; frameW: number; frameH: number; focalPx: number; knownObjPx: number; knownObjReal: number }
  ): StabilizationOutput {
    this.tickCount++;
    const t = (Date.now() - this.startTime) / 1000;
    const wind = this.windModel.getWindAtTime(t);

    const dynamicsSnap = this.dynamics.getDynamicsSnapshot(
      this.vehicleState, wind, this.payload, this.environment.airDensity, this.environment.rainIntensity
    );

    const ks = this.kalman.getState();
    const att = ks.estimatedAttitude;
    const vel = ks.estimatedVelocity;
    const pos = ks.estimatedPosition;

    const features = [
      att.roll, att.pitch, att.yaw,
      vel.x, vel.y, vel.z,
      this.vehicleState.angularRate.p, this.vehicleState.angularRate.q, this.vehicleState.angularRate.r,
      wind.x, wind.y, wind.z,
      this.payload.mass, this.payload.cgOffset.x, this.payload.cgOffset.y,
      this.environment.rainIntensity, this.environment.turbulenceIntensity,
      pos.z - targetAltitude,
    ];

    this.mlPredictor.addToHistory(features);
    const prediction = this.mlPredictor.predict(features);

    const rollError = targetAttitude.roll - att.roll;
    const pitchError = targetAttitude.pitch - att.pitch;
    const yawError = targetAttitude.yaw - att.yaw;
    const altError = targetAltitude - pos.z;

    const baseGains = { kp: 0.22, ki: 0.06, kd: 0.11 };
    const adaptedGains = {
      kpRoll: baseGains.kp * (prediction.gains[0] ?? 1),
      kiRoll: baseGains.ki * (prediction.gains[1] ?? 1),
      kdRoll: baseGains.kd * (prediction.gains[2] ?? 1),
      kpPitch: baseGains.kp * (prediction.gains[3] ?? 1),
      kiPitch: baseGains.ki * (prediction.gains[4] ?? 1),
      kdPitch: baseGains.kd * (prediction.gains[5] ?? 1),
    };

    const rollCorr = clamp(
      adaptedGains.kpRoll * rollError + adaptedGains.kdRoll * (-this.vehicleState.angularRate.p),
      -18, 18
    );
    const pitchCorr = clamp(
      adaptedGains.kpPitch * pitchError + adaptedGains.kdPitch * (-this.vehicleState.angularRate.q),
      -18, 18
    );
    const yawCorr = clamp(baseGains.kp * yawError + baseGains.kd * (-this.vehicleState.angularRate.r), -16, 16);
    const throttleCorr = clamp(baseGains.kp * altError * 0.6 + baseGains.kd * (-vel.z) * 0.3, -6, 6);

    const mlBlend = prediction.confidence;
    const predictedDist = {
      x: prediction.disturbance[0] ?? 0,
      y: prediction.disturbance[1] ?? 0,
      z: prediction.disturbance[2] ?? 0,
    };

    const windComp = {
      x: -wind.x * 0.5 * this.environment.airDensity * this.dynamics.getParams().dragArea * DRAG_COEFF,
      y: -wind.y * 0.5 * this.environment.airDensity * this.dynamics.getParams().dragArea * DRAG_COEFF,
      z: -wind.z * 0.3 * this.environment.airDensity * this.dynamics.getParams().dragArea * DRAG_COEFF,
    };

    const payloadEffect = this.dynamics.computePayloadEffect(this.payload);
    const totalMass = this.dynamics.getParams().mass + this.payload.mass * (1 - this.payload.releaseProgress);
    const payloadComp = {
      roll: clamp(-payloadEffect.torqueOffset.x / Math.max(this.dynamics.getParams().momentOfInertiaX, 0.001) * 0.1, -10, 10),
      pitch: clamp(-payloadEffect.torqueOffset.y / Math.max(this.dynamics.getParams().momentOfInertiaY, 0.001) * 0.1, -10, 10),
      yaw: 0,
      thrust: clamp(this.payload.mass * (1 - this.payload.releaseProgress) * GRAVITY / Math.max(this.dynamics.getParams().maxThrust, 0.1) * 100, -30, 30),
    };

    const thrustCorrs = this.vehicleState.motorRpms.map((_, i) => {
      let corr = throttleCorr;
      if (i === 0 || i === 1) corr += rollCorr * 0.5;
      if (i === 2 || i === 3) corr -= rollCorr * 0.5;
      if (i === 0 || i === 3) corr += pitchCorr * 0.5;
      if (i === 1 || i === 2) corr -= pitchCorr * 0.5;
      corr += mlBlend * (predictedDist.z * 0.2);
      return clamp(corr, -20, 20);
    });

    let groundDist = -1;
    if (cameraFeatures) {
      const camResult = this.cameraEstimator.estimateFromFeatures(
        cameraFeatures.avgSize, cameraFeatures.count,
        cameraFeatures.frameW, cameraFeatures.frameH,
        cameraFeatures.focalPx, cameraFeatures.knownObjPx, cameraFeatures.knownObjReal,
        { roll: att.roll, pitch: att.pitch }
      );
      groundDist = camResult.distance;
    }

    if (this.tickCount % this.trainingInterval === 0) {
      const actualDisturbance = [
        dynamicsSnap.netForce.x / Math.max(totalMass, 0.1),
        dynamicsSnap.netForce.y / Math.max(totalMass, 0.1),
        dynamicsSnap.netForce.z / Math.max(totalMass, 0.1),
        dynamicsSnap.netTorque.x,
        dynamicsSnap.netTorque.y,
        dynamicsSnap.netTorque.z,
      ];
      this.mlPredictor.addTrainingSample(features, actualDisturbance);
      this.mlPredictor.trainStep();
    }

    const output: StabilizationOutput = {
      thrustCorrections: thrustCorrs,
      attitudeCorrections: { roll: rollCorr + payloadComp.roll, pitch: pitchCorr + payloadComp.pitch, yaw: yawCorr },
      throttleCorrection: throttleCorr + payloadComp.thrust * 0.01,
      mlConfidence: prediction.confidence,
      predictedDisturbance: predictedDist,
      estimatedGroundDistance: groundDist,
      windCompensation: windComp,
      payloadCompensation: payloadComp,
      kalmanState: ks,
      dynamicsModel: dynamicsSnap,
    };

    this.lastStabilizationOutput = output;
    return output;
  }

  getStatus() {
    return {
      kalmanState: this.kalman.getState(),
      vehicleState: { ...this.vehicleState },
      environment: { ...this.environment },
      payload: { ...this.payload },
      mlTrained: this.mlPredictor.isTrained(),
      mlEpochs: this.mlPredictor.getEpochCount(),
      mlTrainingDataSize: this.mlPredictor.getTrainingDataSize(),
      lastOutput: this.lastStabilizationOutput,
      tickCount: this.tickCount,
    };
  }

  setQuadParams(params: Partial<QuadrotorParams>): void {
    this.dynamics.setParams(params);
  }

  getQuadParams(): QuadrotorParams {
    return this.dynamics.getParams();
  }

  getLastTrainingLoss(): number {
    return this.lastTrainingLoss;
  }
}

export const flightDynamicsEngine = new FlightDynamicsEngine();
