import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { 
  BookOpen, 
  Search, 
  Play, 
  Pause,
  SkipBack,
  SkipForward,
  Calendar, 
  Clock, 
  Plane, 
  MapPin,
  Activity,
  Download,
  Filter,
  Star,
  Tag,
  User,
  Cloud,
  Thermometer,
  Wind,
  Battery,
  Navigation,
  Target,
  AlertTriangle,
  CheckCircle,
  Edit,
  BarChart3,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  X,
  Save
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO, differenceInDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { usePermissions } from "@/hooks/usePermissions";
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FLIGHT_CATEGORIES } from "@shared/schema";
import { useNoFlyZones } from "@/hooks/useNoFlyZones";
import { NoFlyZoneOverlay } from "@/components/map/NoFlyZoneOverlay";
import { NoFlyZoneLegend } from "@/components/map/NoFlyZoneLegend";

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
  category: 'training' | 'survey' | 'inspection' | 'emergency' | 'delivery' | 'monitoring' | 'other' | null;
  missionName: string | null;
  pilotName: string | null;
  pilotId: string | null;
  notes: string | null;
  weatherConditions: string | null;
  windSpeedAvg: number | null;
  temperatureC: number | null;
  rating: number | null;
  tags: string[] | null;
  takeoffLocation: string | null;
  landingLocation: string | null;
  batteryStartPercent: number | null;
  batteryEndPercent: number | null;
  waypointsCompleted: number | null;
  waypointsTotal: number | null;
  incidentReport: string | null;
}

interface FlightLog {
  id: string;
  sessionId: string | null;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  heading: number | null;
  groundSpeed: number | null;
  batteryPercent: number | null;
  flightMode: string | null;
}

interface LogbookStats {
  totalFlights: number;
  totalFlightTime: number;
  totalDistance: number;
  avgFlightTime: number;
  avgAltitude: number;
  flightsByCategory: Record<string, number>;
  flightsThisMonth: number;
  flightsLastMonth: number;
}

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

const droneIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export function FlightLogbookPanel() {
  const { hasPermission } = usePermissions();
  const canAccessFlightRecorder = hasPermission('access_flight_recorder');
  const queryClient = useQueryClient();
  
  const [selectedSession, setSelectedSession] = useState<FlightSession | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("logbook");
  const [editDialog, setEditDialog] = useState(false);
  const [replayDialog, setReplayDialog] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const noFlyZones = useNoFlyZones();
  
  const [editForm, setEditForm] = useState({
    missionName: '',
    category: '',
    notes: '',
    weatherConditions: '',
    rating: 0,
    tags: '',
    incidentReport: ''
  });

  const { data: flightSessions = [], isLoading: sessionsLoading, refetch: refetchSessions } = useQuery<FlightSession[]>({
    queryKey: ['/api/flight-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/flight-sessions');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: sessionLogs = [], isLoading: logsLoading } = useQuery<FlightLog[]>({
    queryKey: ['/api/flight-sessions', selectedSession?.id, 'logs'],
    queryFn: async () => {
      if (!selectedSession?.id) return [];
      const res = await fetch(`/api/flight-sessions/${selectedSession.id}/logs`);
      return res.json();
    },
    enabled: !!selectedSession?.id && replayDialog,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<FlightSession> }) => {
      const res = await fetch(`/api/flight-sessions/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.updates),
      });
      if (!res.ok) throw new Error('Failed to update session');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/flight-sessions'] });
      setEditDialog(false);
      toast.success("Flight record updated successfully");
    },
    onError: () => {
      toast.error("Failed to update flight record");
    }
  });

  const stats: LogbookStats = useMemo(() => {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    
    const completedSessions = flightSessions.filter(s => s.status === 'completed');
    
    const totalFlightTime = completedSessions.reduce((sum, s) => sum + (s.totalFlightTime || 0), 0);
    const totalDistance = completedSessions.reduce((sum, s) => sum + (s.totalDistance || 0), 0);
    const totalAltitude = completedSessions.reduce((sum, s) => sum + (s.maxAltitude || 0), 0);
    
    const flightsByCategory: Record<string, number> = {};
    completedSessions.forEach(s => {
      const cat = s.category || 'other';
      flightsByCategory[cat] = (flightsByCategory[cat] || 0) + 1;
    });
    
    const flightsThisMonth = completedSessions.filter(s => 
      new Date(s.startTime) >= thisMonthStart
    ).length;
    
    const flightsLastMonth = completedSessions.filter(s => {
      const date = new Date(s.startTime);
      return date >= lastMonthStart && date <= lastMonthEnd;
    }).length;
    
    return {
      totalFlights: completedSessions.length,
      totalFlightTime,
      totalDistance,
      avgFlightTime: completedSessions.length > 0 ? totalFlightTime / completedSessions.length : 0,
      avgAltitude: completedSessions.length > 0 ? totalAltitude / completedSessions.length : 0,
      flightsByCategory,
      flightsThisMonth,
      flightsLastMonth,
    };
  }, [flightSessions]);

  const filteredSessions = useMemo(() => {
    return flightSessions.filter(session => {
      if (session.status !== 'completed') return false;
      
      const matchesSearch = searchQuery === '' || 
        session.missionName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.pilotName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        session.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesCategory = categoryFilter === 'all' || session.category === categoryFilter;
      
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const sessionDate = new Date(session.startTime);
        const now = new Date();
        switch (dateFilter) {
          case 'today':
            matchesDate = differenceInDays(now, sessionDate) === 0;
            break;
          case 'week':
            matchesDate = differenceInDays(now, sessionDate) <= 7;
            break;
          case 'month':
            matchesDate = differenceInDays(now, sessionDate) <= 30;
            break;
          case 'year':
            matchesDate = differenceInDays(now, sessionDate) <= 365;
            break;
        }
      }
      
      return matchesSearch && matchesCategory && matchesDate;
    });
  }, [flightSessions, searchQuery, categoryFilter, dateFilter]);

  const flightPath = useMemo(() => {
    return sessionLogs
      .filter(log => log.latitude && log.longitude)
      .map(log => [log.latitude!, log.longitude!] as [number, number]);
  }, [sessionLogs]);

  const currentReplayPosition = useMemo(() => {
    if (sessionLogs.length === 0 || replayIndex >= sessionLogs.length) return null;
    const log = sessionLogs[replayIndex];
    if (!log.latitude || !log.longitude) return null;
    return { lat: log.latitude, lng: log.longitude, log };
  }, [sessionLogs, replayIndex]);

  useEffect(() => {
    if (replayPlaying && sessionLogs.length > 0) {
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          if (prev >= sessionLogs.length - 1) {
            setReplayPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / replaySpeed);
    } else if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
    }
    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [replayPlaying, replaySpeed, sessionLogs.length]);

  const handleOpenEdit = (session: FlightSession) => {
    setSelectedSession(session);
    setEditForm({
      missionName: session.missionName || '',
      category: session.category || '',
      notes: session.notes || '',
      weatherConditions: session.weatherConditions || '',
      rating: session.rating || 0,
      tags: session.tags?.join(', ') || '',
      incidentReport: session.incidentReport || ''
    });
    setEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!selectedSession) return;
    updateMutation.mutate({
      id: selectedSession.id,
      updates: {
        missionName: editForm.missionName || null,
        category: (editForm.category as FlightSession['category']) || null,
        notes: editForm.notes || null,
        weatherConditions: editForm.weatherConditions || null,
        rating: editForm.rating || null,
        tags: editForm.tags ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        incidentReport: editForm.incidentReport || null
      }
    });
  };

  const handleOpenReplay = (session: FlightSession) => {
    setSelectedSession(session);
    setReplayIndex(0);
    setReplayPlaying(false);
    setReplayDialog(true);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatDistance = (meters: number | null) => {
    if (!meters) return '0m';
    if (meters >= 1000) return `${(meters / 1000).toFixed(2)}km`;
    return `${meters.toFixed(0)}m`;
  };

  const getCategoryInfo = (category: string | null) => {
    const cat = FLIGHT_CATEGORIES.find(c => c.value === category);
    return cat || { value: 'other', label: 'Other', color: 'bg-gray-500' };
  };

  const exportLogbook = () => {
    const csvContent = [
      ['Date', 'Mission Name', 'Category', 'Pilot', 'Duration (s)', 'Max Altitude (m)', 'Distance (m)', 'Battery Used (%)', 'Rating', 'Notes', 'Weather', 'Incident'].join(','),
      ...filteredSessions.map(s => [
        format(new Date(s.startTime), 'yyyy-MM-dd HH:mm'),
        `"${s.missionName || 'Unnamed'}"`,
        s.category || 'other',
        `"${s.pilotName || 'Unknown'}"`,
        s.totalFlightTime || 0,
        s.maxAltitude || 0,
        s.totalDistance || 0,
        s.batteryStartPercent && s.batteryEndPercent ? (s.batteryStartPercent - s.batteryEndPercent) : '',
        s.rating || '',
        `"${(s.notes || '').replace(/"/g, '""')}"`,
        `"${s.weatherConditions || ''}"`,
        `"${(s.incidentReport || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flight-logbook-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Logbook exported successfully");
  };

  if (!canAccessFlightRecorder) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>You don't have permission to access the Flight Logbook</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderStatsTab = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Plane className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{stats.totalFlights}</div>
                <div className="text-xs text-muted-foreground">Total Flights</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{formatDuration(stats.totalFlightTime)}</div>
                <div className="text-xs text-muted-foreground">Total Flight Time</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Navigation className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{formatDistance(stats.totalDistance)}</div>
                <div className="text-xs text-muted-foreground">Total Distance</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">{stats.avgAltitude.toFixed(0)}m</div>
                <div className="text-xs text-muted-foreground">Avg Max Altitude</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">This Month vs Last Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{stats.flightsThisMonth}</div>
                <div className="text-xs text-muted-foreground">This Month</div>
              </div>
              <ChevronRight className="h-6 w-6 text-muted-foreground" />
              <div className="text-center">
                <div className="text-3xl font-bold text-muted-foreground">{stats.flightsLastMonth}</div>
                <div className="text-xs text-muted-foreground">Last Month</div>
              </div>
            </div>
            <div className="mt-2 text-center text-sm">
              {stats.flightsThisMonth > stats.flightsLastMonth ? (
                <span className="text-green-500">+{((stats.flightsThisMonth - stats.flightsLastMonth) / (stats.flightsLastMonth || 1) * 100).toFixed(0)}% increase</span>
              ) : stats.flightsThisMonth < stats.flightsLastMonth ? (
                <span className="text-red-500">{((stats.flightsThisMonth - stats.flightsLastMonth) / (stats.flightsLastMonth || 1) * 100).toFixed(0)}% decrease</span>
              ) : (
                <span className="text-muted-foreground">Same as last month</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Flights by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {FLIGHT_CATEGORIES.map(cat => {
                const count = stats.flightsByCategory[cat.value] || 0;
                const percentage = stats.totalFlights > 0 ? (count / stats.totalFlights) * 100 : 0;
                return (
                  <div key={cat.value} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${cat.color}`} />
                    <span className="text-xs flex-1">{cat.label}</span>
                    <span className="text-xs font-mono">{count}</span>
                    <Progress value={percentage} className="w-20 h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderLogbookTab = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search missions, pilots, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-logbook-search"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40" data-testid="select-category-filter">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {FLIGHT_CATEGORIES.map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-32" data-testid="select-date-filter">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetchSessions()} data-testid="button-refresh-logbook">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={exportLogbook} data-testid="button-export-logbook">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="space-y-2">
          {sessionsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading flights...</div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No flights found matching your criteria</p>
            </div>
          ) : (
            filteredSessions.map(session => {
              const catInfo = getCategoryInfo(session.category);
              return (
                <Card key={session.id} className="hover:bg-accent/50 transition-colors cursor-pointer" data-testid={`card-flight-${session.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{session.missionName || 'Unnamed Flight'}</span>
                          <Badge className={`${catInfo.color} text-white text-xs`}>
                            {catInfo.label}
                          </Badge>
                          {session.rating && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: session.rating }).map((_, i) => (
                                <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              ))}
                            </div>
                          )}
                          {session.incidentReport && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Incident
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(session.startTime), 'MMM dd, yyyy HH:mm')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(session.totalFlightTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Navigation className="h-3 w-3" />
                            {formatDistance(session.totalDistance)}
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {session.maxAltitude?.toFixed(0) || 0}m
                          </span>
                          {session.pilotName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {session.pilotName}
                            </span>
                          )}
                        </div>
                        {session.tags && session.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-2">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            {session.tags.map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); handleOpenReplay(session); }}
                          data-testid={`button-replay-${session.id}`}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Replay
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(session); }}
                          data-testid={`button-edit-${session.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const renderEditDialog = () => (
    <Dialog open={editDialog} onOpenChange={setEditDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Flight Record
          </DialogTitle>
          <DialogDescription>
            {selectedSession && format(new Date(selectedSession.startTime), 'MMMM dd, yyyy HH:mm')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mission Name</Label>
            <Input
              value={editForm.missionName}
              onChange={(e) => setEditForm(prev => ({ ...prev, missionName: e.target.value }))}
              placeholder="e.g., Field Survey #12"
              data-testid="input-edit-mission-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={editForm.category} onValueChange={(v) => setEditForm(prev => ({ ...prev, category: v }))}>
              <SelectTrigger data-testid="select-edit-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {FLIGHT_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <Button
                  key={star}
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditForm(prev => ({ ...prev, rating: star }))}
                  data-testid={`button-rating-${star}`}
                >
                  <Star 
                    className={`h-5 w-5 ${star <= editForm.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} 
                  />
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input
              value={editForm.tags}
              onChange={(e) => setEditForm(prev => ({ ...prev, tags: e.target.value }))}
              placeholder="e.g., training, night-flight, demo"
              data-testid="input-edit-tags"
            />
          </div>
          <div className="space-y-2">
            <Label>Weather Conditions</Label>
            <Input
              value={editForm.weatherConditions}
              onChange={(e) => setEditForm(prev => ({ ...prev, weatherConditions: e.target.value }))}
              placeholder="e.g., Clear skies, light wind"
              data-testid="input-edit-weather"
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Flight notes and observations..."
              rows={3}
              data-testid="textarea-edit-notes"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Incident Report
            </Label>
            <Textarea
              value={editForm.incidentReport}
              onChange={(e) => setEditForm(prev => ({ ...prev, incidentReport: e.target.value }))}
              placeholder="Document any incidents or issues..."
              rows={2}
              data-testid="textarea-edit-incident"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const renderReplayDialog = () => {
    const mapCenter: [number, number] = flightPath.length > 0 
      ? [
          flightPath.reduce((sum, p) => sum + p[0], 0) / flightPath.length,
          flightPath.reduce((sum, p) => sum + p[1], 0) / flightPath.length
        ]
      : [0, 0];

    return (
      <Dialog open={replayDialog} onOpenChange={(open) => {
        if (!open) {
          setReplayPlaying(false);
          if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
        }
        setReplayDialog(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Flight Replay
            </DialogTitle>
            <DialogDescription>
              {selectedSession?.missionName || 'Unnamed Flight'} - {selectedSession && format(new Date(selectedSession.startTime), 'MMMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>
          
          {logsLoading ? (
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              Loading flight data...
            </div>
          ) : flightPath.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No GPS data available for this flight</p>
              </div>
            </div>
          ) : (
            <>
              <div className="h-80 rounded-lg overflow-hidden border relative">
                <MapContainer
                  center={mapCenter}
                  zoom={15}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                  />
                  <NoFlyZoneOverlay zones={noFlyZones} />
                  <Polyline 
                    positions={flightPath.slice(0, replayIndex + 1)} 
                    color="#3b82f6" 
                    weight={3}
                    opacity={0.8}
                  />
                  <Polyline 
                    positions={flightPath.slice(replayIndex)} 
                    color="#94a3b8" 
                    weight={2}
                    opacity={0.4}
                    dashArray="5,10"
                  />
                  {flightPath.length > 0 && (
                    <>
                      <Marker position={flightPath[0]} icon={startMarkerIcon}>
                        <Popup><strong>Start</strong></Popup>
                      </Marker>
                      <Marker position={flightPath[flightPath.length - 1]} icon={endMarkerIcon}>
                        <Popup><strong>End</strong></Popup>
                      </Marker>
                    </>
                  )}
                  {currentReplayPosition && (
                    <Marker 
                      position={[currentReplayPosition.lat, currentReplayPosition.lng]} 
                      icon={droneIcon}
                    >
                      <Popup>
                        <div className="text-xs">
                          <div><strong>Current Position</strong></div>
                          <div>Alt: {currentReplayPosition.log.altitude?.toFixed(1) || 0}m</div>
                          <div>Speed: {currentReplayPosition.log.groundSpeed?.toFixed(1) || 0}m/s</div>
                          <div>Battery: {currentReplayPosition.log.batteryPercent || 0}%</div>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                </MapContainer>
                <NoFlyZoneLegend className="absolute bottom-2 left-2 z-[400]" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReplayIndex(0)}
                    disabled={replayIndex === 0}
                    data-testid="button-replay-start"
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={replayPlaying ? "destructive" : "default"}
                    size="sm"
                    onClick={() => setReplayPlaying(!replayPlaying)}
                    data-testid="button-replay-toggle"
                  >
                    {replayPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReplayIndex(sessionLogs.length - 1)}
                    disabled={replayIndex >= sessionLogs.length - 1}
                    data-testid="button-replay-end"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  <div className="flex-1">
                    <input
                      type="range"
                      min={0}
                      max={sessionLogs.length - 1}
                      value={replayIndex}
                      onChange={(e) => setReplayIndex(parseInt(e.target.value))}
                      className="w-full"
                      data-testid="slider-replay-progress"
                    />
                  </div>
                  <Select value={replaySpeed.toString()} onValueChange={(v) => setReplaySpeed(parseFloat(v))}>
                    <SelectTrigger className="w-24" data-testid="select-replay-speed">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">0.5x</SelectItem>
                      <SelectItem value="1">1x</SelectItem>
                      <SelectItem value="2">2x</SelectItem>
                      <SelectItem value="4">4x</SelectItem>
                      <SelectItem value="8">8x</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid grid-cols-5 gap-4 text-center">
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Time</div>
                    <div className="font-mono text-sm">
                      {currentReplayPosition?.log.timestamp 
                        ? format(new Date(currentReplayPosition.log.timestamp), 'HH:mm:ss')
                        : '--:--:--'
                      }
                    </div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Altitude</div>
                    <div className="font-mono text-sm">{currentReplayPosition?.log.altitude?.toFixed(1) || 0}m</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Speed</div>
                    <div className="font-mono text-sm">{currentReplayPosition?.log.groundSpeed?.toFixed(1) || 0}m/s</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Heading</div>
                    <div className="font-mono text-sm">{currentReplayPosition?.log.heading?.toFixed(0) || 0}°</div>
                  </div>
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="text-xs text-muted-foreground">Battery</div>
                    <div className="font-mono text-sm">{currentReplayPosition?.log.batteryPercent || 0}%</div>
                  </div>
                </div>
                
                <div className="text-xs text-center text-muted-foreground">
                  Frame {replayIndex + 1} of {sessionLogs.length}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Flight Logbook
            </CardTitle>
            <CardDescription>Automatic recording and categorization of all drone missions</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="logbook" className="flex items-center gap-2" data-testid="tab-logbook">
              <BookOpen className="h-4 w-4" />
              Logbook
            </TabsTrigger>
            <TabsTrigger value="statistics" className="flex items-center gap-2" data-testid="tab-statistics">
              <BarChart3 className="h-4 w-4" />
              Statistics
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="logbook" className="flex-1 mt-0">
            {renderLogbookTab()}
          </TabsContent>
          
          <TabsContent value="statistics" className="flex-1 mt-0">
            {renderStatsTab()}
          </TabsContent>
        </Tabs>
      </CardContent>
      
      {renderEditDialog()}
      {renderReplayDialog()}
    </Card>
  );
}
