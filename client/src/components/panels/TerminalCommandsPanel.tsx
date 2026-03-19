import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Terminal, 
  Save, 
  Play, 
  RefreshCw, 
  Copy,
  Edit,
  Check,
  X,
  Zap,
  Navigation,
  Camera,
  Compass,
  MapPin,
  Radio,
  Video,
  Settings,
  Shield,
  Plus,
  Trash2
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { dispatchBackendCommand } from "@/lib/commandService";
import { Lock } from "lucide-react";

interface SystemCommand {
  id: string;
  name: string;
  description: string;
  category: 'arming' | 'flight' | 'navigation' | 'telemetry' | 'camera' | 'video' | 'system' | 'payload';
  command: string;
  parameters?: { name: string; description: string; default: string }[];
  lastExecuted?: string;
}

function isBackendSupportedTerminalCommand(command: string): boolean {
  const normalized = String(command || "").trim();
  if (!normalized || normalized.includes("|")) return false;
  if (/^mavlink_shell\s+'arm throttle'$/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'disarm(?: force)?'$/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'reboot'$/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'mode\s+[a-z0-9_]+'$/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'servo set 9 2000'$/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'servo set 9 1000'$/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'gimbal pitch\s+-?\d+(?:\.\d+)?'$/i.test(normalized)) return true;
  if (/mavlink_shell\s+'takeoff\s+\d+(?:\.\d+)?'/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'servo set 9 2000'\s*&&/i.test(normalized)) return true;
  if (/^mavlink_shell\s+'servo set 9 1000'\s*&&/i.test(normalized)) return true;
  return false;
}

