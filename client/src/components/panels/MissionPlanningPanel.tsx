import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Save, Play, MapPin, Navigation, Search, AlertTriangle, Clock, Bell, RotateCcw, Radar } from "lucide-react";
import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MissionMap } from "@/components/map/MissionMap";

interface Mission {
  id: number;
  name: string;
  description: string | null;
  status: string;
  homeLatitude: number;
  homeLongitude: number;
  homeAltitude: number;
}

interface Waypoint {
  id: number;
  missionId: number;
  order: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number | null;
  action: string | null;
  actionParams: any;
  address: string | null;
}

const WAYPOINT_ACTIONS = [
  { value: "flythrough", label: "Fly Through", icon: Navigation, desc: "Pass through without stopping" },
  { value: "hover", label: "Hover", icon: Clock, desc: "Stop and hover at location" },
  { value: "alert", label: "Alert on Arrival", icon: Bell, desc: "Send notification when reached" },
  { value: "patrol", label: "Patrol Area", icon: Radar, desc: "Circle around this point" },
  { value: "rtl", label: "Return to Launch", icon: RotateCcw, desc: "Return home after this point" },
];

export function MissionPlanningPanel() {
  const queryClient = useQueryClient();
  const [selectedMission, setSelectedMission] = useState<number | null>(null);
  const [targetMethod, setTargetMethod] = useState<"map" | "address" | "coordinates">("map");
  const [addressInput, setAddressInput] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [coordLat, setCoordLat] = useState("");
  const [coordLon, setCoordLon] = useState("");
  const [coordAlt, setCoordAlt] = useState("50");
  const [selectedAction, setSelectedAction] = useState("flythrough");
  const [hoverTime, setHoverTime] = useState("5");
  const [patrolRadius, setPatrolRadius] = useState("20");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [missionToDelete, setMissionToDelete] = useState<Mission | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { data: missions = [] } = useQuery<Mission[]>({
    queryKey: ["/api/missions"],
  });

  const { data: waypoints = [] } = useQuery<Waypoint[]>({
    queryKey: ["/api/missions", selectedMission, "waypoints"],
    enabled: !!selectedMission,
  });

  const createMission = useMutation({
    mutationFn: async (mission: any) => {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mission),
      });
      if (!res.ok) throw new Error("Failed to create mission");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      setSelectedMission(data.id);
      toast.success("Mission created");
    },
  });

  const deleteMission = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/missions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete mission");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      setSelectedMission(null);
      setDeleteDialogOpen(false);
      toast.success("Mission deleted");
    },
  });

  const addWaypoint = useMutation({
    mutationFn: async (waypoint: any) => {
      const res = await fetch("/api/waypoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(waypoint),
      });
      if (!res.ok) throw new Error("Failed to add waypoint");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success("Waypoint added");
    },
  });

  const updateWaypoint = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/waypoints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update waypoint");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
    },
  });

  const deleteWaypoint = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/waypoints/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete waypoint");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success("Waypoint removed");
    },
  });

  const searchAddress = async () => {
    if (!addressInput.trim()) {
      toast.error("Please enter an address");
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressInput)}&limit=5`
      );
      const results = await response.json();
      
      if (results.length > 0) {
        setAddressSuggestions(results);
        toast.success(`Found ${results.length} location(s)`);
      } else {
        toast.error("No locations found for that address");
        setAddressSuggestions([]);
      }
    } catch (error) {
      toast.error("Failed to search address");
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddressResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    
    if (selectedMission) {
      const actionParams = selectedAction === 'hover' ? { hoverTime: parseInt(hoverTime) } :
                           selectedAction === 'patrol' ? { patrolRadius: parseInt(patrolRadius) } :
                           selectedAction === 'alert' ? { message: 'Waypoint reached' } : {};
      
      addWaypoint.mutate({
        missionId: selectedMission,
        order: waypoints.length + 1,
        latitude: lat,
        longitude: lon,
        altitude: parseFloat(coordAlt) || 50,
        speed: 5,
        action: selectedAction,
        actionParams,
        address: result.display_name,
      });
      
      setAddressInput("");
      setAddressSuggestions([]);
    }
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (selectedMission && targetMethod === "map") {
      const actionParams = selectedAction === 'hover' ? { hoverTime: parseInt(hoverTime) } :
                           selectedAction === 'patrol' ? { patrolRadius: parseInt(patrolRadius) } :
                           selectedAction === 'alert' ? { message: 'Waypoint reached' } : {};
      
      addWaypoint.mutate({
        missionId: selectedMission,
        order: waypoints.length + 1,
        latitude: lat,
        longitude: lng,
        altitude: parseFloat(coordAlt) || 50,
        speed: 5,
        action: selectedAction,
        actionParams,
      });
    }
  }, [selectedMission, waypoints.length, selectedAction, hoverTime, patrolRadius, coordAlt, targetMethod, addWaypoint]);

  const handleAddWaypointFromCoords = () => {
    const lat = parseFloat(coordLat);
    const lon = parseFloat(coordLon);
    
    if (isNaN(lat) || isNaN(lon)) {
      toast.error("Please enter valid coordinates");
      return;
    }
    
    if (selectedMission) {
      const actionParams = selectedAction === 'hover' ? { hoverTime: parseInt(hoverTime) } :
                           selectedAction === 'patrol' ? { patrolRadius: parseInt(patrolRadius) } :
                           selectedAction === 'alert' ? { message: 'Waypoint reached' } : {};
      
      addWaypoint.mutate({
        missionId: selectedMission,
        order: waypoints.length + 1,
        latitude: lat,
        longitude: lon,
        altitude: parseFloat(coordAlt) || 50,
        speed: 5,
        action: selectedAction,
        actionParams,
      });
      setCoordLat("");
      setCoordLon("");
    }
  };

  const selectedMissionData = missions.find(m => m.id === selectedMission);

  return (
    <div className="h-full flex">
      {/* Mission List Sidebar */}
      <div className="w-72 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h3 className="font-bold font-sans text-sm mb-2">Flight Missions</h3>
          <Button className="w-full" size="sm" onClick={() => {
            createMission.mutate({
              name: `Mission ${missions.length + 1}`,
              description: "New mission",
              homeLatitude: 34.0522,
              homeLongitude: -118.2437,
              homeAltitude: 0,
            });
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Mission
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className={`p-2 rounded cursor-pointer transition-colors border ${
                  selectedMission === mission.id 
                    ? "border-primary bg-primary/10" 
                    : "border-transparent hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedMission(mission.id);
                  // Notify MapInterface of mission selection
                  window.dispatchEvent(new CustomEvent('mission-selected', { detail: { missionId: mission.id } }));
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">{mission.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{mission.description}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMissionToDelete(mission);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMission ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-border bg-card/80 backdrop-blur shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold font-sans">{selectedMissionData?.name}</h2>
                  <p className="text-xs text-muted-foreground">{waypoints.length} waypoints</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  <Button size="sm">
                    <Play className="h-4 w-4 mr-1" />
                    Execute
                  </Button>
                </div>
              </div>
            </div>

            {/* Map and Controls */}
            <div className="flex-1 flex overflow-hidden">
              {/* Map Section */}
              <div className="flex-1 relative">
                <MissionMap
                  waypoints={waypoints}
                  homePosition={selectedMissionData ? [selectedMissionData.homeLatitude, selectedMissionData.homeLongitude] : undefined}
                  onMapClick={handleMapClick}
                  clickEnabled={targetMethod === "map"}
                  showClickHint={targetMethod === "map"}
                />
              </div>

              {/* Right Panel - Waypoint Controls */}
              <div className="w-80 border-l border-border bg-card/50 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border shrink-0">
                  <h4 className="font-bold text-sm mb-2">Add Waypoint</h4>
                  
                  <Tabs value={targetMethod} onValueChange={(v) => setTargetMethod(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-8">
                      <TabsTrigger value="map" className="text-xs">Map</TabsTrigger>
                      <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
                      <TabsTrigger value="coordinates" className="text-xs">Coords</TabsTrigger>
                    </TabsList>

                    <TabsContent value="address" className="mt-2 space-y-2">
                      <div className="flex gap-1">
                        <Input
                          placeholder="Enter address..."
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          className="flex-1 h-8 text-xs"
                          onKeyDown={(e) => e.key === 'Enter' && searchAddress()}
                        />
                        <Button size="sm" className="h-8" onClick={searchAddress} disabled={isSearching}>
                          <Search className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {addressSuggestions.length > 0 && (
                        <div className="bg-muted rounded border border-border max-h-32 overflow-y-auto">
                          {addressSuggestions.map((result, idx) => (
                            <div
                              key={idx}
                              className="p-2 hover:bg-primary/10 cursor-pointer text-xs border-b border-border last:border-0"
                              onClick={() => selectAddressResult(result)}
                            >
                              <div className="truncate">{result.display_name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="coordinates" className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Latitude"
                          value={coordLat}
                          onChange={(e) => setCoordLat(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="Longitude"
                          value={coordLon}
                          onChange={(e) => setCoordLon(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button className="w-full h-8 text-xs" onClick={handleAddWaypointFromCoords}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Waypoint
                      </Button>
                    </TabsContent>

                    <TabsContent value="map" className="mt-2">
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Click anywhere on the map to add a waypoint
                      </p>
                    </TabsContent>
                  </Tabs>

                  <Separator className="my-3" />

                  {/* Waypoint Settings */}
                  <div className="space-y-2">
                    <Label className="text-xs">Altitude (m)</Label>
                    <Input
                      type="number"
                      value={coordAlt}
                      onChange={(e) => setCoordAlt(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="space-y-2 mt-2">
                    <Label className="text-xs">Action at Waypoint</Label>
                    <Select value={selectedAction} onValueChange={setSelectedAction}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WAYPOINT_ACTIONS.map(action => (
                          <SelectItem key={action.value} value={action.value}>
                            <span className="flex items-center gap-2">
                              <action.icon className="h-3 w-3" />
                              {action.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedAction === 'hover' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Hover Time (seconds)</Label>
                      <Input
                        type="number"
                        value={hoverTime}
                        onChange={(e) => setHoverTime(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'patrol' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Patrol Radius (m)</Label>
                      <Input
                        type="number"
                        value={patrolRadius}
                        onChange={(e) => setPatrolRadius(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Waypoint List */}
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-2">
                    <h4 className="font-bold text-xs text-muted-foreground uppercase px-1">Waypoints</h4>
                    
                    {waypoints.map((wp) => {
                      const actionInfo = WAYPOINT_ACTIONS.find(a => a.value === wp.action) || WAYPOINT_ACTIONS[0];
                      return (
                        <Card key={wp.id} className="border-l-4 border-l-primary">
                          <CardContent className="p-2">
                            <div className="flex items-start gap-2">
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground font-bold text-xs shrink-0">
                                {wp.order}
                              </div>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="text-xs font-mono">
                                  {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                                </div>
                                {wp.address && (
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {wp.address}
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="text-[10px] h-4">
                                    <actionInfo.icon className="h-2 w-2 mr-1" />
                                    {actionInfo.label}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">{wp.altitude}m</span>
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 shrink-0"
                                onClick={() => deleteWaypoint.mutate(wp.id)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}

                    {waypoints.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">No waypoints yet</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Navigation className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a mission or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Mission
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{missionToDelete?.name}"? This will permanently remove all waypoints.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => missionToDelete && deleteMission.mutate(missionToDelete.id)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
