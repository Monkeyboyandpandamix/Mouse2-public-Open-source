// Gamepad / joystick mapping shared between the input-config UI in
// SettingsPanel and the live polling loop in ControlDeck.
//
// The browser's Gamepad API exposes a "standard" mapping (Xbox, PS4/5,
// Logitech F310, generic HID via Bluetooth or USB). Indices below follow that
// standard so the same defaults work for wired and Bluetooth controllers.
//
// Critical controls (arm, disarm, RTH, emergency stop) always have a default
// binding. The UI lets the operator re-assign them but never delete them — see
// `isCriticalAction`.

export type GamepadActionId =
  // Critical (always bound)
  | "arm_toggle"
  | "emergency_stop"
  | "return_to_home"
  // Flight commands
  | "takeoff"
  | "land"
  | "loiter_mode"
  | "stabilize_mode"
  | "altitude_hold_mode"
  // Payload / camera
  | "gripper_toggle"
  | "camera_snapshot"
  | "record_toggle"
  | "gimbal_recenter"
  // Axes
  | "axis_roll"
  | "axis_pitch"
  | "axis_yaw"
  | "axis_throttle"
  | "axis_gimbal_pitch"
  | "axis_gimbal_yaw";

export interface GamepadBinding {
  /** "button" reads gp.buttons[index].pressed; "axis" reads gp.axes[index]. */
  kind: "button" | "axis";
  /** Index into the gamepad's buttons[] or axes[] array. */
  index: number;
  /** Multiplier (axes only). Use -1 to invert. */
  scale?: number;
}

export interface GamepadActionMeta {
  id: GamepadActionId;
  label: string;
  group: "critical" | "flight" | "payload" | "axis";
  /** Default binding. Can be re-assigned via the UI. */
  default: GamepadBinding;
  /** Critical actions cannot be unbound (only re-bound). */
  critical?: boolean;
  /** Description shown in the UI. */
  description: string;
}

// Standard gamepad indices (Xbox / PS / generic HID via USB or Bluetooth):
//   axes:    0 LS-X, 1 LS-Y, 2 RS-X, 3 RS-Y
//   buttons: 0 A/Cross, 1 B/Circle, 2 X/Square, 3 Y/Triangle,
//            4 LB,  5 RB,  6 LT,    7 RT,
//            8 Back, 9 Start, 10 LS-click, 11 RS-click,
//            12 D-Up, 13 D-Down, 14 D-Left, 15 D-Right, 16 Home

export const GAMEPAD_ACTIONS: readonly GamepadActionMeta[] = [
  {
    id: "arm_toggle",
    label: "Arm / Disarm toggle",
    group: "critical",
    critical: true,
    default: { kind: "button", index: 9 }, // Start
    description: "Arm or disarm the motors. Edge-triggered (press to toggle).",
  },
  {
    id: "emergency_stop",
    label: "Emergency stop",
    group: "critical",
    critical: true,
    default: { kind: "button", index: 8 }, // Back / Select
    description: "Cut motors immediately. Sends DISARM regardless of state.",
  },
  {
    id: "return_to_home",
    label: "Return to home (RTH)",
    group: "critical",
    critical: true,
    default: { kind: "button", index: 3 }, // Y / Triangle
    description: "Trigger return-to-base. Requires home location set.",
  },
  {
    id: "takeoff",
    label: "Takeoff",
    group: "flight",
    default: { kind: "button", index: 12 }, // D-Up
    description: "Auto-takeoff to default altitude (if armed).",
  },
  {
    id: "land",
    label: "Land",
    group: "flight",
    default: { kind: "button", index: 13 }, // D-Down
    description: "Initiate auto-land at current location.",
  },
  {
    id: "loiter_mode",
    label: "Loiter mode",
    group: "flight",
    default: { kind: "button", index: 4 }, // LB
    description: "Switch flight mode to LOITER (hold position).",
  },
  {
    id: "stabilize_mode",
    label: "Stabilize mode",
    group: "flight",
    default: { kind: "button", index: 6 }, // LT
    description: "Switch flight mode to STABILIZE.",
  },
  {
    id: "altitude_hold_mode",
    label: "Altitude hold mode",
    group: "flight",
    default: { kind: "button", index: 7 }, // RT
    description: "Switch flight mode to ALT_HOLD.",
  },
  {
    id: "gripper_toggle",
    label: "Gripper toggle",
    group: "payload",
    default: { kind: "button", index: 0 }, // A / Cross
    description: "Open or close the gripper. Edge-triggered.",
  },
  {
    id: "camera_snapshot",
    label: "Camera snapshot",
    group: "payload",
    default: { kind: "button", index: 2 }, // X / Square
    description: "Capture a still image from the gimbal camera.",
  },
  {
    id: "record_toggle",
    label: "Record video toggle",
    group: "payload",
    default: { kind: "button", index: 5 }, // RB
    description: "Start/stop recording the gimbal video stream.",
  },
  {
    id: "gimbal_recenter",
    label: "Gimbal recenter",
    group: "payload",
    default: { kind: "button", index: 11 }, // RS-click
    description: "Recenter the gimbal to forward-facing.",
  },
  {
    id: "axis_roll",
    label: "Roll (left/right)",
    group: "axis",
    default: { kind: "axis", index: 0, scale: 1 },
    description: "Manual roll input. Positive = right.",
  },
  {
    id: "axis_pitch",
    label: "Pitch (forward/back)",
    group: "axis",
    default: { kind: "axis", index: 1, scale: -1 },
    description: "Manual pitch input. Positive = forward.",
  },
  {
    id: "axis_yaw",
    label: "Yaw (rotate)",
    group: "axis",
    default: { kind: "axis", index: 2, scale: 1 },
    description: "Manual yaw input. Positive = clockwise.",
  },
  {
    id: "axis_throttle",
    label: "Throttle (up/down)",
    group: "axis",
    default: { kind: "axis", index: 3, scale: -1 },
    description: "Manual throttle. Positive = climb.",
  },
  {
    id: "axis_gimbal_pitch",
    label: "Gimbal pitch",
    group: "axis",
    default: { kind: "axis", index: 7, scale: 1 },
    description: "Optional gimbal pitch axis (D-pad Y on standard mapping).",
  },
  {
    id: "axis_gimbal_yaw",
    label: "Gimbal yaw",
    group: "axis",
    default: { kind: "axis", index: 6, scale: 1 },
    description: "Optional gimbal yaw axis (D-pad X on standard mapping).",
  },
] as const;

