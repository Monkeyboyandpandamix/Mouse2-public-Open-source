import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Play, MapPin, Navigation } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function MissionPlanningPanel() {
  const queryClient = useQueryClient();
  const [selectedMission, setSelectedMission] = useState<number | null>(null);

  const { data: missions = [] } = useQuery({
    queryKey: ["/api/missions"],
  });

  const { data: waypoints = [] } = useQuery({
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
            {missions.map((mission: any) => (
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
                    <Badge variant="outline" className="ml-2">{mission.status}</Badge>
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
                  <h2 className="text-xl font-bold font-sans">Mission Details</h2>
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
                  <div className="font-mono text-sm">34.0522, -118.2437</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Waypoints</Label>
                  <div className="font-mono text-sm">{waypoints.length} points</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Est. Flight Time</Label>
                  <div className="font-mono text-sm">~8 minutes</div>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">Waypoint Sequence</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (selectedMission) {
                        addWaypoint.mutate({
                          missionId: selectedMission,
                          order: waypoints.length + 1,
                          latitude: 34.0522 + (Math.random() - 0.5) * 0.01,
                          longitude: -118.2437 + (Math.random() - 0.5) * 0.01,
                          altitude: 50,
                          speed: 5,
                          action: "hover",
                        });
                      }
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Waypoint
                  </Button>
                </div>

                {waypoints.map((wp: any, idx: number) => (
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
                          {wp.action && (
                            <Badge variant="secondary" className="text-xs">
                              Action: {wp.action}
                            </Badge>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
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
                    <p className="text-sm">Click map or use "Add Waypoint" button</p>
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
    </div>
  );
}
