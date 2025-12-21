import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Download, 
  Search, 
  Filter, 
  Play, 
  FileText, 
  Activity, 
  MapPin, 
  Clock, 
  Plane, 
  AlertTriangle,
  Video,
  Image,
  Box,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";

interface FlightSession {
  id: number;
  missionId: number | null;
  startTime: string;
  endTime: string | null;
  status: string;
  totalFlightTime: number | null;
  maxAltitude: number | null;
  totalDistance: number | null;
  videoFilePath: string | null;
  logFilePath: string | null;
  model3dFilePath: string | null;
}

interface FlightEvent {
  id: number;
  sessionId: number;
  timestamp: string;
  eventType: string;
  eventData: any;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success' | 'warning';
  source: string;
  message: string;
}

const mockFlightSessions: FlightSession[] = [
  {
    id: 1,
    missionId: 1,
    startTime: "2024-01-15T10:30:00Z",
    endTime: "2024-01-15T10:45:00Z",
    status: "completed",
    totalFlightTime: 900,
    maxAltitude: 85.5,
    totalDistance: 2450,
    videoFilePath: "/recordings/flight_001.mp4",
    logFilePath: "/logs/flight_001.csv",
    model3dFilePath: null,
  },
  {
    id: 2,
    missionId: 2,
    startTime: "2024-01-14T14:20:00Z",
    endTime: "2024-01-14T14:35:00Z",
    status: "completed",
    totalFlightTime: 850,
    maxAltitude: 65.2,
    totalDistance: 1820,
    videoFilePath: "/recordings/flight_002.mp4",
    logFilePath: "/logs/flight_002.csv",
    model3dFilePath: "/models/site_002.obj",
  },
];

const mockSystemLogs: SystemLog[] = [
  { id: "1", timestamp: new Date().toISOString(), level: "success", source: "FlightController", message: "Mission completed successfully" },
  { id: "2", timestamp: new Date(Date.now() - 5000).toISOString(), level: "info", source: "Navigation", message: "Returned to home position" },
  { id: "3", timestamp: new Date(Date.now() - 30000).toISOString(), level: "warning", source: "Battery", message: "Battery at 25% - initiating RTL" },
  { id: "4", timestamp: new Date(Date.now() - 120000).toISOString(), level: "info", source: "Waypoint", message: "Reached waypoint 3" },
  { id: "5", timestamp: new Date(Date.now() - 240000).toISOString(), level: "info", source: "Camera", message: "Photo captured at WP2" },
  { id: "6", timestamp: new Date(Date.now() - 360000).toISOString(), level: "info", source: "Waypoint", message: "Reached waypoint 2" },
  { id: "7", timestamp: new Date(Date.now() - 420000).toISOString(), level: "debug", source: "Gimbal", message: "Gimbal stabilization active" },
  { id: "8", timestamp: new Date(Date.now() - 480000).toISOString(), level: "info", source: "Waypoint", message: "Reached waypoint 1" },
  { id: "9", timestamp: new Date(Date.now() - 600000).toISOString(), level: "info", source: "FlightController", message: "Takeoff complete - altitude 50m" },
  { id: "10", timestamp: new Date(Date.now() - 660000).toISOString(), level: "info", source: "FlightController", message: "Motors armed - preparing for takeoff" },
  { id: "11", timestamp: new Date(Date.now() - 720000).toISOString(), level: "info", source: "System", message: "Mission 1 started" },
  { id: "12", timestamp: new Date(Date.now() - 900000).toISOString(), level: "error", source: "Compass", message: "Compass interference detected - recalibration required" },
];

const mockTelemetryData = [
  { time: "10:30:00", altitude: 0, speed: 0, battery: 100 },
  { time: "10:32:00", altitude: 50, speed: 5, battery: 98 },
  { time: "10:35:00", altitude: 55, speed: 8, battery: 92 },
  { time: "10:38:00", altitude: 60, speed: 10, battery: 85 },
  { time: "10:40:00", altitude: 65, speed: 8, battery: 78 },
  { time: "10:42:00", altitude: 70, speed: 12, battery: 65 },
  { time: "10:44:00", altitude: 50, speed: 6, battery: 45 },
  { time: "10:45:00", altitude: 0, speed: 0, battery: 25 },
];