export type GamepadMapping = Record<GamepadActionId, GamepadBinding>;

export const DEFAULT_GAMEPAD_MAPPING: GamepadMapping = GAMEPAD_ACTIONS.reduce(
  (acc, meta) => {
    acc[meta.id] = { ...meta.default };
    return acc;
  },
  {} as GamepadMapping,
);

export function isCriticalAction(id: GamepadActionId): boolean {
  return GAMEPAD_ACTIONS.find((a) => a.id === id)?.critical === true;
}

export function getActionMeta(id: GamepadActionId): GamepadActionMeta | undefined {
  return GAMEPAD_ACTIONS.find((a) => a.id === id);
}

/**
 * Coerce a value loaded from localStorage / app-config into a valid mapping.
 * Missing or invalid bindings fall back to defaults so the operator never ends
 * up with an unbound critical control. Critically, the *kind* (button vs axis)
 * is enforced to match the action's group: a "button" action like
 * emergency_stop can only be re-mapped to another button, and an "axis" action
 * like axis_roll can only be re-mapped to another axis. A corrupted file that
 * tries to bind emergency_stop to an axis silently falls back to the default.
 */
export function normalizeMapping(raw: unknown): GamepadMapping {
  const out: GamepadMapping = { ...DEFAULT_GAMEPAD_MAPPING };
  if (!raw || typeof raw !== "object") return out;
  for (const meta of GAMEPAD_ACTIONS) {
    const v = (raw as any)[meta.id];
    if (!v || typeof v !== "object") continue;
    const expectedKind = meta.default.kind;
    if (v.kind !== expectedKind) continue; // wrong kind → keep default
    if (typeof v.index !== "number" || v.index < 0 || v.index >= 32) continue;
    // Clamp scale to a safe envelope. Defaults are always 1; axis invert
    // needs -1; we leave a little headroom for sensitivity tuning but
    // refuse to honor a corrupted value like 9999 that would cause the
    // axis-to-MANUAL_CONTROL multiplier to send unbounded commands to
    // the flight controller.
    const SCALE_MIN = -4;
    const SCALE_MAX = 4;
    let scale: number = meta.default.scale ?? 1;
    if (typeof v.scale === "number" && Number.isFinite(v.scale)) {
      scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v.scale));
    }
    out[meta.id] = {
      kind: expectedKind,
      index: Math.floor(v.index),
      scale,
    };
  }
  return out;
}

export const GAMEPAD_MAPPING_STORAGE_KEY = "mouse_gamepad_mapping";
