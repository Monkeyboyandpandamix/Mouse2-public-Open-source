import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Download, 
  Search, 
  Play, 
  FileText, 
  Activity, 
  MapPin, 
  Clock, 
  Plane, 
  AlertTriangle,
  Video,
  HardDrive,
  Box,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Lock,
  ArrowUp,
  Gauge,
  Compass,
  Battery,
  Thermometer,
  Waves,
  Wind,
  Navigation,
  X,
  ExternalLink
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";
import { flightSessionsApi } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapErrorBoundary } from "@/components/map/MapErrorBoundary";
import { useNoFlyZones } from "@/hooks/useNoFlyZones";
import { NoFlyZoneOverlay } from "@/components/map/NoFlyZoneOverlay";
import { NoFlyZoneLegend } from "@/components/map/NoFlyZoneLegend";
import { reportApiError } from "@/lib/apiErrors";

interface FlightSession {
  id: string;
  droneId: string | null;
  missionId: string | null;
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

interface FlightLog {
  id: string;
  sessionId: string | null;
  missionId: string | null;
  droneId: string | null;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  relativeAltitude: number | null;
  heading: number | null;
  groundSpeed: number | null;
  verticalSpeed: number | null;
  airSpeed: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  batteryPercent: number | null;
  batteryTemp: number | null;
  gpsFixType: number | null;
  gpsSatellites: number | null;
  gpsHdop: number | null;
  flightMode: string | null;
  armed: boolean;
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
  motor1Rpm: number | null;
  motor2Rpm: number | null;
  motor3Rpm: number | null;
  motor4Rpm: number | null;
  motor1Current: number | null;
  motor2Current: number | null;
  motor3Current: number | null;
  motor4Current: number | null;
  cpuTemp: number | null;
  vibrationX: number | null;
  vibrationY: number | null;
  vibrationZ: number | null;
  distanceFromHome: number | null;
  windSpeed: number | null;
  windDirection: number | null;
}

interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success' | 'warning';
  source: string;
  message: string;
}

type DataViewType = 'altitude' | 'speed' | 'heading' | 'battery' | 'motors' | 'vibration' | 'gps' | 'wind' | null;

const startMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const endMarkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export function FlightLogsPanel() {
  const { hasPermission } = usePermissions();
  const canDeleteRecords = hasPermission('delete_records');
  const canAccessFlightRecorder = hasPermission('access_flight_recorder');
  const queryClient = useQueryClient();
  
  const [selectedSession, setSelectedSession] = useState<FlightSession | null>(null);
  const [logFilter, setLogFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("sessions");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [dataViewDialog, setDataViewDialog] = useState<DataViewType>(null);
  const [videoDialog, setVideoDialog] = useState(false);
  const [mapDialog, setMapDialog] = useState(false);
  const [fcConnectionString, setFcConnectionString] = useState(() => {
    const saved = localStorage.getItem("mouse_selected_drone");
    try {
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed?.connectionString || "serial:/dev/ttyACM0:57600";
    } catch {
      return "serial:/dev/ttyACM0:57600";
    }
  });
  const [dataflashBusy, setDataflashBusy] = useState(false);
  const [dataflashLogs, setDataflashLogs] = useState<Array<{ id: number; size: number; timeUtc: number }>>([]);
  const [selectedDataflashFile, setSelectedDataflashFile] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [replayResult, setReplayResult] = useState<any | null>(null);
  const [geotagImagesDir, setGeotagImagesDir] = useState("");
  const [geotagLogFile, setGeotagLogFile] = useState("");
  const [geotagMatchMode, setGeotagMatchMode] = useState<"proportional" | "time_offset">("proportional");
  const [geotagTimeOffsetSec, setGeotagTimeOffsetSec] = useState("0");
  const [geotagBusy, setGeotagBusy] = useState(false);
  const [geotagReport, setGeotagReport] = useState<any | null>(null);
  const noFlyZones = useNoFlyZones();

  const { data: flightSessions = [], isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<FlightSession[]>({
    queryKey: ['/api/flight-sessions'],
    queryFn: () => flightSessionsApi.list() as Promise<FlightSession[]>,
    refetchInterval: 30000,
  });

  const { data: sessionLogs = [], isLoading: logsLoading } = useQuery<FlightLog[]>({
    queryKey: ['/api/flight-sessions', selectedSession?.id, 'logs'],
    queryFn: async () => {
      if (!selectedSession?.id) return [];
      const res = await fetch(`/api/flight-sessions/${selectedSession.id}/logs`);
      return res.json();
    },
    enabled: !!selectedSession?.id,
  });

  const { data: recentLogs = [] } = useQuery<FlightLog[]>({
    queryKey: ['/api/flight-logs/recent'],
    queryFn: async () => {
      const res = await fetch('/api/flight-logs/recent?limit=100');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => flightSessionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flight-sessions'] });
      if (selectedSession?.id === deleteConfirmId) {
        setSelectedSession(null);
      }
      setDeleteConfirmId(null);
      toast.success("Flight record deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete flight record");
    }
  });

  const systemLogs: SystemLog[] = useMemo(() => {
    return recentLogs.slice(0, 50).map((log, idx) => ({
      id: log.id || `log-${idx}`,
      timestamp: log.timestamp,
      level: log.armed ? 'success' : 'info',
      source: log.flightMode || 'Telemetry',
      message: `Alt: ${log.altitude?.toFixed(1) || 0}m, Speed: ${log.groundSpeed?.toFixed(1) || 0}m/s, Bat: ${log.batteryPercent || 0}%`
    }));
  }, [recentLogs]);

  const filteredLogs = useMemo(() => {
    return systemLogs.filter(log => {
      const matchesFilter = logFilter === "all" || log.level === logFilter;
      const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            log.source.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [systemLogs, logFilter, searchQuery]);

  const chartData = useMemo(() => {
    return sessionLogs.map((log, idx) => ({
      time: format(new Date(log.timestamp), 'HH:mm:ss'),
      altitude: log.altitude || 0,
      relativeAltitude: log.relativeAltitude || 0,
      groundSpeed: log.groundSpeed || 0,
      airSpeed: log.airSpeed || 0,
      verticalSpeed: log.verticalSpeed || 0,
      heading: log.heading || 0,
      batteryPercent: log.batteryPercent || 0,
      batteryVoltage: log.batteryVoltage || 0,
      batteryCurrent: log.batteryCurrent || 0,
      batteryTemp: log.batteryTemp || 0,
      motor1Rpm: log.motor1Rpm || 0,
      motor2Rpm: log.motor2Rpm || 0,
      motor3Rpm: log.motor3Rpm || 0,
      motor4Rpm: log.motor4Rpm || 0,
      motor1Current: log.motor1Current || 0,
      motor2Current: log.motor2Current || 0,
      motor3Current: log.motor3Current || 0,
      motor4Current: log.motor4Current || 0,
      vibrationX: log.vibrationX || 0,
      vibrationY: log.vibrationY || 0,
      vibrationZ: log.vibrationZ || 0,
      windSpeed: log.windSpeed || 0,
      windDirection: log.windDirection || 0,
      latitude: log.latitude,
      longitude: log.longitude,
      gpsHdop: log.gpsHdop || 0,
      gpsSatellites: log.gpsSatellites || 0,
    }));
  }, [sessionLogs]);

  const loadDataflashLogs = async () => {
    setDataflashBusy(true);
    try {
      const res = await fetch(`/api/mavlink/dataflash/list?connectionString=${encodeURIComponent(fcConnectionString)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to list DataFlash logs");
      const logs = Array.isArray(data.logs) ? data.logs.map((x: any) => ({ id: Number(x.id), size: Number(x.size), timeUtc: Number(x.timeUtc || 0) })) : [];
      setDataflashLogs(logs);
      toast.success(`Found ${logs.length} DataFlash logs`);
    } catch (e: any) {
      reportApiError(e, "Failed to list DataFlash logs");
    } finally {
      setDataflashBusy(false);
    }
  };

  const downloadDataflashLog = async (logId: number) => {
    setDataflashBusy(true);
    try {
      const res = await fetch("/api/mavlink/dataflash/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: fcConnectionString, logId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to download DataFlash log");
      setSelectedDataflashFile(data.filePath || null);
      setAnalysisResult(null);
      if (data.downloadUrl) {
        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = data.file || `log-${logId}.bin`;
        a.click();
      }
      toast.success(`Downloaded DataFlash log ${logId}`);
    } catch (e: any) {
      reportApiError(e, "Failed to download DataFlash log");
    } finally {
      setDataflashBusy(false);
    }
  };

  const analyzeDataflashLog = async () => {
    if (!selectedDataflashFile) {
      toast.error("Download a DataFlash file first");
      return;
    }
    setDataflashBusy(true);
    try {
      const res = await fetch("/api/mavlink/dataflash/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: selectedDataflashFile }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to analyze log");
      setAnalysisResult(data.analysis || null);
      toast.success("DataFlash analysis complete");
    } catch (e: any) {
      reportApiError(e, "Failed to analyze DataFlash log");
    } finally {
      setDataflashBusy(false);
    }
  };

  const loadDataflashReplay = async () => {
    if (!selectedDataflashFile) {
      toast.error("Select a downloaded DataFlash log first");
      return;
    }
    setDataflashBusy(true);
    try {
      const res = await fetch("/api/mavlink/dataflash/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: selectedDataflashFile }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to build replay");
      setReplayResult(data.replay || null);
      toast.success("DataFlash replay generated");
    } catch (e: any) {
      reportApiError(e, "Failed to build replay");
    } finally {
      setDataflashBusy(false);
    }
  };

  const runGeotagPipeline = async (writeExif: boolean) => {
    if (!geotagImagesDir.trim()) {
      toast.error("Images directory is required");
      return;
    }
    const logFile = geotagLogFile.trim() || selectedDataflashFile || "";
    if (!logFile) {
      toast.error("DataFlash log file is required");
      return;
    }
    setGeotagBusy(true);
    try {
      const res = await fetch("/api/mavlink/geotag/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagesDir: geotagImagesDir.trim(),
          logFile,
          writeExif,
          matchMode: geotagMatchMode,
          timeOffsetSec: Number(geotagTimeOffsetSec || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Geotag pipeline failed");
      setGeotagReport(data.report || null);
      toast.success(writeExif ? "Geotag + EXIF write complete" : "Geotag analysis complete");
    } catch (e: any) {
      reportApiError(e, "Geotag pipeline failed");
    } finally {
      setGeotagBusy(false);
    }
  };

  const flightPath = useMemo(() => {
    return sessionLogs
      .filter(log => log.latitude && log.longitude)
      .map(log => [log.latitude!, log.longitude!] as [number, number]);
  }, [sessionLogs]);

  const mapCenter = useMemo(() => {
    if (flightPath.length > 0) {
      const lats = flightPath.map(p => p[0]);
      const lngs = flightPath.map(p => p[1]);
      return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2] as [number, number];
    }
    return [0, 0] as [number, number];
  }, [flightPath]);

  const handleExportCSV = () => {
    if (!selectedSession || sessionLogs.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      'Timestamp', 'Latitude', 'Longitude', 'Altitude', 'Relative Altitude',
      'Heading', 'Ground Speed', 'Air Speed', 'Vertical Speed',
      'Battery %', 'Battery Voltage', 'Battery Current', 'Battery Temp',
      'GPS Fix', 'GPS Satellites', 'GPS HDOP', 'Flight Mode', 'Armed',
      'Pitch', 'Roll', 'Yaw',
      'Motor 1 RPM', 'Motor 2 RPM', 'Motor 3 RPM', 'Motor 4 RPM',
      'Motor 1 Current', 'Motor 2 Current', 'Motor 3 Current', 'Motor 4 Current',
      'CPU Temp', 'Vibration X', 'Vibration Y', 'Vibration Z',
      'Distance From Home', 'Wind Speed', 'Wind Direction'
    ];

    const rows = sessionLogs.map(log => [
      log.timestamp,
      log.latitude || '',
      log.longitude || '',
      log.altitude || '',
      log.relativeAltitude || '',
      log.heading || '',
      log.groundSpeed || '',
      log.airSpeed || '',
      log.verticalSpeed || '',
      log.batteryPercent || '',
      log.batteryVoltage || '',
      log.batteryCurrent || '',
      log.batteryTemp || '',
      log.gpsFixType || '',
      log.gpsSatellites || '',
      log.gpsHdop || '',
      log.flightMode || '',
      log.armed ? 'Yes' : 'No',
      log.pitch || '',
      log.roll || '',
      log.yaw || '',
      log.motor1Rpm || '',
      log.motor2Rpm || '',
      log.motor3Rpm || '',
      log.motor4Rpm || '',
      log.motor1Current || '',
      log.motor2Current || '',
      log.motor3Current || '',
      log.motor4Current || '',
      log.cpuTemp || '',
      log.vibrationX || '',
      log.vibrationY || '',
      log.vibrationZ || '',
      log.distanceFromHome || '',
      log.windSpeed || '',
      log.windDirection || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flight_${selectedSession.id}_${format(new Date(selectedSession.startTime), 'yyyy-MM-dd_HH-mm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Flight data exported to CSV");
  };

  const handleExportSystemLogs = () => {
    const headers = ['Timestamp', 'Level', 'Source', 'Message'];
    const rows = filteredLogs.map(log => [
      log.timestamp,
      log.level,
      log.source,
      `"${log.message.replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system_logs_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("System logs exported to CSV");
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
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

  const renderDataViewChart = () => {
    if (!dataViewDialog || chartData.length === 0) return null;

    const chartConfig: Record<DataViewType & string, { title: string; lines: { key: string; color: string; name: string }[] }> = {
      altitude: {
        title: "Altitude Over Time",
        lines: [
          { key: 'altitude', color: '#3b82f6', name: 'Altitude (m)' },
          { key: 'relativeAltitude', color: '#10b981', name: 'Relative Alt (m)' }
        ]
      },
      speed: {
        title: "Speed Over Time",
        lines: [
          { key: 'groundSpeed', color: '#3b82f6', name: 'Ground Speed (m/s)' },
          { key: 'airSpeed', color: '#10b981', name: 'Air Speed (m/s)' },
          { key: 'verticalSpeed', color: '#f59e0b', name: 'Vertical Speed (m/s)' }
        ]
      },
      heading: {
        title: "Heading Over Time",
        lines: [
          { key: 'heading', color: '#3b82f6', name: 'Heading (°)' }
        ]
      },
      battery: {
        title: "Battery Status Over Time",
        lines: [
          { key: 'batteryPercent', color: '#10b981', name: 'Battery %' },
          { key: 'batteryVoltage', color: '#3b82f6', name: 'Voltage (V)' },
          { key: 'batteryCurrent', color: '#f59e0b', name: 'Current (A)' },
          { key: 'batteryTemp', color: '#ef4444', name: 'Temp (°C)' }
        ]
      },
      motors: {
        title: "Motor Performance",
        lines: [
          { key: 'motor1Rpm', color: '#3b82f6', name: 'Motor 1 RPM' },
          { key: 'motor2Rpm', color: '#10b981', name: 'Motor 2 RPM' },
          { key: 'motor3Rpm', color: '#f59e0b', name: 'Motor 3 RPM' },
          { key: 'motor4Rpm', color: '#ef4444', name: 'Motor 4 RPM' }
        ]
      },
      vibration: {
        title: "Vibration Analysis",
        lines: [
          { key: 'vibrationX', color: '#3b82f6', name: 'Vibration X' },
          { key: 'vibrationY', color: '#10b981', name: 'Vibration Y' },
          { key: 'vibrationZ', color: '#f59e0b', name: 'Vibration Z' }
        ]
      },
      gps: {
        title: "GPS Quality",
        lines: [
          { key: 'gpsSatellites', color: '#3b82f6', name: 'Satellites' },
          { key: 'gpsHdop', color: '#10b981', name: 'HDOP' }
        ]
      },
      wind: {
        title: "Wind Conditions",
        lines: [
          { key: 'windSpeed', color: '#3b82f6', name: 'Wind Speed (m/s)' },
          { key: 'windDirection', color: '#10b981', name: 'Wind Direction (°)' }
        ]
      }
    };

    const config = chartConfig[dataViewDialog];
    if (!config) return null;

    return (
      <Dialog open={!!dataViewDialog} onOpenChange={() => setDataViewDialog(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {config.title}
            </DialogTitle>
            <DialogDescription>
              Flight #{selectedSession?.id} - {selectedSession && format(new Date(selectedSession.startTime), 'MMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend />
                {config.lines.map(line => (
                  <Line 
                    key={line.key}
                    type="monotone" 
                    dataKey={line.key} 
                    stroke={line.color} 
                    name={line.name}
                    dot={false}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {config.lines.map(line => {
              const values = chartData.map(d => d[line.key as keyof typeof d] as number).filter(v => v !== 0);
              const min = values.length ? Math.min(...values) : 0;
              const max = values.length ? Math.max(...values) : 0;
              const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
              return (
                <div key={line.key} className="p-3 bg-muted/50 rounded-lg text-center">
                  <div className="text-xs text-muted-foreground">{line.name}</div>
                  <div className="grid grid-cols-3 gap-1 mt-1 text-[10px]">
                    <div>
                      <div className="text-muted-foreground">Min</div>
                      <div className="font-mono">{min.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg</div>
                      <div className="font-mono">{avg.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Max</div>
                      <div className="font-mono">{max.toFixed(1)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderMapDialog = () => {
    if (!mapDialog || flightPath.length === 0) return null;

    return (
      <Dialog open={mapDialog} onOpenChange={setMapDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Flight Path Map
            </DialogTitle>
            <DialogDescription>
              Flight #{selectedSession?.id} - {selectedSession && format(new Date(selectedSession.startTime), 'MMM dd, yyyy HH:mm')}
              {selectedSession?.endTime && ` to ${format(new Date(selectedSession.endTime), 'HH:mm')}`}
            </DialogDescription>
          </DialogHeader>
          <div className="h-96 rounded-lg overflow-hidden border relative">
            <MapErrorBoundary>
            <MapContainer
              center={mapCenter}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap'
              />
              <NoFlyZoneOverlay zones={noFlyZones} />
              <Polyline 
                positions={flightPath} 
                color="#3b82f6" 
                weight={3}
                opacity={0.8}
              />
              {flightPath.length > 0 && (
                <>
                  <Marker position={flightPath[0]} icon={startMarkerIcon}>
                    <Popup>
                      <strong>Start</strong><br/>
                      {selectedSession && format(new Date(selectedSession.startTime), 'HH:mm:ss')}
                    </Popup>
                  </Marker>
                  <Marker position={flightPath[flightPath.length - 1]} icon={endMarkerIcon}>
                    <Popup>
                      <strong>End</strong><br/>
                      {selectedSession?.endTime && format(new Date(selectedSession.endTime), 'HH:mm:ss')}
                    </Popup>
                  </Marker>
                </>
              )}
            </MapContainer>
            </MapErrorBoundary>
            <NoFlyZoneLegend className="absolute bottom-2 left-2 z-[400]" />
          </div>
          <div className="grid grid-cols-4 gap-4 mt-2">
            <div className="p-2 bg-muted/50 rounded text-center">
              <div className="text-xs text-muted-foreground">Total Distance</div>
              <div className="font-mono font-bold">{formatDistance(selectedSession?.totalDistance ?? null)}</div>
            </div>
            <div className="p-2 bg-muted/50 rounded text-center">
              <div className="text-xs text-muted-foreground">Max Altitude</div>
              <div className="font-mono font-bold">{selectedSession?.maxAltitude?.toFixed(1) || 'N/A'}m</div>
            </div>
            <div className="p-2 bg-muted/50 rounded text-center">
              <div className="text-xs text-muted-foreground">Duration</div>
              <div className="font-mono font-bold">{formatDuration(selectedSession?.totalFlightTime ?? null)}</div>
            </div>
            <div className="p-2 bg-muted/50 rounded text-center">
              <div className="text-xs text-muted-foreground">GPS Points</div>
              <div className="font-mono font-bold">{flightPath.length}</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const renderVideoDialog = () => {
    if (!videoDialog || !selectedSession?.videoFilePath) return null;

    return (
      <Dialog open={videoDialog} onOpenChange={setVideoDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Flight Video
            </DialogTitle>
            <DialogDescription>
              Flight #{selectedSession?.id} - {selectedSession && format(new Date(selectedSession.startTime), 'MMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>
          <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
            {selectedSession.videoFilePath.includes('drive.google.com') ? (
              <iframe
                src={selectedSession.videoFilePath.replace('/view', '/preview')}
                className="w-full h-full"
                allowFullScreen
              />
            ) : (
              <video
                src={selectedSession.videoFilePath}
                controls
                className="w-full h-full"
              />
            )}
          </div>
          <div className="flex justify-between items-center mt-2">
            <div className="text-sm text-muted-foreground">
              Source: {selectedSession.videoFilePath.includes('drive.google.com') ? 'Google Drive' : 'Local Storage'}
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={selectedSession.videoFilePath} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  if (!canAccessFlightRecorder) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access flight logs.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {renderDataViewChart()}
      {renderMapDialog()}
      {renderVideoDialog()}

      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="font-bold font-sans text-sm mb-1">Flight Records</h3>
            <p className="text-xs text-muted-foreground">Comprehensive flight logging</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetchSessions()} data-testid="button-refresh-sessions">
            <RefreshCw className={`h-4 w-4 ${sessionsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-3 mt-2 grid w-auto grid-cols-2">
            <TabsTrigger value="sessions" className="text-xs">Sessions ({flightSessions.length})</TabsTrigger>
            <TabsTrigger value="system" className="text-xs">System Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="flex-1 mt-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {sessionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : flightSessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No flight sessions recorded yet
                  </div>
                ) : (
                  flightSessions.map((session) => (
                    <Card
                      key={session.id}
                      className={`cursor-pointer transition-colors ${
                        selectedSession?.id === session.id 
                          ? "border-primary bg-primary/10" 
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedSession(session)}
                      data-testid={`card-flight-${session.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Plane className="h-4 w-4 text-primary" />
                              <span className="font-mono text-sm">Flight #{session.id.slice(-6)}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(session.startTime), "MMM dd, yyyy HH:mm")}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant={session.status === 'completed' ? 'default' : session.status === 'active' ? 'destructive' : 'outline'} className="text-[10px]">
                              {session.status}
                            </Badge>
                            {canDeleteRecords && (
                              deleteConfirmId === session.id ? (
                                <div className="flex gap-1">
                                  <Button 
                                    size="icon" 
                                    variant="destructive" 
                                    className="h-5 w-5"
                                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(session.id); }}
                                    data-testid={`button-confirm-delete-${session.id}`}
                                  >
                                    <CheckCircle className="h-3 w-3" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className="h-5 w-5"
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                    data-testid={`button-cancel-delete-${session.id}`}
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-5 w-5 text-muted-foreground hover:text-red-500"
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(session.id); }}
                                  data-testid={`button-delete-flight-${session.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )
                            )}
                          </div>
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
                  ))
                )}
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
                    data-testid="input-search-logs"
                  />
                </div>
                <Select value={logFilter} onValueChange={setLogFilter}>
                  <SelectTrigger className="w-20 h-8 text-xs" data-testid="select-log-filter">
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
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleExportSystemLogs} data-testid="button-export-system-logs">
                <Download className="h-3 w-3 mr-2" />
                Export Logs
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedSession ? (
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border bg-card/80 backdrop-blur shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold font-sans flex items-center gap-2">
                    <Plane className="h-5 w-5 text-primary" />
                    Flight #{selectedSession.id.slice(-6)} Details
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedSession.startTime), "MMMM dd, yyyy 'at' HH:mm")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCSV} data-testid="button-export-csv">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                      <div className="text-xs text-muted-foreground">Data Points</div>
                      <div className="font-mono font-bold">{sessionLogs.length}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Recorded Data
                  </CardTitle>
                  <CardDescription>Click on any data type to view detailed charts</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('altitude')}
                    data-testid="button-view-altitude"
                  >
                    <ArrowUp className="h-5 w-5 text-blue-500" />
                    <span className="text-xs">Altitude</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('speed')}
                    data-testid="button-view-speed"
                  >
                    <Gauge className="h-5 w-5 text-green-500" />
                    <span className="text-xs">Speed</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('heading')}
                    data-testid="button-view-heading"
                  >
                    <Compass className="h-5 w-5 text-purple-500" />
                    <span className="text-xs">Heading</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('battery')}
                    data-testid="button-view-battery"
                  >
                    <Battery className="h-5 w-5 text-yellow-500" />
                    <span className="text-xs">Battery</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('motors')}
                    data-testid="button-view-motors"
                  >
                    <RefreshCw className="h-5 w-5 text-orange-500" />
                    <span className="text-xs">Motors</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('vibration')}
                    data-testid="button-view-vibration"
                  >
                    <Waves className="h-5 w-5 text-red-500" />
                    <span className="text-xs">Vibration</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('gps')}
                    data-testid="button-view-gps"
                  >
                    <Navigation className="h-5 w-5 text-cyan-500" />
                    <span className="text-xs">GPS Quality</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto py-3 flex flex-col gap-1"
                    onClick={() => setDataViewDialog('wind')}
                    data-testid="button-view-wind"
                  >
                    <Wind className="h-5 w-5 text-teal-500" />
                    <span className="text-xs">Wind</span>
                    <span className="text-[10px] text-muted-foreground">{chartData.length} points</span>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Flight Path & Media
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setMapDialog(true)}
                    disabled={flightPath.length === 0}
                    data-testid="button-view-map"
                  >
                    <MapPin className="h-5 w-5 mr-3 text-primary" />
                    <div className="text-left">
                      <div className="font-mono text-sm">View Flight Path Map</div>
                      <div className="text-xs text-muted-foreground">
                        {flightPath.length > 0 ? `${flightPath.length} GPS coordinates recorded` : 'No GPS data available'}
                      </div>
                    </div>
                  </Button>

                  {selectedSession.videoFilePath && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setVideoDialog(true)}
                      data-testid="button-view-video"
                    >
                      <Video className="h-5 w-5 mr-3 text-primary" />
                      <div className="text-left">
                        <div className="font-mono text-sm">View Flight Video</div>
                        <div className="text-xs text-muted-foreground">
                          {selectedSession.videoFilePath.includes('drive.google.com') ? 'Stored on Google Drive' : 'Local storage'}
                        </div>
                      </div>
                      <Play className="h-4 w-4 ml-auto" />
                    </Button>
                  )}

                  {selectedSession.logFilePath && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={handleExportCSV}
                      data-testid="button-download-log"
                    >
                      <FileText className="h-5 w-5 mr-3 text-primary" />
                      <div className="text-left">
                        <div className="font-mono text-sm">Download Flight Log</div>
                        <div className="text-xs text-muted-foreground">CSV format with all telemetry data</div>
                      </div>
                      <Download className="h-4 w-4 ml-auto" />
                    </Button>
                  )}

                  {selectedSession.model3dFilePath && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      asChild
                      data-testid="button-view-3d"
                    >
                      <a href={selectedSession.model3dFilePath} target="_blank" rel="noopener noreferrer">
                        <Box className="h-5 w-5 mr-3 text-primary" />
                        <div className="text-left">
                          <div className="font-mono text-sm">View 3D Model</div>
                          <div className="text-xs text-muted-foreground">Photogrammetry reconstruction</div>
                        </div>
                        <ExternalLink className="h-4 w-4 ml-auto" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    DataFlash (.BIN) Tools
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <Input
                    value={fcConnectionString}
                    onChange={(e) => setFcConnectionString(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="serial:/dev/ttyACM0:57600"
                  />
                  <Button variant="outline" className="w-full justify-start" onClick={loadDataflashLogs} disabled={dataflashBusy}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${dataflashBusy ? "animate-spin" : ""}`} />
                    List DataFlash Logs from FC
                  </Button>
                  <div className="max-h-36 overflow-auto border rounded">
                    {dataflashLogs.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">No logs loaded</p>
                    ) : (
                      dataflashLogs.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => downloadDataflashLog(l.id)}
                          className="w-full text-left p-2 text-xs hover:bg-accent border-b last:border-b-0"
                        >
                          LOG #{l.id} - {(l.size / (1024 * 1024)).toFixed(2)} MB
                        </button>
                      ))
                    )}
                  </div>
                  <Button variant="secondary" className="w-full justify-start" onClick={analyzeDataflashLog} disabled={dataflashBusy || !selectedDataflashFile}>
                    <Activity className="h-4 w-4 mr-2" />
                    Analyze Downloaded BIN
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={loadDataflashReplay} disabled={dataflashBusy || !selectedDataflashFile}>
                    <MapPin className="h-4 w-4 mr-2" />
                    Build Replay Track
                  </Button>
                  {analysisResult && (
                    <div className="text-xs rounded border p-2 bg-muted/30 space-y-1">
                      <p>File: {analysisResult.file}</p>
                      <p>Size: {analysisResult.sizeMB} MB</p>
                      {analysisResult.durationSecApprox != null && <p>Duration (approx): {analysisResult.durationSecApprox}s</p>}
                      {analysisResult.messageCountSampled != null && <p>Messages sampled: {analysisResult.messageCountSampled}</p>}
                    </div>
                  )}
                  {replayResult && (
                    <div className="text-xs rounded border p-2 bg-muted/30 space-y-1">
                      <p>Replay points: {replayResult.summary?.pointCount ?? 0}</p>
                      <p>Duration (approx): {replayResult.summary?.durationSecApprox ?? "n/a"}s</p>
                      <pre className="max-h-28 overflow-auto">{JSON.stringify(replayResult.keyframes?.slice(0, 10) || [], null, 2)}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Navigation className="h-4 w-4" />
                    Camera Geotag Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <Input
                    value={geotagImagesDir}
                    onChange={(e) => setGeotagImagesDir(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="/path/to/images"
                  />
                  <Input
                    value={geotagLogFile}
                    onChange={(e) => setGeotagLogFile(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder={selectedDataflashFile || "/path/to/log.bin (optional if downloaded above)"}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={geotagMatchMode} onValueChange={(v) => setGeotagMatchMode(v as "proportional" | "time_offset")}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proportional">Proportional</SelectItem>
                        <SelectItem value="time_offset">Time Offset</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={geotagTimeOffsetSec}
                      onChange={(e) => setGeotagTimeOffsetSec(e.target.value)}
                      className="h-8 text-xs"
                      placeholder="offset sec"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="w-full justify-start" onClick={() => runGeotagPipeline(false)} disabled={geotagBusy}>
                      Analyze Geotag Match
                    </Button>
                    <Button variant="secondary" className="w-full justify-start" onClick={() => runGeotagPipeline(true)} disabled={geotagBusy}>
                      Write EXIF GPS
                    </Button>
                  </div>
                  {geotagReport && (
                    <div className="text-xs rounded border p-2 bg-muted/30 space-y-1">
                      <p>Source: {geotagReport.source}</p>
                      <p>Match: {geotagReport.matchMode || "proportional"}</p>
                      <p>Images: {geotagReport.imageCount}</p>
                      <p>Geotagged: {geotagReport.geotaggedCount}</p>
                      <p>EXIF written: {geotagReport.exifWrittenCount}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {chartData.length > 0 && (
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Quick Altitude Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 9 }} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="altitude" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Plane className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <h3 className="font-semibold text-lg">Select a Flight Session</h3>
              <p className="text-sm">Choose a session from the list to view detailed flight data</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
