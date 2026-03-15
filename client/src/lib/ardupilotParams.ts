export interface ArduPilotParamMeta {
  name: string;
  category: string;
  unit?: string;
  min?: number;
  max?: number;
  notes?: string;
}

export interface ParamPreset {
  id: string;
  name: string;
  description: string;
  values: Array<{ name: string; value: number }>;
}

export const ARDUPILOT_PARAM_METADATA: ArduPilotParamMeta[] = [
  { name: "ARMING_CHECK", category: "Safety", min: 0, max: 1000000, notes: "Pre-arm checks bitmask" },
  { name: "FS_THR_ENABLE", category: "Failsafe", min: 0, max: 7, notes: "Throttle failsafe mode" },
  { name: "FS_GCS_ENABLE", category: "Failsafe", min: 0, max: 7, notes: "GCS failsafe mode" },
  { name: "BATT_LOW_VOLT", category: "Battery", unit: "V", min: 9, max: 30 },
  { name: "BATT_CRT_VOLT", category: "Battery", unit: "V", min: 8, max: 30 },
  { name: "BATT_LOW_MAH", category: "Battery", unit: "mAh", min: 0, max: 100000 },
  { name: "WPNAV_SPEED", category: "Navigation", unit: "cm/s", min: 50, max: 2000 },
  { name: "WPNAV_ACCEL", category: "Navigation", unit: "cm/s^2", min: 20, max: 500 },
  { name: "WPNAV_SPEED_UP", category: "Navigation", unit: "cm/s", min: 50, max: 1000 },
  { name: "WPNAV_SPEED_DN", category: "Navigation", unit: "cm/s", min: 50, max: 500 },
  { name: "RTL_ALT", category: "RTL", unit: "cm", min: 500, max: 10000 },
  { name: "RTL_SPEED", category: "RTL", unit: "cm/s", min: 50, max: 2000 },
  { name: "LAND_SPEED", category: "Landing", unit: "cm/s", min: 20, max: 200 },
  { name: "LAND_SPEED_HIGH", category: "Landing", unit: "cm/s", min: 20, max: 500 },
  { name: "FENCE_ENABLE", category: "Fence", min: 0, max: 1 },
  { name: "FENCE_ACTION", category: "Fence", min: 0, max: 3, notes: "0 warn, 1 RTL, 2 Land, 3 SmartRTL/Brake" },
  { name: "FENCE_ALT_MAX", category: "Fence", unit: "m", min: 0, max: 500 },
  { name: "FENCE_ALT_MIN", category: "Fence", unit: "m", min: 0, max: 500 },
  { name: "EK3_ENABLE", category: "EKF", min: 0, max: 1 },
  { name: "EK3_SRC1_POSXY", category: "EKF", min: 0, max: 8 },
  { name: "EK3_SRC1_VELXY", category: "EKF", min: 0, max: 8 },
  { name: "ATC_ACCEL_P_MAX", category: "Attitude", unit: "cd/s^2", min: 10000, max: 300000 },
  { name: "ATC_ACCEL_R_MAX", category: "Attitude", unit: "cd/s^2", min: 10000, max: 300000 },
  { name: "ATC_ACCEL_Y_MAX", category: "Attitude", unit: "cd/s^2", min: 1000, max: 120000 },
  { name: "PSC_ACCZ_P", category: "Altitude", min: 0, max: 2 },
  { name: "PSC_ACCZ_I", category: "Altitude", min: 0, max: 3 },
  { name: "PSC_ACCZ_D", category: "Altitude", min: 0, max: 1 },
];

export const ARDUPILOT_CATEGORIES = Array.from(
  new Set(ARDUPILOT_PARAM_METADATA.map((m) => m.category)),
).sort();

export const ARDUPILOT_PARAM_PRESETS: ParamPreset[] = [
  {
    id: "balanced_ops",
    name: "Balanced Ops",
    description: "General emergency-response tuning with conservative safety.",
    values: [
      { name: "WPNAV_SPEED", value: 700 },
      { name: "WPNAV_ACCEL", value: 220 },
      { name: "RTL_ALT", value: 3000 },
      { name: "RTL_SPEED", value: 600 },
      { name: "LAND_SPEED", value: 45 },
      { name: "FENCE_ENABLE", value: 1 },
      { name: "FENCE_ACTION", value: 1 },
      { name: "FS_GCS_ENABLE", value: 1 },
      { name: "FS_THR_ENABLE", value: 1 },
    ],
  },
  {
    id: "cinematic_slow",
    name: "Cinematic Slow",
    description: "Lower speed and acceleration for stable footage.",
    values: [
      { name: "WPNAV_SPEED", value: 350 },
      { name: "WPNAV_ACCEL", value: 110 },
      { name: "WPNAV_SPEED_UP", value: 220 },
      { name: "WPNAV_SPEED_DN", value: 160 },
      { name: "LAND_SPEED", value: 35 },
      { name: "ATC_ACCEL_Y_MAX", value: 18000 },
    ],
  },
  {
    id: "survey_fast",
    name: "Survey Fast",
    description: "Higher speed for large-area mapping flights.",
    values: [
      { name: "WPNAV_SPEED", value: 1100 },
      { name: "WPNAV_ACCEL", value: 320 },
      { name: "WPNAV_SPEED_UP", value: 350 },
      { name: "WPNAV_SPEED_DN", value: 250 },
      { name: "RTL_SPEED", value: 900 },
    ],
  },
];

export const ARDUPILOT_META_BY_NAME = ARDUPILOT_PARAM_METADATA.reduce<Record<string, ArduPilotParamMeta>>(
  (acc, item) => {
    acc[item.name] = item;
    return acc;
  },
  {},
);