export function FlightLogsPanel() {
  const [selectedSession, setSelectedSession] = useState<FlightSession | null>(null);
  const [logFilter, setLogFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("sessions");
  const [is3DGenerating, setIs3DGenerating] = useState(false);
  const [show3DDialog, setShow3DDialog] = useState(false);

  const filteredLogs = mockSystemLogs.filter(log => {
    const matchesFilter = logFilter === "all" || log.level === logFilter;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          log.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleExportLogs = () => {
    toast.success("Flight logs exported to CSV");
  };

  const handleGenerate3DModel = async () => {
    setIs3DGenerating(true);
    toast.info("Processing camera footage for 3D reconstruction...");
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    setIs3DGenerating(false);
    toast.success("3D model generation complete!");
    setShow3DDialog(false);
  };

  const handleExport3DModel = (session: FlightSession) => {
    if (session.model3dFilePath) {
      toast.success("Downloading 3D model...");
    } else {
      setShow3DDialog(true);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDistance = (meters: number | null) => {
    if (!meters) return "N/A";
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-500 bg-red-500/10';
      case 'warn': 
      case 'warning': return 'text-amber-500 bg-amber-500/10';
      case 'debug': return 'text-gray-500 bg-gray-500/10';
      case 'success': return 'text-emerald-500 bg-emerald-500/10';
      default: return 'text-primary bg-primary/10';
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error': return <XCircle className="h-3 w-3" />;
      case 'warn':
      case 'warning': return <AlertTriangle className="h-3 w-3" />;
      case 'success': return <CheckCircle className="h-3 w-3" />;
      default: return <Activity className="h-3 w-3" />;
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left Panel - Session List */}
      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h3 className="font-bold font-sans text-sm mb-2">Flight Records</h3>
          <p className="text-xs text-muted-foreground">Comprehensive flight logging</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-3 mt-2 grid w-auto grid-cols-2">
            <TabsTrigger value="sessions" className="text-xs">Sessions</TabsTrigger>
            <TabsTrigger value="system" className="text-xs">System Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {mockFlightSessions.map((session) => (
                  <Card
                    key={session.id}
                    className={`cursor-pointer transition-colors ${
                      selectedSession?.id === session.id 
                        ? "border-primary bg-primary/10" 
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedSession(session)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Plane className="h-4 w-4 text-primary" />
                            <span className="font-mono text-sm">Flight #{session.id}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {format(new Date(session.startTime), "MMM dd, yyyy HH:mm")}
                          </div>
                        </div>
                        <Badge variant={session.status === 'completed' ? 'default' : 'outline'} className="text-[10px]">
                          {session.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                        <div className="text-center p-1 bg-muted/50 rounded">
                          <div className="text-muted-foreground">Duration</div>
                          <div className="font-mono">{formatDuration(session.totalFlightTime)}</div>
                        </div>
                        <div className="text-center p-1 bg-muted/50 rounded">
                          <div className="text-muted-foreground">Max Alt</div>
                          <div className="font-mono">{session.maxAltitude?.toFixed(0) || "N/A"}m</div>
                        </div>
                        <div className="text-center p-1 bg-muted/50 rounded">
                          <div className="text-muted-foreground">Distance</div>
                          <div className="font-mono">{formatDistance(session.totalDistance)}</div>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {session.videoFilePath && <Badge variant="outline" className="text-[10px]"><Video className="h-2 w-2 mr-1" />Video</Badge>}
                        {session.logFilePath && <Badge variant="outline" className="text-[10px]"><FileText className="h-2 w-2 mr-1" />Log</Badge>}
                        {session.model3dFilePath && <Badge variant="outline" className="text-[10px]"><Box className="h-2 w-2 mr-1" />3D</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="system" className="flex-1 flex flex-col mt-0 overflow-hidden">
            <div className="p-2 space-y-2 border-b border-border">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                <Select value={logFilter} onValueChange={setLogFilter}>
                  <SelectTrigger className="w-20 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warn</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="p-2 bg-muted/30 rounded text-xs border border-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-[9px] px-1 py-0 flex items-center gap-1 ${getLevelColor(log.level)}`}>
                        {getLevelIcon(log.level)}
                        {log.level.toUpperCase()}
                      </Badge>
                      <span className="text-muted-foreground font-mono">[{log.source}]</span>
                      <span className="text-muted-foreground ml-auto font-mono text-[10px]">
                        {format(new Date(log.timestamp), "HH:mm:ss")}
                      </span>
                    </div>
                    <div className="font-mono text-foreground">{log.message}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-2 border-t border-border">
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleExportLogs}>
                <Download className="h-3 w-3 mr-2" />
                Export Logs
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Right Panel - Session Details */}
      <div className="flex-1 overflow-hidden">
        {selectedSession ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border bg-card/80 backdrop-blur shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold font-sans flex items-center gap-2">
                    <Plane className="h-5 w-5 text-primary" />
                    Flight #{selectedSession.id} Details
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedSession.startTime), "MMMM dd, yyyy 'at' HH:mm")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleExport3DModel(selectedSession)}>
                    <Box className="h-4 w-4 mr-2" />
                    {selectedSession.model3dFilePath ? "Export 3D" : "Generate 3D"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportLogs}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Flight Summary */}
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Flight Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <Clock className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-xs text-muted-foreground">Duration</div>
                      <div className="font-mono font-bold">{formatDuration(selectedSession.totalFlightTime)}</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <Plane className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-xs text-muted-foreground">Max Altitude</div>
                      <div className="font-mono font-bold">{selectedSession.maxAltitude?.toFixed(1) || "N/A"}m</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <MapPin className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-xs text-muted-foreground">Distance</div>
                      <div className="font-mono font-bold">{formatDistance(selectedSession.totalDistance)}</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <FileText className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-xs text-muted-foreground">Mission</div>
                      <div className="font-mono font-bold">#{selectedSession.missionId || "N/A"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Telemetry Graph */}
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Telemetry History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="h-40 bg-muted/30 rounded-lg p-4 relative">
                    <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-2 text-[10px] text-muted-foreground">
                      <span>100</span>
                      <span>50</span>
                      <span>0</span>
                    </div>
                    <div className="ml-8 h-full flex items-end gap-1">
                      {mockTelemetryData.map((data, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                          <div 
                            className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary" 
                            style={{ height: `${data.altitude}%` }}
                            title={`Alt: ${data.altitude}m`}
                          />
                          <span className="text-[8px] text-muted-foreground">{data.time.split(':').slice(1).join(':')}</span>
                        </div>
                      ))}
                    </div>
                    <div className="absolute right-2 top-2 text-xs bg-background/80 px-2 py-1 rounded">
                      <span className="text-primary">Altitude (m)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recorded Data */}
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Recorded Data
                  </CardTitle>
                  <CardDescription>Data captured during flight</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  {selectedSession.videoFilePath && (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Video className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-mono text-sm">Flight Video</div>
                          <div className="text-xs text-muted-foreground">{selectedSession.videoFilePath}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Play className="h-4 w-4 mr-2" />
                        Play
                      </Button>
                    </div>
                  )}
                  
                  {selectedSession.logFilePath && (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-mono text-sm">Telemetry Log</div>
                          <div className="text-xs text-muted-foreground">{selectedSession.logFilePath}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  )}
                  
                  {selectedSession.model3dFilePath ? (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Box className="h-5 w-5 text-primary" />
                        <div>
                          <div className="font-mono text-sm">3D Model</div>
                          <div className="text-xs text-muted-foreground">{selectedSession.model3dFilePath}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export OBJ
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-dashed border-border">
                      <div className="flex items-center gap-3">
                        <Box className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-mono text-sm text-muted-foreground">3D Model</div>
                          <div className="text-xs text-muted-foreground">Not yet generated</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setShow3DDialog(true)}>
                        Generate
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* What Gets Recorded */}
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm">Data Captured While Airborne</CardTitle>
                  <CardDescription>Everything recorded during flight operations</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[
                      { icon: Plane, label: "Altitude, speed, heading" },
                      { icon: MapPin, label: "GPS coordinates, flight path" },
                      { icon: Activity, label: "Pitch, roll, yaw (attitude)" },
                      { icon: Clock, label: "Timestamps for all events" },
                      { icon: AlertTriangle, label: "Commands issued to drone" },
                      { icon: Video, label: "Video footage (if recording)" },
                      { icon: Image, label: "Photos captured at waypoints" },
                      { icon: Box, label: "3D mapping data (if enabled)" },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                        <item.icon className="h-4 w-4 text-primary" />
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Plane className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a flight session to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* 3D Model Generation Dialog */}
      <Dialog open={show3DDialog} onOpenChange={setShow3DDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              Generate 3D Model
            </DialogTitle>
            <DialogDescription>
              Create a 3D reconstruction from camera footage using photogrammetry.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">How it works:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>1. Photos from the flight are analyzed</li>
                <li>2. OpenDroneMap processes the imagery</li>
                <li>3. A 3D model is generated (OBJ/PLY format)</li>
                <li>4. Georeferenced data is included</li>
              </ul>
            </div>
            
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
              <p className="text-sm">
                <strong>Note:</strong> 3D model generation requires adequate photo coverage 
                and may take several minutes depending on the number of images.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShow3DDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate3DModel} disabled={is3DGenerating}>
              {is3DGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Box className="h-4 w-4 mr-2" />
                  Generate Model
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