const defaultCommands: SystemCommand[] = [
  // Payload / Gripper Commands
  {
    id: "gripper_open",
    name: "Open Gripper",
    description: "Opens the gripper to release payload",
    category: "payload",
    command: "mavlink_shell 'servo set 9 2000'",
  },
  {
    id: "gripper_close",
    name: "Close Gripper",
    description: "Closes the gripper to grab payload",
    category: "payload",
    command: "mavlink_shell 'servo set 9 1000'",
  },
  {
    id: "gripper_toggle",
    name: "Toggle Gripper",
    description: "Toggles gripper between open and closed",
    category: "payload",
    command: "mavlink_shell 'servo toggle 9'",
  },
  {
    id: "drop_payload",
    name: "Drop Payload",
    description: "Opens gripper and waits for payload release",
    category: "payload",
    command: "mavlink_shell 'servo set 9 2000' && sleep 2 && echo 'Payload released'",
  },
  {
    id: "pickup_payload",
    name: "Pickup Payload",
    description: "Positions and closes gripper to grab payload",
    category: "payload",
    command: "mavlink_shell 'servo set 9 1000' && sleep 1 && echo 'Payload secured'",
  },
  // Object Avoidance Commands
  {
    id: "avoidance_enable",
    name: "Enable Object Avoidance",
    description: "Enables obstacle detection and avoidance system",
    category: "navigation",
    command: "mavlink_shell 'param set AVOID_ENABLE 1'",
  },
  {
    id: "avoidance_disable",
    name: "Disable Object Avoidance",
    description: "Disables obstacle avoidance for manual control",
    category: "navigation",
    command: "mavlink_shell 'param set AVOID_ENABLE 0'",
  },
  {
    id: "avoidance_distance",
    name: "Set Avoidance Distance",
    description: "Sets minimum distance for obstacle avoidance in meters",
    category: "navigation",
    command: "mavlink_shell 'param set AVOID_DIST_MAX ${distance}'",
    parameters: [{ name: "distance", description: "Distance in meters", default: "5" }]
  },
  {
    id: "avoidance_status",
    name: "Get Avoidance Status",
    description: "Shows current obstacle avoidance system status",
    category: "navigation",
    command: "mavlink_shell 'status proximity'",
  },

  // Camera-Based Obstacle Detection
  {
    id: "camera_obstacle_enable",
    name: "Enable Camera Obstacle Detection",
    description: "Activates visual obstacle detection using onboard camera with OpenCV/TensorFlow processing",
    category: "navigation",
    command: "python3 /opt/mouse/vision/obstacle_detect.py --enable --camera ${camera_id} --threshold ${confidence}",
    parameters: [
      { name: "camera_id", description: "Camera device (main, thermal)", default: "main" },
      { name: "confidence", description: "Detection confidence 0.1-1.0", default: "0.7" }
    ]
  },
  {
    id: "camera_obstacle_disable",
    name: "Disable Camera Obstacle Detection",
    description: "Deactivates visual obstacle detection system",
    category: "navigation",
    command: "python3 /opt/mouse/vision/obstacle_detect.py --disable",
  },
  {
    id: "camera_obstacle_reroute",
    name: "Configure Obstacle Rerouting",
    description: "Sets automatic rerouting behavior when camera detects obstacles",
    category: "navigation",
    command: "python3 /opt/mouse/vision/obstacle_detect.py --reroute-mode ${mode} --safe-distance ${distance}",
    parameters: [
      { name: "mode", description: "Reroute mode (left, right, up, auto)", default: "auto" },
      { name: "distance", description: "Safe clearance distance in meters", default: "3" }
    ]
  },
  {
    id: "camera_detect_status",
    name: "Camera Detection Status",
    description: "Shows current camera obstacle detection status and recent detections",
    category: "navigation",
    command: "python3 /opt/mouse/vision/obstacle_detect.py --status",
  },

  // LiDAR-Based Navigation
  {
    id: "lidar_enable",
    name: "Enable LiDAR Navigation",
    description: "Activates LW20/HA LiDAR for precision altitude and forward obstacle detection",
    category: "navigation",
    command: "mavlink_shell 'param set RNGFND1_TYPE 8' && mavlink_shell 'param set PRX_TYPE 4'",
  },
  {
    id: "lidar_disable",
    name: "Disable LiDAR",
    description: "Deactivates LiDAR sensor to conserve power",
    category: "navigation",
    command: "mavlink_shell 'param set RNGFND1_TYPE 0' && mavlink_shell 'param set PRX_TYPE 0'",
  },
  {
    id: "lidar_mount_config",
    name: "Configure LiDAR Mount Orientation",
    description: "Sets LiDAR mounting direction (forward, down, or multi-axis)",
    category: "navigation",
    command: "mavlink_shell 'param set RNGFND1_ORIENT ${orient}' && mavlink_shell 'param set RNGFND1_POS_X ${x}' && mavlink_shell 'param set RNGFND1_POS_Y ${y}' && mavlink_shell 'param set RNGFND1_POS_Z ${z}'",
    parameters: [
      { name: "orient", description: "Orientation (0=fwd, 25=down)", default: "25" },
      { name: "x", description: "X offset from CG (meters)", default: "0" },
      { name: "y", description: "Y offset from CG (meters)", default: "0" },
      { name: "z", description: "Z offset from CG (meters)", default: "-0.1" }
    ]
  },
  {
    id: "lidar_forward_mode",
    name: "LiDAR Forward Obstacle Mode",
    description: "Configures LiDAR for forward-facing obstacle avoidance",
    category: "navigation",
    command: "mavlink_shell 'param set RNGFND1_ORIENT 0' && mavlink_shell 'param set AVOID_ENABLE 1' && mavlink_shell 'param set PRX_TYPE 4'",
  },
  {
    id: "lidar_status",
    name: "LiDAR Status",
    description: "Shows LiDAR health, current distance readings, and configuration",
    category: "navigation",
    command: "mavlink_shell 'status rangefinder' && mavlink_shell 'param show RNGFND1*'",
  },

  // Sensor Fusion & Multi-Sensor Verification
  {
    id: "sensor_fusion_enable",
    name: "Enable Full Sensor Fusion",
    description: "Activates fusion of all sensors (GPS, compass, barometers, IMUs) for accurate positioning",
    category: "navigation",
    command: "mavlink_shell 'param set AHRS_EKF_TYPE 3' && mavlink_shell 'param set EK3_ENABLE 1' && mavlink_shell 'param set EK3_SRC1_POSXY 3' && mavlink_shell 'param set EK3_SRC1_VELXY 3'",
  },
  {
    id: "sensor_fusion_status",
    name: "Sensor Fusion Status",
    description: "Shows EKF filter status and sensor health for all inputs",
    category: "navigation",
    command: "mavlink_shell 'status ekf' && mavlink_shell 'status sensors'",
  },
  {
    id: "verify_position",
    name: "Verify Position (Multi-Sensor)",
    description: "Cross-checks position using multiple GPS modules, compass, and visual odometry",
    category: "navigation",
    command: "python3 /opt/mouse/nav/verify_position.py --gps-count 2 --compass-verify --baro-verify --report",
  },
  {
    id: "verify_altitude",
    name: "Verify Altitude (Multi-Sensor)",
    description: "Cross-references altitude from barometers, GPS, and LiDAR for accuracy",
    category: "navigation",
    command: "python3 /opt/mouse/nav/verify_altitude.py --sources baro1,baro2,gps,lidar --tolerance ${tolerance}",
    parameters: [{ name: "tolerance", description: "Max variance tolerance in meters", default: "2" }]
  },
  {
    id: "compass_verify",
    name: "Verify Compass Heading",
    description: "Cross-checks heading using multiple compasses and GPS track",
    category: "navigation",
    command: "mavlink_shell 'status compass' && python3 /opt/mouse/nav/verify_heading.py --tolerance ${degrees}",
    parameters: [{ name: "degrees", description: "Max variance in degrees", default: "10" }]
  },
  {
    id: "dual_gps_mode",
    name: "Enable Dual GPS Blending",
    description: "Activates blending of Here3+ GPS with secondary GPS for redundancy",
    category: "navigation",
    command: "mavlink_shell 'param set GPS_AUTO_SWITCH 2' && mavlink_shell 'param set GPS_BLEND_MASK 5'",
  },
  {
    id: "barometer_calibrate",
    name: "Calibrate Barometers",
    description: "Recalibrates all barometers using ground pressure reference",
    category: "navigation",
    command: "mavlink_shell 'baro calibrate' && mavlink_shell 'status baro'",
  },

  // GPS-Denied Navigation
  {
    id: "gps_denied_enable",
    name: "Enable GPS-Denied Navigation",
    description: "Activates visual odometry, dead reckoning, and compass-based navigation for GPS-denied environments",
    category: "navigation",
    command: "python3 /opt/mouse/nav/gps_denied.py --enable --mode ${mode}",
    parameters: [{ name: "mode", description: "Mode: visual, deadreck, fusion", default: "fusion" }]
  },
  {
    id: "gps_denied_disable",
    name: "Disable GPS-Denied Navigation",
    description: "Returns to normal GPS-based navigation",
    category: "navigation",
    command: "python3 /opt/mouse/nav/gps_denied.py --disable && mavlink_shell 'param set EK3_SRC1_POSXY 3'",
  },
  {
    id: "visual_odometry_enable",
    name: "Enable Visual Odometry",
    description: "Uses camera footage to estimate position and movement without GPS",
    category: "navigation",
    command: "python3 /opt/mouse/nav/visual_odom.py --enable --camera main --feature-tracking on",
  },
  {
    id: "visual_odometry_status",
    name: "Visual Odometry Status",
    description: "Shows visual odometry health, feature count, and position estimate",
    category: "navigation",
    command: "python3 /opt/mouse/nav/visual_odom.py --status",
  },
  {
    id: "dead_reckoning_enable",
    name: "Enable Dead Reckoning",
    description: "Calculates position from compass heading, speed, and flight time when GPS is unavailable",
    category: "navigation",
    command: "python3 /opt/mouse/nav/dead_reckoning.py --enable --use-compass --use-airspeed",
  },
  {
    id: "dead_reckoning_calibrate",
    name: "Calibrate Dead Reckoning",
    description: "Calibrates dead reckoning with current known position",
    category: "navigation",
    command: "python3 /opt/mouse/nav/dead_reckoning.py --calibrate --lat ${lat} --lon ${lon}",
    parameters: [
      { name: "lat", description: "Current known latitude", default: "36.0957" },
      { name: "lon", description: "Current known longitude", default: "-79.4378" }
    ]
  },
  {
    id: "flight_path_history",
    name: "Use Flight Path History",
    description: "Enables return navigation using recorded flight path when GPS is lost",
    category: "navigation",
    command: "python3 /opt/mouse/nav/path_history.py --enable --record-interval 1 --max-points 1000",
  },
  {
    id: "terrain_following",
    name: "Enable Terrain Following",
    description: "Uses LiDAR/barometer for terrain-relative altitude hold without GPS altitude",
    category: "navigation",
    command: "mavlink_shell 'param set TERRAIN_FOLLOW 1' && mavlink_shell 'param set RNGFND_LANDING 1'",
  },
  {
    id: "gps_denied_status",
    name: "GPS-Denied Navigation Status",
    description: "Shows status of all GPS-denied navigation systems and estimated accuracy",
    category: "navigation",
    command: "python3 /opt/mouse/nav/gps_denied.py --status --show-accuracy",
  },

  // Autonomous Safety & Failsafe
  {
    id: "failsafe_gps_lost",
    name: "Configure GPS Lost Failsafe",
    description: "Sets behavior when GPS signal is lost (land, rtl_visual, hover, continue)",
    category: "navigation",
    command: "mavlink_shell 'param set FS_EKF_ACTION ${action}' && python3 /opt/mouse/nav/failsafe.py --gps-lost ${action}",
    parameters: [{ name: "action", description: "Action: land, hover, rtl_visual", default: "hover" }]
  },
  {
    id: "failsafe_sensor_redundancy",
    name: "Configure Sensor Redundancy",
    description: "Sets minimum sensor count required before triggering failsafe",
    category: "navigation",
    command: "python3 /opt/mouse/nav/failsafe.py --min-gps ${gps} --min-compass ${compass} --min-baro ${baro}",
    parameters: [
      { name: "gps", description: "Minimum GPS modules", default: "1" },
      { name: "compass", description: "Minimum compasses", default: "1" },
      { name: "baro", description: "Minimum barometers", default: "1" }
    ]
  },

  // Arming Commands
  {
    id: "arm_system",
    name: "Arm System",
    description: "Arms the drone motors for flight",
    category: "arming",
    command: "mavlink_shell 'arm throttle'",
    parameters: [{ name: "force", description: "Force arm even if checks fail", default: "false" }]
  },
  {
    id: "disarm_system",
    name: "Disarm System",
    description: "Disarms the drone motors",
    category: "arming",
    command: "mavlink_shell 'disarm'",
  },
  {
    id: "force_disarm",
    name: "Force Disarm (Emergency)",
    description: "Emergency disarm - kills motors immediately",
    category: "arming",
    command: "mavlink_shell 'disarm force'",
  },

  // Flight Commands
  {
    id: "takeoff",
    name: "Takeoff",
    description: "Initiates automatic takeoff to specified altitude",
    category: "flight",
    command: "mavlink_shell 'mode guided' && mavlink_shell 'takeoff ${altitude}'",
    parameters: [{ name: "altitude", description: "Target altitude in meters", default: "10" }]
  },
  {
    id: "land",
    name: "Land",
    description: "Initiates controlled landing at current position",
    category: "flight",
    command: "mavlink_shell 'mode land'",
  },
  {
    id: "rtl",
    name: "Return to Launch",
    description: "Returns to home position and lands",
    category: "flight",
    command: "mavlink_shell 'mode rtl'",
  },
  {
    id: "hover",
    name: "Hover/Loiter",
    description: "Maintains current position",
    category: "flight",
    command: "mavlink_shell 'mode loiter'",
  },
  {
    id: "emergency_stop",
    name: "Emergency Stop",
    description: "Immediately stops all motors (use with caution)",
    category: "flight",
    command: "mavlink_shell 'disarm force' && echo 'EMERGENCY STOP EXECUTED'",
  },
  {
    id: "set_flight_mode",
    name: "Set Flight Mode",
    description: "Changes drone flight mode (stabilize, alt_hold, loiter, auto, guided, rtl, land)",
    category: "flight",
    command: "mavlink_shell 'mode ${mode}'",
    parameters: [{ name: "mode", description: "Flight mode name", default: "loiter" }]
  },

  // Navigation Commands
  {
    id: "goto_waypoint",
    name: "Go to Waypoint",
    description: "Navigate to specified waypoint number",
    category: "navigation",
    command: "mavlink_shell 'wp set ${waypoint_id}'",
    parameters: [{ name: "waypoint_id", description: "Waypoint number", default: "1" }]
  },
  {
    id: "set_waypoint",
    name: "Set Waypoint",
    description: "Creates a new waypoint at specified coordinates",
    category: "navigation",
    command: "mavlink_shell 'wp add ${lat} ${lon} ${alt}'",
    parameters: [
      { name: "lat", description: "Latitude", default: "36.0957" },
      { name: "lon", description: "Longitude", default: "-79.4378" },
      { name: "alt", description: "Altitude (m)", default: "30" }
    ]
  },
  {
    id: "clear_waypoints",
    name: "Clear Waypoints",
    description: "Removes all waypoints from mission",
    category: "navigation",
    command: "mavlink_shell 'wp clear'",
  },
  {
    id: "start_mission",
    name: "Start Mission",
    description: "Begins autonomous mission execution",
    category: "navigation",
    command: "mavlink_shell 'mode auto'",
  },
  {
    id: "pause_mission",
    name: "Pause Mission",
    description: "Pauses current mission and holds position",
    category: "navigation",
    command: "mavlink_shell 'mode loiter'",
  },
  {
    id: "resume_mission",
    name: "Resume Mission",
    description: "Resumes paused mission from current waypoint",
    category: "navigation",
    command: "mavlink_shell 'mode auto'",
  },
  {
    id: "set_home",
    name: "Set Home Position",
    description: "Sets current position as home/launch point",
    category: "navigation",
    command: "mavlink_shell 'set_home ${lat} ${lon} ${alt}'",
    parameters: [
      { name: "lat", description: "Latitude", default: "current" },
      { name: "lon", description: "Longitude", default: "current" },
      { name: "alt", description: "Altitude (m)", default: "current" }
    ]
  },
  {
    id: "get_mission_status",
    name: "Get Mission Status",
    description: "Returns current mission progress and active waypoint",
    category: "navigation",
    command: "mavlink_shell 'status mission'",
  },

  // Telemetry Commands - Orange Cube+ Sensors
  {
    id: "get_attitude",
    name: "Get Attitude (Pitch/Roll/Yaw)",
    description: "Retrieves current pitch, roll, and yaw angles from IMU",
    category: "telemetry",
    command: "mavlink_shell 'status attitude'",
  },
  {
    id: "get_position",
    name: "Get Position (Lat/Lon/Alt)",
    description: "Retrieves current GPS position and altitude",
    category: "telemetry",
    command: "mavlink_shell 'status gps'",
  },
  {
    id: "get_heading",
    name: "Get Compass Heading",
    description: "Retrieves current magnetometer/compass heading",
    category: "telemetry",
    command: "mavlink_shell 'status compass'",
  },
  {
    id: "get_dist_home",
    name: "Get Distance to Home",
    description: "Calculates distance from current position to home",
    category: "telemetry",
    command: "mavlink_shell 'status home'",
  },
  {
    id: "get_battery",
    name: "Get Battery Status",
    description: "Retrieves battery voltage and remaining capacity",
    category: "telemetry",
    command: "mavlink_shell 'status battery'",
  },
  {
    id: "get_motor_status",
    name: "Get Motor Status",
    description: "Retrieves RPM, temperature, and current for all motors",
    category: "telemetry",
    command: "mavlink_shell 'status motors'",
  },
  {
    id: "get_accelerometer",
    name: "Get Accelerometer Data",
    description: "Reads Orange Cube+ accelerometer X/Y/Z values (m/s²)",
    category: "telemetry",
    command: "mavlink_shell 'status accel'",
  },
  {
    id: "get_gyroscope",
    name: "Get Gyroscope Data",
    description: "Reads Orange Cube+ gyroscope angular rates (rad/s)",
    category: "telemetry",
    command: "mavlink_shell 'status gyro'",
  },
  {
    id: "get_barometer1",
    name: "Get Barometer 1 Data",
    description: "Reads primary barometer pressure and altitude (Orange Cube+)",
    category: "telemetry",
    command: "mavlink_shell 'status baro1'",
  },
  {
    id: "get_barometer2",
    name: "Get Barometer 2 Data",
    description: "Reads secondary barometer pressure and altitude (Orange Cube+)",
    category: "telemetry",
    command: "mavlink_shell 'status baro2'",
  },
  {
    id: "get_magnetometer",
    name: "Get Magnetometer Data",
    description: "Reads Orange Cube+ magnetometer/compass raw values",
    category: "telemetry",
    command: "mavlink_shell 'status mag'",
  },
  {
    id: "get_adsb",
    name: "Get ADS-B Data",
    description: "Retrieves nearby aircraft from ADSB Carrier Board receiver",
    category: "telemetry",
    command: "mavlink_shell 'adsb list'",
  },
  {
    id: "get_adsb_config",
    name: "Get ADS-B Configuration",
    description: "Shows ADSB receiver settings and status",
    category: "telemetry",
    command: "mavlink_shell 'adsb status'",
  },
  {
    id: "set_adsb_range",
    name: "Set ADS-B Range",
    description: "Configures ADS-B detection range in nautical miles",
    category: "telemetry",
    command: "mavlink_shell 'adsb range ${range}'",
    parameters: [{ name: "range", description: "Range in NM", default: "10" }]
  },
  // Here3+ GPS Module Commands
  {
    id: "get_here3_gps",
    name: "Get Here3+ GPS Data",
    description: "Reads u-blox M8P-2 GNSS position (GPS/GLONASS/Galileo/BeiDou)",
    category: "telemetry",
    command: "mavlink_shell 'status gps2'",
  },
  {
    id: "get_here3_rtk",
    name: "Get Here3+ RTK Status",
    description: "Shows RTK fix status and accuracy from Here3+ GPS",
    category: "telemetry",
    command: "mavlink_shell 'status rtk'",
  },
  {
    id: "get_here3_accel",
    name: "Get Here3+ Accelerometer",
    description: "Reads Here3+ GPS module internal accelerometer",
    category: "telemetry",
    command: "mavlink_shell 'can read gps accel'",
  },
  {
    id: "get_here3_gyro",
    name: "Get Here3+ Gyroscope",
    description: "Reads Here3+ GPS module internal gyroscope",
    category: "telemetry",
    command: "mavlink_shell 'can read gps gyro'",
  },
  {
    id: "get_here3_compass",
    name: "Get Here3+ RM3100 Compass",
    description: "Reads Here3+ RM3100 high-precision compass data",
    category: "telemetry",
    command: "mavlink_shell 'can read gps compass'",
  },
  {
    id: "get_here3_baro",
    name: "Get Here3+ MS5611 Barometer",
    description: "Reads Here3+ MS5611 barometer pressure and temperature",
    category: "telemetry",
    command: "mavlink_shell 'can read gps baro'",
  },
  {
    id: "get_here3_led",
    name: "Get Here3+ LED Status",
    description: "Shows Here3+ Status LED current state and color",
    category: "telemetry",
    command: "mavlink_shell 'can read gps led'",
  },
  {
    id: "set_here3_led",
    name: "Set Here3+ LED Color",
    description: "Sets Here3+ Status LED color (for testing)",
    category: "telemetry",
    command: "mavlink_shell 'can write gps led ${color}'",
    parameters: [{ name: "color", description: "LED color (red/green/blue/off)", default: "green" }]
  },
  // LiDAR Commands
  {
    id: "get_lidar",
    name: "Get LW20/HA LiDAR Range",
    description: "Reads current distance measurement from LiDAR sensor",
    category: "telemetry",
    command: "mavlink_shell 'status lidar'",
  },
  {
    id: "get_lidar_config",
    name: "Get LiDAR Configuration",
    description: "Shows LW20/HA LiDAR settings (range, rate, mode)",
    category: "telemetry",
    command: "mavlink_shell 'lidar config'",
  },
  // Vibration & System Health
  {
    id: "get_vibration",
    name: "Get Vibration Data",
    description: "Reads accelerometer vibration levels and clipping",
    category: "telemetry",
    command: "mavlink_shell 'status vibration'",
  },
  {
    id: "get_system_status",
    name: "Get System Status",
    description: "Shows overall system health and sensor status",
    category: "telemetry",
    command: "mavlink_shell 'status all'",
  },

  // Camera Commands
  {
    id: "capture_photo",
    name: "Capture Photo",
    description: "Takes a single photo from the gimbal camera",
    category: "camera",
    command: "gst-launch-1.0 v4l2src device=/dev/video0 num-buffers=1 ! jpegenc ! filesink location=/tmp/capture_$(date +%s).jpg",
  },
  {
    id: "gimbal_nadir",
    name: "Gimbal to Nadir",
    description: "Points gimbal straight down (-90°)",
    category: "camera",
    command: "mavlink_shell 'gimbal pitch -90'",
  },
  {
    id: "gimbal_forward",
    name: "Gimbal Forward",
    description: "Points gimbal forward (0°)",
    category: "camera",
    command: "mavlink_shell 'gimbal pitch 0'",
  },
  {
    id: "gimbal_set",
    name: "Set Gimbal Angle",
    description: "Sets gimbal pitch angle (-90° to +45°)",
    category: "camera",
    command: "mavlink_shell 'gimbal pitch ${angle}'",
    parameters: [{ name: "angle", description: "Pitch angle in degrees", default: "-45" }]
  },
  {
    id: "switch_thermal",
    name: "Switch to Thermal",
    description: "Switches camera feed to thermal imaging (384x288)",
    category: "camera",
    command: "echo 'thermal' > /tmp/camera_mode",
  },
  {
    id: "switch_visible",
    name: "Switch to Visible",
    description: "Switches camera feed to visible light (2K HD)",
    category: "camera",
    command: "echo 'visible' > /tmp/camera_mode",
  },
  {
    id: "thermal_palette",
    name: "Set Thermal Palette",
    description: "Changes thermal camera color palette",
    category: "camera",
    command: "echo '${palette}' > /tmp/thermal_palette",
    parameters: [{ name: "palette", description: "Palette (ironbow/rainbow/white-hot/black-hot)", default: "ironbow" }]
  },

  // Video Commands
  {
    id: "start_recording",
    name: "Start Video Recording",
    description: "Begins recording video from gimbal camera",
    category: "video",
    command: "gst-launch-1.0 -e v4l2src device=/dev/video0 ! videoconvert ! x264enc ! mp4mux ! filesink location=/recordings/video_$(date +%s).mp4 &",
  },
  {
    id: "stop_recording",
    name: "Stop Video Recording",
    description: "Stops current video recording",
    category: "video",
    command: "pkill -SIGINT gst-launch",
  },
  {
    id: "video_stream_start",
    name: "Start Video Stream",
    description: "Starts UDP video stream for remote viewing",
    category: "video",
    command: "gst-launch-1.0 v4l2src device=/dev/video0 ! videoconvert ! x264enc tune=zerolatency ! rtph264pay ! udpsink host=${stream_ip} port=5600 &",
    parameters: [{ name: "stream_ip", description: "Stream destination IP", default: "192.168.1.100" }]
  },
  {
    id: "video_stream_stop",
    name: "Stop Video Stream",
    description: "Stops active video stream",
    category: "video",
    command: "pkill -f 'gst-launch.*udpsink'",
  },
  {
    id: "video_input_script",
    name: "Video Input Configuration",
    description: "Configures video input source and format",
    category: "video",
    command: "v4l2-ctl -d /dev/video0 --set-fmt-video=width=${width},height=${height},pixelformat=MJPG",
    parameters: [
      { name: "width", description: "Video width", default: "2560" },
      { name: "height", description: "Video height", default: "1440" }
    ]
  },
  {
    id: "list_recordings",
    name: "List Recordings",
    description: "Shows all saved video recordings",
    category: "video",
    command: "ls -la /recordings/",
  },

  // System Commands
  {
    id: "reboot_fc",
    name: "Reboot Flight Controller",
    description: "Reboots the Orange Cube+ flight controller",
    category: "system",
    command: "mavlink_shell 'reboot'",
  },
  {
    id: "calibrate_compass",
    name: "Calibrate Compass",
    description: "Initiates compass calibration procedure",
    category: "system",
    command: "mavlink_shell 'compass calibrate'",
  },
  {
    id: "calibrate_accel",
    name: "Calibrate Accelerometer",
    description: "Initiates accelerometer calibration",
    category: "system",
    command: "mavlink_shell 'accel calibrate'",
  },
  {
    id: "calibrate_gyro",
    name: "Calibrate Gyroscope",
    description: "Initiates gyroscope calibration (keep drone still)",
    category: "system",
    command: "mavlink_shell 'gyro calibrate'",
  },
  {
    id: "calibrate_baro",
    name: "Calibrate Barometer",
    description: "Calibrates barometers to current altitude",
    category: "system",
    command: "mavlink_shell 'baro calibrate'",
  },
  {
    id: "check_prearm",
    name: "Pre-Arm Check",
    description: "Runs all pre-arm safety checks",
    category: "system",
    command: "mavlink_shell 'prearm_check'",
  },
  {
    id: "get_params",
    name: "List Parameters",
    description: "Lists all flight controller parameters",
    category: "system",
    command: "mavlink_shell 'param show'",
  },
  {
    id: "set_param",
    name: "Set Parameter",
    description: "Sets a flight controller parameter value",
    category: "system",
    command: "mavlink_shell 'param set ${param_name} ${value}'",
    parameters: [
      { name: "param_name", description: "Parameter name", default: "ARMING_CHECK" },
      { name: "value", description: "Parameter value", default: "1" }
    ]
  },
  {
    id: "get_version",
    name: "Get Firmware Version",
    description: "Shows ArduPilot firmware version information",
    category: "system",
    command: "mavlink_shell 'version'",
  },
  {
    id: "save_eeprom",
    name: "Save to EEPROM",
    description: "Saves current parameters to flight controller EEPROM",
    category: "system",
    command: "mavlink_shell 'param save'",
  },
];

