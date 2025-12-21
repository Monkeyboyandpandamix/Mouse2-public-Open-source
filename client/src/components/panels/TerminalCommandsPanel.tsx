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
  Shield
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface SystemCommand {
  id: string;
  name: string;
  description: string;
  category: 'arming' | 'flight' | 'navigation' | 'telemetry' | 'camera' | 'video' | 'system';
  command: string;
  parameters?: { name: string; description: string; default: string }[];
  lastExecuted?: string;
}

const defaultCommands: SystemCommand[] = [
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
      { name: "lat", description: "Latitude", default: "34.0522" },
      { name: "lon", description: "Longitude", default: "-118.2437" },
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

  // Telemetry Commands
  {
    id: "get_attitude",
    name: "Get Attitude (Pitch/Roll/Yaw)",
    description: "Retrieves current pitch, roll, and yaw angles",
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
    name: "Get Heading",
    description: "Retrieves current compass heading",
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
    id: "switch_thermal",
    name: "Switch to Thermal",
    description: "Switches camera feed to thermal imaging",
    category: "camera",
    command: "echo 'thermal' > /tmp/camera_mode",
  },
  {
    id: "switch_visible",
    name: "Switch to Visible",
    description: "Switches camera feed to visible light",
    category: "camera",
    command: "echo 'visible' > /tmp/camera_mode",
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
    description: "Starts RTSP video stream for remote viewing",
    category: "video",
    command: "gst-launch-1.0 v4l2src device=/dev/video0 ! videoconvert ! x264enc tune=zerolatency ! rtph264pay ! udpsink host=${stream_ip} port=5600 &",
    parameters: [{ name: "stream_ip", description: "Stream destination IP", default: "192.168.1.100" }]
  },
  {
    id: "video_input_script",
    name: "Video Input Configuration",
    description: "Configures video input source and format",
    category: "video",
    command: "v4l2-ctl -d /dev/video0 --set-fmt-video=width=${width},height=${height},pixelformat=MJPG",
    parameters: [
      { name: "width", description: "Video width", default: "1920" },
      { name: "height", description: "Video height", default: "1080" }
    ]
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
    id: "check_prearm",
    name: "Pre-Arm Check",
    description: "Runs all pre-arm safety checks",
    category: "system",
    command: "mavlink_shell 'prearm_check'",
  },
];

export function TerminalCommandsPanel() {
  const [commands, setCommands] = useState<SystemCommand[]>(() => {
    const saved = localStorage.getItem('mouse_terminal_commands');
    return saved ? JSON.parse(saved) : defaultCommands;
  });
  const [selectedCommand, setSelectedCommand] = useState<SystemCommand | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState<SystemCommand | null>(null);
  const [executionLog, setExecutionLog] = useState<{ command: string; timestamp: string; status: string }[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('arming');

  useEffect(() => {
    localStorage.setItem('mouse_terminal_commands', JSON.stringify(commands));
  }, [commands]);

  const handleSave = () => {
    if (!editedCommand) return;
    setCommands(prev => prev.map(c => c.id === editedCommand.id ? editedCommand : c));
    setSelectedCommand(editedCommand);
    setIsEditing(false);
    toast.success("Command saved");
  };

  const handleExecute = (cmd: SystemCommand) => {
    const log = {
      command: cmd.command,
      timestamp: new Date().toISOString(),
      status: 'executed'
    };
    setExecutionLog(prev => [log, ...prev].slice(0, 50));
    setCommands(prev => prev.map(c => c.id === cmd.id ? { ...c, lastExecuted: log.timestamp } : c));
    toast.success(`Executed: ${cmd.name}`);
  };

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    toast.success("Command copied to clipboard");
  };

  const handleReset = () => {
    if (confirm("Reset all commands to defaults? Your customizations will be lost.")) {
      setCommands(defaultCommands);
      localStorage.removeItem('mouse_terminal_commands');
      toast.success("Commands reset to defaults");
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

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Left - Categories & Command List */}
      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              Terminal Commands
            </h3>
            <Button size="sm" variant="outline" onClick={handleReset} data-testid="button-reset-commands">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            View and edit system commands for all drone operations
          </p>
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
            {filteredCommands.map(cmd => (
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
                      <div className="font-medium text-sm">{cmd.name}</div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {cmd.description}
                      </p>
                    </div>
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
