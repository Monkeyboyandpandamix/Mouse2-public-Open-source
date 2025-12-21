import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Save, Play, MapPin, Navigation, Search, Edit2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
}

export function MissionPlanningPanel() {
  const queryClient = useQueryClient();
  const [selectedMission, setSelectedMission] = useState<number | null>(null);
  const [targetMethod, setTargetMethod] = useState<"map" | "address" | "coordinates">("map");
  const [addressInput, setAddressInput] = useState("");
  const [coordLat, setCoordLat] = useState("");
  const [coordLon, setCoordLon] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [missionToDelete, setMissionToDelete] = useState<Mission | null>(null);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      toast.success("Mission created");
    },
  });

  const deleteMission = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/missions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete mission");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      setSelectedMission(null);
      setDeleteDialogOpen(false);
      toast.success("Mission deleted");
    },
    onError: () => {
      toast.error("Failed to delete mission");
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

  const deleteWaypoint = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/waypoints/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete waypoint");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success("Waypoint removed");
    },
  });

  const handleAddressSearch = async () => {
    if (!addressInput.trim()) {
      toast.error("Please enter an address");
      return;
    }
    toast.success(`Searching for: ${addressInput}`);
  };

  const handleAddWaypointFromCoords = () => {
    const lat = parseFloat(coordLat);
    const lon = parseFloat(coordLon);
    
    if (isNaN(lat) || isNaN(lon)) {
      toast.error("Please enter valid coordinates");
      return;
    }
    
    if (selectedMission) {
      addWaypoint.mutate({
        missionId: selectedMission,
        order: waypoints.length + 1,
        latitude: lat,
        longitude: lon,
        altitude: 50,
        speed: 5,
        action: "flythrough",
      });
      setCoordLat("");
      setCoordLon("");
    }
  };

  const handleDeleteMission = (mission: Mission) => {
    setMissionToDelete(mission);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteMission = () => {
    if (missionToDelete) {
      deleteMission.mutate(missionToDelete.id);
    }
  };

  const selectedMissionData = missions.find(m => m.id === selectedMission);

  return (
    <div className="h-full flex">
      {/* Mission List Sidebar */}
      <div className="w-80 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold font-sans mb-3">Flight Missions</h3>
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
          <div className="p-2 space-y-2">
            {missions.map((mission) => (
              <Card
                key={mission.id}
                className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                  selectedMission === mission.id ? "border-primary bg-primary/10" : ""
                }`}
                onClick={() => setSelectedMission(mission.id)}
              >
                <CardHeader className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-sm font-mono">{mission.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{mission.description}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">{mission.status}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMission(mission);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Mission Details */}
      <div className="flex-1 flex flex-col">
        {selectedMission ? (
          <>
            <div className="p-4 border-b border-border bg-card/80 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold font-sans">{selectedMissionData?.name || "Mission Details"}</h2>
                  <p className="text-sm text-muted-foreground">Configure waypoints and flight path</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Execute Mission
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Home Position</Label>
                  <div className="font-mono text-sm">
                    {selectedMissionData?.homeLatitude.toFixed(4)}, {selectedMissionData?.homeLongitude.toFixed(4)}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Waypoints</Label>
                  <div className="font-mono text-sm">{waypoints.length} points</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Est. Flight Time</Label>
                  <div className="font-mono text-sm">~{Math.max(1, waypoints.length * 2)} minutes</div>
                </div>
              </div>
            </div>

            <div className="p-4 border-b border-border bg-muted/30">
              <h4 className="font-bold text-sm mb-3">Add Waypoint</h4>
              <Tabs value={targetMethod} onValueChange={(v) => setTargetMethod(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="map">
                    <MapPin className="h-4 w-4 mr-2" />
                    Click Map
                  </TabsTrigger>
                  <TabsTrigger value="address">
                    <Search className="h-4 w-4 mr-2" />
                    Address
                  </TabsTrigger>
                  <TabsTrigger value="coordinates">
                    <Navigation className="h-4 w-4 mr-2" />
                    Coordinates
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="map" className="mt-3">
                  <div className="bg-muted/50 border border-dashed border-border rounded-lg p-6 text-center">
                    <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click on the map to add a waypoint at that location
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="address" className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter address (e.g., 123 Main St, City)"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleAddressSearch}>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Address will be converted to GPS coordinates and added as a waypoint
                  </p>
                </TabsContent>

                <TabsContent value="coordinates" className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Latitude</Label>
                      <Input
                        placeholder="34.0522"
                        value={coordLat}
                        onChange={(e) => setCoordLat(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Longitude</Label>
                      <Input
                        placeholder="-118.2437"
                        value={coordLon}
                        onChange={(e) => setCoordLon(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleAddWaypointFromCoords}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Waypoint
                  </Button>
                </TabsContent>
              </Tabs>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">Waypoint Sequence</h3>
                </div>

                {waypoints.map((wp, idx) => (
                  <Card key={wp.id} className="border-l-4 border-l-primary">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
                          {wp.order}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Lat:</span>
                              <span className="font-mono ml-1">{wp.latitude.toFixed(6)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Lon:</span>
                              <span className="font-mono ml-1">{wp.longitude.toFixed(6)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Alt:</span>
                              <span className="font-mono ml-1">{wp.altitude}m</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Speed:</span>
                              <span className="font-mono ml-1">{wp.speed || 5}m/s</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select defaultValue={wp.action || "flythrough"}>
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="flythrough">Fly Through</SelectItem>
                                <SelectItem value="hover">Hover (5s)</SelectItem>
                                <SelectItem value="photo">Take Photo</SelectItem>
                                <SelectItem value="drop">Drop Payload</SelectItem>
                                <SelectItem value="pickup">Pickup Payload</SelectItem>
                                <SelectItem value="rtl">Return to Launch</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8"
                          onClick={() => deleteWaypoint.mutate(wp.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {waypoints.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No waypoints added yet</p>
                    <p className="text-sm">Use the options above to add waypoints</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Navigation className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a mission to view details</p>
              <p className="text-sm">Or create a new mission to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Mission
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{missionToDelete?.name}"? This action cannot be undone and all waypoints will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteMission}>
              Delete Mission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