const filterSupported = (list: SystemCommand[]) =>
  list.filter((cmd) => isBackendSupportedTerminalCommand(String(cmd?.command || "")));

export function TerminalCommandsPanel() {
  const { hasPermission } = usePermissions();
  const canRunTerminal = hasPermission('run_terminal');
  const [commands, setCommands] = useState<SystemCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommand, setSelectedCommand] = useState<SystemCommand | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState<SystemCommand | null>(null);
  const [executionLog, setExecutionLog] = useState<{ command: string; timestamp: string; status: string }[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('arming');
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [newCommand, setNewCommand] = useState({
    name: "",
    description: "",
    category: "system" as SystemCommand['category'],
    command: ""
  });

  useEffect(() => {
    if (!canRunTerminal) {
      setLoading(false);
      return;
    }
    fetch("/api/terminal-commands")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data?.commands)) {
          setCommands(filterSupported(data.commands));
        } else {
          setCommands(filterSupported(defaultCommands));
        }
      })
      .catch(() => setCommands(filterSupported(defaultCommands)))
      .finally(() => setLoading(false));
  }, [canRunTerminal]);

  const persistCommands = useCallback(async (nextCommands: SystemCommand[]) => {
    try {
      const res = await fetch("/api/terminal-commands", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands: nextCommands }),
      });
      if (!res.ok) throw new Error("Persist failed");
    } catch (e) {
      console.warn("[TerminalCommands] persist failed:", e);
      toast.error("Failed to save commands");
    }
  }, []);

  const handleSave = () => {
    if (!editedCommand) return;
    if (!isBackendSupportedTerminalCommand(editedCommand.command)) {
      toast.error("This panel only supports commands with a safe backend implementation.");
      return;
    }
    const next = commands.map(c => c.id === editedCommand.id ? editedCommand : c);
    setCommands(next);
    setSelectedCommand(editedCommand);
    setIsEditing(false);
    void persistCommands(next);
    toast.success("Command saved");
  };

  const handleExecute = useCallback(async (cmd: SystemCommand) => {
    const timestamp = new Date().toISOString();
    setExecutionLog(prev => [{ command: cmd.command, timestamp, status: 'queued' }, ...prev].slice(0, 50));

    try {
      const command = await dispatchBackendCommand({
        commandType: "terminal",
        payload: { command: cmd.command },
        timeoutMs: 15000,
      });
      setExecutionLog((prev) =>
        [{ command: cmd.command, timestamp: new Date().toISOString(), status: String(command?.status || "acked") }, ...prev].slice(0, 50),
      );

      setCommands(prev => prev.map(c => c.id === cmd.id ? { ...c, lastExecuted: new Date().toISOString() } : c));
      toast.success(`Executed: ${cmd.name}`);
    } catch (error) {
      setExecutionLog((prev) =>
        [{ command: cmd.command, timestamp: new Date().toISOString(), status: "failed" }, ...prev].slice(0, 50),
      );
      toast.error(error instanceof Error ? error.message : "Command execution failed");
    }
  }, []);

  // Allow custom widget buttons to trigger terminal commands by command string.
  useEffect(() => {
    const handleExternalExecute = (e: CustomEvent<{ command?: string }>) => {
      const commandText = e.detail?.command?.trim();
      if (!commandText) return;
      if (!isBackendSupportedTerminalCommand(commandText)) {
        toast.error("External command blocked: no safe backend implementation exists for it.");
        return;
      }
      const matched = commands.find((cmd) => cmd.command.trim() === commandText);
      if (matched) {
        handleExecute(matched);
      } else {
        const adHoc: SystemCommand = {
          id: `adhoc_${Date.now()}`,
          name: "External Command",
          description: "Triggered from custom widget",
          category: "system",
          command: commandText,
        };
        handleExecute(adHoc);
      }
    };

    window.addEventListener('execute-command' as any, handleExternalExecute);
    return () => window.removeEventListener('execute-command' as any, handleExternalExecute);
  }, [commands, handleExecute]);

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    toast.success("Command copied to clipboard");
  };

  const handleReset = () => {
    if (confirm("Reset all commands to defaults? Your customizations will be lost.")) {
      const defaults = filterSupported(defaultCommands);
      setCommands(defaults);
      void persistCommands(defaults);
      toast.success("Commands reset to defaults");
    }
  };

  const handleAddCommand = () => {
    if (!newCommand.name.trim() || !newCommand.command.trim()) {
      toast.error("Please enter a name and command");
      return;
    }
    if (!isBackendSupportedTerminalCommand(newCommand.command)) {
      toast.error("Only commands with a safe backend implementation can be added here.");
      return;
    }
    const cmd: SystemCommand = {
      id: `custom_${Date.now()}`,
      name: newCommand.name,
      description: newCommand.description || "Custom command",
      category: newCommand.category,
      command: newCommand.command,
    };
    const next = [...commands, cmd];
    setCommands(next);
    setNewCommand({ name: "", description: "", category: "system", command: "" });
    setShowAddCommand(false);
    setActiveCategory(newCommand.category);
    void persistCommands(next);
    toast.success(`Command "${cmd.name}" added`);
  };

  const handleDeleteCommand = (id: string) => {
    if (id.startsWith('custom_')) {
      const next = commands.filter(c => c.id !== id);
      setCommands(next);
      if (selectedCommand?.id === id) setSelectedCommand(null);
      void persistCommands(next);
      toast.success("Command deleted");
    } else {
      toast.error("Cannot delete built-in commands");
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'arming': return <Shield className="h-4 w-4" />;
      case 'flight': return <Navigation className="h-4 w-4" />;
      case 'navigation': return <MapPin className="h-4 w-4" />;
      case 'telemetry': return <Radio className="h-4 w-4" />;
      case 'camera': return <Camera className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'system': return <Settings className="h-4 w-4" />;
      default: return <Terminal className="h-4 w-4" />;
    }
  };

  const categories = ['arming', 'flight', 'navigation', 'telemetry', 'camera', 'video', 'system'];
  const filteredCommands = commands.filter(c => c.category === activeCategory);

  // Show loading
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading commands...</p>
        </div>
      </div>
    );
  }

  // Show permission denied if user doesn't have access
  if (!canRunTerminal) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access terminal commands.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Left - Categories & Command List */}
      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              Safe Commands
            </h3>
            <div className="flex gap-1">
              <Button size="sm" variant="default" onClick={() => setShowAddCommand(true)} data-testid="button-add-command">
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleReset} data-testid="button-reset-commands">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Only commands with a verified backend implementation are available here.
          </p>
          <p className="text-[11px] text-amber-500 mt-1">
            Placeholder shell snippets and unsupported backend actions were removed.
          </p>
          
          {showAddCommand && (
            <div className="mt-3 p-3 bg-muted/30 rounded-lg space-y-2">
              <Input 
                placeholder="Command name"
                value={newCommand.name}
                onChange={(e) => setNewCommand(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-new-command-name"
              />
              <Input 
                placeholder="Description"
                value={newCommand.description}
                onChange={(e) => setNewCommand(prev => ({ ...prev, description: e.target.value }))}
                data-testid="input-new-command-desc"
              />
              <Textarea 
                placeholder="mavlink_shell 'your command here'"
                value={newCommand.command}
                onChange={(e) => setNewCommand(prev => ({ ...prev, command: e.target.value }))}
                className="font-mono text-xs min-h-[60px]"
                data-testid="textarea-new-command"
              />
              <div className="flex gap-2">
                <select 
                  className="flex-1 h-8 px-2 text-xs rounded bg-background border border-input"
                  value={newCommand.category}
                  onChange={(e) => setNewCommand(prev => ({ ...prev, category: e.target.value as SystemCommand['category'] }))}
                >
                  <option value="arming">Arming</option>
                  <option value="flight">Flight</option>
                  <option value="navigation">Navigation</option>
                  <option value="telemetry">Telemetry</option>
                  <option value="camera">Camera</option>
                  <option value="video">Video</option>
                  <option value="system">System</option>
                </select>
                <Button size="sm" variant="outline" onClick={() => setShowAddCommand(false)}>
                  <X className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleAddCommand} data-testid="button-save-new-command">
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="p-2 border-b border-border overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {categories.map(cat => (
              <Button
                key={cat}
                size="sm"
                variant={activeCategory === cat ? "default" : "ghost"}
                className="text-xs capitalize gap-1"
                onClick={() => setActiveCategory(cat)}
                data-testid={`button-category-${cat}`}
              >
                {getCategoryIcon(cat)}
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Command List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading commands...
              </div>
            ) : (
            filteredCommands.map(cmd => (
              <Card
                key={cmd.id}
                className={`cursor-pointer transition-colors ${
                  selectedCommand?.id === cmd.id 
                    ? "border-primary bg-primary/10" 
                    : "hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedCommand(cmd);
                  setEditedCommand(cmd);
                  setIsEditing(false);
                }}
                data-testid={`card-command-${cmd.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-1">
                        {cmd.name}
                        {cmd.id.startsWith('custom_') && (
                          <Badge variant="outline" className="text-[8px] h-4">Custom</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {cmd.description}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {cmd.id.startsWith('custom_') && (
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCommand(cmd.id); }}
                          data-testid={`button-delete-${cmd.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleExecute(cmd); }}
                        data-testid={`button-execute-${cmd.id}`}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {cmd.lastExecuted && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Last run: {new Date(cmd.lastExecuted).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Right - Command Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedCommand ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{selectedCommand.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedCommand.description}</p>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button onClick={handleSave} data-testid="button-save-command">
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => handleCopy(selectedCommand.command)} data-testid="button-copy-command">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                    <Button variant="outline" onClick={() => handleExecute(selectedCommand)} data-testid="button-run-command">
                      <Play className="h-4 w-4 mr-2" />
                      Run
                    </Button>
                    <Button onClick={() => setIsEditing(true)} data-testid="button-edit-command">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto space-y-4">
              {/* Command Script */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Command Script
                </Label>
                <Textarea 
                  value={isEditing ? editedCommand?.command || "" : selectedCommand.command}
                  onChange={(e) => setEditedCommand(prev => prev ? { ...prev, command: e.target.value } : null)}
                  disabled={!isEditing}
                  className="font-mono text-sm min-h-[120px] bg-slate-950 text-emerald-400"
                  data-testid="textarea-command-script"
                />
              </div>

              {/* Parameters */}
              {selectedCommand.parameters && selectedCommand.parameters.length > 0 && (
                <div className="space-y-2">
                  <Label>Parameters</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(isEditing ? editedCommand?.parameters : selectedCommand.parameters)?.map((param, idx) => (
                      <div key={idx} className="p-3 bg-muted/30 rounded-lg">
                        <Label className="text-xs text-muted-foreground">${param.name}</Label>
                        <Input 
                          value={param.default}
                          onChange={(e) => {
                            if (!editedCommand) return;
                            const newParams = [...(editedCommand.parameters || [])];
                            newParams[idx] = { ...param, default: e.target.value };
                            setEditedCommand({ ...editedCommand, parameters: newParams });
                          }}
                          disabled={!isEditing}
                          className="mt-1 font-mono"
                          data-testid={`input-param-${param.name}`}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">{param.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                {isEditing ? (
                  <Input 
                    value={editedCommand?.description || ""}
                    onChange={(e) => setEditedCommand(prev => prev ? { ...prev, description: e.target.value } : null)}
                    data-testid="input-command-description"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground p-2 bg-muted/30 rounded">
                    {selectedCommand.description}
                  </p>
                )}
              </div>

              <Separator />

              {/* Execution Log */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Recent Executions
                </Label>
                <div className="max-h-40 overflow-auto bg-muted/30 rounded-lg p-2 space-y-1">
                  {executionLog.filter(l => l.command === selectedCommand.command).slice(0, 5).map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-1 bg-background/50 rounded">
                      <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                        {log.status}
                      </Badge>
                    </div>
                  ))}
                  {executionLog.filter(l => l.command === selectedCommand.command).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No executions recorded</p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a command to view details</p>
              <p className="text-xs mt-2">All commands are editable</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
