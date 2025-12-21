import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Filter, RefreshCw, Trash2, FileText, Activity, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";

interface FlightLog {
  id: number;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  groundSpeed: number | null;
  batteryVoltage: number | null;
  batteryPercent: number | null;
  flightMode: string | null;
  armed: boolean;
}

interface SystemLog {
  id: number;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
}

export function FlightLogsPanel() {
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: flightLogs = [], refetch: refetchLogs, isLoading } = useQuery<FlightLog[]>({
    queryKey: ["/api/flight-logs/recent"],
  });

  // Mock system logs for demonstration - these would come from an API in production
  const systemLogs: SystemLog[] = [
    { id: 1, timestamp: new Date().toISOString(), level: 'success', source: 'System', message: 'Ground Control Station initialized successfully' },
    { id: 2, timestamp: new Date(Date.now() - 60000).toISOString(), level: 'info', source: 'GPS', message: 'GPS fix acquired - 12 satellites' },
    { id: 3, timestamp: new Date(Date.now() - 120000).toISOString(), level: 'info', source: 'Telemetry', message: 'Telemetry link established at 57600 baud' },
    { id: 4, timestamp: new Date(Date.now() - 180000).toISOString(), level: 'warning', source: 'Battery', message: 'Battery voltage dropping - 23.8V' },
    { id: 5, timestamp: new Date(Date.now() - 240000).toISOString(), level: 'info', source: 'LiDAR', message: 'LiDAR sensor calibrated - range 0.1-40m' },
    { id: 6, timestamp: new Date(Date.now() - 300000).toISOString(), level: 'success', source: 'Camera', message: 'Gimbal camera initialized - 1080p @ 30fps' },
    { id: 7, timestamp: new Date(Date.now() - 360000).toISOString(), level: 'info', source: 'IMU', message: 'IMU calibration complete' },
    { id: 8, timestamp: new Date(Date.now() - 420000).toISOString(), level: 'error', source: 'Compass', message: 'Compass interference detected - recalibration required' },
  ];

  const filteredSystemLogs = systemLogs.filter(log => {
    if (filterType !== "all" && log.level !== filterType) return false;
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'success': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Activity className="h-4 w-4 text-primary" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'success': return <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">SUCCESS</Badge>;
      case 'warning': return <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">WARNING</Badge>;
      case 'error': return <Badge className="bg-destructive/20 text-destructive border-destructive/30">ERROR</Badge>;
      default: return <Badge className="bg-primary/20 text-primary border-primary/30">INFO</Badge>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="p-6 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-sans">Flight Logs</h2>
            <p className="text-muted-foreground">Historical telemetry data and system events</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="system" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-6 mt-4 w-fit">
          <TabsTrigger value="system">
            <FileText className="h-4 w-4 mr-2" />
            System Logs
          </TabsTrigger>
          <TabsTrigger value="telemetry">
            <Activity className="h-4 w-4 mr-2" />
            Telemetry History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="flex-1 overflow-hidden px-6 pb-6">
          <ScrollArea className="h-full">
            <div className="space-y-2 pr-4">
              {filteredSystemLogs.map((log) => (
                <Card key={log.id} className="p-3">
                  <div className="flex items-start gap-3">
                    {getLevelIcon(log.level)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getLevelBadge(log.level)}
                        <Badge variant="outline" className="font-mono text-xs">{log.source}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.timestamp), "HH:mm:ss")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground font-mono">{log.message}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="telemetry" className="flex-1 overflow-hidden px-6 pb-6">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading telemetry data...</div>
            ) : flightLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Time</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Altitude</TableHead>
                    <TableHead>Speed</TableHead>
                    <TableHead>Heading</TableHead>
                    <TableHead>Battery</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Armed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flightLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(log.timestamp), "HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.latitude?.toFixed(6)}, {log.longitude?.toFixed(6)}
                      </TableCell>
                      <TableCell className="font-mono">{log.altitude?.toFixed(1)}m</TableCell>
                      <TableCell className="font-mono">{log.groundSpeed?.toFixed(1)} m/s</TableCell>
                      <TableCell className="font-mono">{log.heading?.toFixed(0)}°</TableCell>
                      <TableCell>
                        <span className="font-mono">{log.batteryVoltage?.toFixed(1)}V</span>
                        <span className="text-muted-foreground text-xs ml-1">({log.batteryPercent}%)</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{log.flightMode || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell>
                        {log.armed ? (
                          <Badge className="bg-destructive/20 text-destructive">ARMED</Badge>
                        ) : (
                          <Badge variant="outline">DISARMED</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No telemetry data recorded yet</p>
                <p className="text-sm">Telemetry will be logged once the drone is connected and flying</p>
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
