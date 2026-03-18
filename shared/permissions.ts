export type PermissionId =
  | "arm_disarm"
  | "flight_control"
  | "mission_planning"
  | "camera_control"
  | "view_telemetry"
  | "view_map"
  | "view_camera"
  | "system_settings"
  | "user_management"
  | "automation_scripts"
  | "run_terminal"
  | "emergency_override"
  | "object_tracking"
  | "broadcast_audio"
  | "manage_geofences"
  | "access_flight_recorder"
  | "delete_flight_data"
  | "delete_records"
  | "configure_gui_advanced";

export interface PermissionDefinition {
  id: PermissionId;
  name: string;
  description: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  { id: "arm_disarm", name: "Arm/Disarm Drone", description: "Control drone arming state" },
  { id: "flight_control", name: "Flight Control", description: "Takeoff, land, RTL commands" },
  { id: "mission_planning", name: "Mission Planning", description: "Create and edit missions" },
  { id: "camera_control", name: "Camera & Gimbal", description: "Control camera and gimbal" },
  { id: "view_telemetry", name: "View Telemetry", description: "See real-time drone data" },
  { id: "view_map", name: "View Map", description: "Access map display" },
  { id: "view_camera", name: "View Camera Feed", description: "Watch video streams" },
  { id: "user_management", name: "User Management", description: "Add, edit, delete users" },
  { id: "system_settings", name: "System Settings", description: "Modify system configuration" },
  { id: "delete_records", name: "Delete Records", description: "Delete flight logs and data" },
  { id: "delete_flight_data", name: "Delete Flight Data", description: "Remove waypoints and missions" },
  { id: "automation_scripts", name: "Automation Scripts", description: "Create and run scripts" },
  { id: "emergency_override", name: "Emergency Override", description: "Override emergency actions" },
  { id: "object_tracking", name: "Object Tracking", description: "Use tracking features" },
  { id: "broadcast_audio", name: "Broadcast Audio", description: "Use speaker system" },
  { id: "manage_geofences", name: "Manage Geofences", description: "Create and edit geofence zones" },
  { id: "access_flight_recorder", name: "Flight Recorder", description: "Access flight logs and logbook" },
  { id: "run_terminal", name: "Terminal Commands", description: "Execute terminal commands" },
  { id: "configure_gui_advanced", name: "GUI Configuration", description: "Customize interface layout" },
];

export const ROLE_PERMISSIONS: Record<string, PermissionId[]> = {
  admin: ALL_PERMISSIONS.map((permission) => permission.id),
  operator: [
    "arm_disarm",
    "flight_control",
    "mission_planning",
    "camera_control",
    "view_telemetry",
    "view_map",
    "view_camera",
    "system_settings",
    "automation_scripts",
    "run_terminal",
    "emergency_override",
    "object_tracking",
    "broadcast_audio",
    "manage_geofences",
    "access_flight_recorder",
    "delete_flight_data",
    "configure_gui_advanced",
  ],
  viewer: ["view_telemetry", "view_map", "view_camera"],
};
