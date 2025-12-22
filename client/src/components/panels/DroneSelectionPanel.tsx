import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Plane, 
  Plus, 
  Battery, 
  Signal, 
  Satellite, 
  MapPin, 
  Settings, 
  Trash2,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Wrench,
  Radio,
  RefreshCw
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Drone } from "@shared/schema";

interface DroneSelectionPanelProps {
  onDroneSelected: (drone: Drone) => void;
}

const statusIcons: Record<string, { icon: typeof Plane; color: string; label: string }> = {
  online: { icon: CheckCircle2, color: "text-emerald-500", label: "Online" },
  offline: { icon: WifiOff, color: "text-gray-500", label: "Offline" },
  armed: { icon: AlertCircle, color: "text-amber-500", label: "Armed" },
  flying: { icon: Plane, color: "text-blue-500", label: "Flying" },
  error: { icon: AlertCircle, color: "text-red-500", label: "Error" },
  maintenance: { icon: Wrench, color: "text-orange-500", label: "Maintenance" },
};

const gpsStatusLabels: Record<string, { label: string; color: string }> = {
  no_fix: { label: "No Fix", color: "text-red-500" },
  "2d_fix": { label: "2D Fix", color: "text-amber-500" },
  "3d_fix": { label: "3D Fix", color: "text-emerald-500" },
  dgps: { label: "DGPS", color: "text-blue-500" },
  rtk_fixed: { label: "RTK Fixed", color: "text-purple-500" },
};

export function DroneSelectionPanel({ onDroneSelected }: DroneSelectionPanelProps) {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDrone, setNewDrone] = useState({
    name: "",
    callsign: "",
    model: "Custom",
    connectionType: "mavlink",
    connectionString: "",
    motorCount: 4,
    hasGripper: false,
    hasCamera: true,
    hasThermal: false,
    hasLidar: false,
    maxSpeed: 15,
    maxAltitude: 120,
    rtlAltitude: 50,
  });

  const { data: drones = [], isLoading, refetch } = useQuery<Drone[]>({
    queryKey: ["/api/drones"],
    refetchInterval: 5000,
  });

  const createDroneMutation = useMutation({
    mutationFn: async (drone: typeof newDrone) => {
      const res = await fetch("/api/drones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drone),
      });
      if (!res.ok) throw new Error("Failed to create drone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drones"] });
      setShowAddDialog(false);
      setNewDrone({
        name: "",
        callsign: "",
        model: "Custom",
        connectionType: "mavlink",
        connectionString: "",
        motorCount: 4,
        hasGripper: false,
        hasCamera: true,
        hasThermal: false,
        hasLidar: false,
        maxSpeed: 15,
        maxAltitude: 120,
        rtlAltitude: 50,
      });
      toast.success("Drone added successfully");
    },
    onError: () => {
      toast.error("Failed to add drone");
    },
  });

  const deleteDroneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/drones/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete drone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drones"] });
      toast.success("Drone removed");
    },
    onError: () => {
      toast.error("Failed to remove drone");
    },
  });

  const handleSelectDrone = (drone: Drone) => {
    localStorage.setItem("mouse_selected_drone", JSON.stringify(drone));
    window.dispatchEvent(new CustomEvent("drone-selected", { detail: drone }));
    onDroneSelected(drone);
    toast.success(`Connected to ${drone.name} (${drone.callsign})`);
  };

  const handleAddDrone = () => {
    if (!newDrone.name || !newDrone.callsign) {
      toast.error("Name and callsign are required");
      return;
    }
    createDroneMutation.mutate(newDrone);
  };

  const getStatusInfo = (status: string) => {
    return statusIcons[status] || statusIcons.offline;
  };

  const getGpsInfo = (gpsStatus: string | null) => {
    return gpsStatusLabels[gpsStatus || "no_fix"] || gpsStatusLabels.no_fix;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Plane className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">M.O.U.S.E Ground Control</h1>
          <p className="text-muted-foreground mt-2">Select a drone to control or add a new one</p>
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1">
              {drones.length} Drone{drones.length !== 1 ? "s" : ""} Available
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => refetch()} data-testid="button-refresh-drones">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-drone">
                <Plus className="h-4 w-4 mr-2" />
                Add Drone
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Drone</DialogTitle>
                <DialogDescription>Configure a new drone for the ground control station</DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="drone-name">Drone Name</Label>
                    <Input
                      id="drone-name"
                      placeholder="e.g., Recon Unit 1"
                      value={newDrone.name}
                      onChange={(e) => setNewDrone({ ...newDrone, name: e.target.value })}
                      data-testid="input-drone-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="drone-callsign">Callsign</Label>
                    <Input
                      id="drone-callsign"
                      placeholder="e.g., ALPHA-1"
                      value={newDrone.callsign}
                      onChange={(e) => setNewDrone({ ...newDrone, callsign: e.target.value.toUpperCase() })}
                      data-testid="input-drone-callsign"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="drone-model">Model</Label>
                    <Select 
                      value={newDrone.model} 
                      onValueChange={(value) => setNewDrone({ ...newDrone, model: value })}
                    >
                      <SelectTrigger id="drone-model" data-testid="select-drone-model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Custom">Custom Build</SelectItem>
                        <SelectItem value="DJI Mavic 3">DJI Mavic 3</SelectItem>
                        <SelectItem value="DJI Phantom 4">DJI Phantom 4</SelectItem>
                        <SelectItem value="Holybro X500">Holybro X500</SelectItem>
                        <SelectItem value="Tarot 650">Tarot 650</SelectItem>
                        <SelectItem value="Custom Hexacopter">Custom Hexacopter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="motor-count">Motor Count</Label>
                    <Select 
                      value={newDrone.motorCount.toString()} 
                      onValueChange={(value) => setNewDrone({ ...newDrone, motorCount: parseInt(value) })}
                    >
                      <SelectTrigger id="motor-count" data-testid="select-motor-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4 Motors (Quad)</SelectItem>
                        <SelectItem value="6">6 Motors (Hex)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="connection-type">Connection Type</Label>
                    <Select 
                      value={newDrone.connectionType} 
                      onValueChange={(value) => setNewDrone({ ...newDrone, connectionType: value })}
                    >
                      <SelectTrigger id="connection-type" data-testid="select-connection-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mavlink">MAVLink</SelectItem>
                        <SelectItem value="dji_sdk">DJI SDK</SelectItem>
                        <SelectItem value="custom">Custom Protocol</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="connection-string">Connection String</Label>
                    <Input
                      id="connection-string"
                      placeholder="udp:127.0.0.1:14550"
                      value={newDrone.connectionString}
                      onChange={(e) => setNewDrone({ ...newDrone, connectionString: e.target.value })}
                      data-testid="input-connection-string"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max-speed">Max Speed (m/s)</Label>
                    <Input
                      id="max-speed"
                      type="number"
                      value={newDrone.maxSpeed}
                      onChange={(e) => setNewDrone({ ...newDrone, maxSpeed: parseFloat(e.target.value) || 15 })}
                      data-testid="input-max-speed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-altitude">Max Alt (m)</Label>
                    <Input
                      id="max-altitude"
                      type="number"
                      value={newDrone.maxAltitude}
                      onChange={(e) => setNewDrone({ ...newDrone, maxAltitude: parseFloat(e.target.value) || 120 })}
                      data-testid="input-max-altitude"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rtl-altitude">RTL Alt (m)</Label>
                    <Input
                      id="rtl-altitude"
                      type="number"
                      value={newDrone.rtlAltitude}
                      onChange={(e) => setNewDrone({ ...newDrone, rtlAltitude: parseFloat(e.target.value) || 50 })}
                      data-testid="input-rtl-altitude"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Hardware Features</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "hasCamera", label: "Camera" },
                      { key: "hasThermal", label: "Thermal" },
                      { key: "hasLidar", label: "LiDAR" },
                      { key: "hasGripper", label: "Gripper" },
                    ].map(({ key, label }) => (
                      <Button
                        key={key}
                        type="button"
                        variant={(newDrone as any)[key] ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNewDrone({ ...newDrone, [key]: !(newDrone as any)[key] })}
                        data-testid={`button-toggle-${key}`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button onClick={handleAddDrone} disabled={createDroneMutation.isPending} data-testid="button-confirm-add-drone">
                  {createDroneMutation.isPending ? "Adding..." : "Add Drone"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : drones.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center">
              <Plane className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Drones Configured</h3>
              <p className="text-muted-foreground mb-4">Add your first drone to get started with the ground control station</p>
              <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-drone">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Drone
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="grid gap-4 sm:grid-cols-2">
              {drones.map((drone) => {
                const statusInfo = getStatusInfo(drone.status);
                const gpsInfo = getGpsInfo(drone.gpsStatus);
                const StatusIcon = statusInfo.icon;
                
                return (
                  <Card 
                    key={drone.id} 
                    className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group"
                    onClick={() => handleSelectDrone(drone)}
                    data-testid={`card-drone-${drone.id}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            drone.status === 'flying' ? 'bg-blue-500/10' :
                            drone.status === 'online' ? 'bg-emerald-500/10' :
                            drone.status === 'armed' ? 'bg-amber-500/10' :
                            'bg-muted'
                          }`}>
                            <Plane className={`h-5 w-5 ${statusInfo.color}`} />
                          </div>
                          <div>
                            <CardTitle className="text-base">{drone.name}</CardTitle>
                            <CardDescription className="font-mono text-xs">{drone.callsign}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`${statusInfo.color} border-current`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Remove drone ${drone.name}?`)) {
                                deleteDroneMutation.mutate(drone.id);
                              }
                            }}
                            data-testid={`button-delete-drone-${drone.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs text-muted-foreground mb-3">
                        {drone.model} • {drone.motorCount} Motors • {drone.connectionType.toUpperCase()}
                      </div>
                      
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-2 rounded bg-muted/30">
                              <Battery className={`h-4 w-4 mx-auto mb-1 ${
                                (drone.batteryPercent || 0) > 50 ? 'text-emerald-500' :
                                (drone.batteryPercent || 0) > 20 ? 'text-amber-500' :
                                'text-red-500'
                              }`} />
                              <p className="text-[10px] font-medium">{drone.batteryPercent ?? '--'}%</p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Battery Level</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-2 rounded bg-muted/30">
                              <Signal className={`h-4 w-4 mx-auto mb-1 ${
                                (drone.signalStrength || 0) > 70 ? 'text-emerald-500' :
                                (drone.signalStrength || 0) > 30 ? 'text-amber-500' :
                                'text-red-500'
                              }`} />
                              <p className="text-[10px] font-medium">{drone.signalStrength ?? '--'}%</p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>Signal Strength</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-2 rounded bg-muted/30">
                              <Satellite className={`h-4 w-4 mx-auto mb-1 ${gpsInfo.color}`} />
                              <p className="text-[10px] font-medium">{gpsInfo.label}</p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>GPS Status</TooltipContent>
                        </Tooltip>
                        
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-2 rounded bg-muted/30">
                              <MapPin className="h-4 w-4 mx-auto mb-1 text-primary" />
                              <p className="text-[10px] font-medium">
                                {drone.latitude && drone.longitude ? 
                                  `${drone.latitude.toFixed(2)}°` : '--'}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {drone.latitude && drone.longitude ? 
                              `${drone.latitude.toFixed(4)}, ${drone.longitude.toFixed(4)}` : 
                              'No Position'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      
                      {drone.currentMissionId && (
                        <div className="mt-3 p-2 bg-primary/10 rounded text-xs flex items-center gap-2">
                          <Radio className="h-3 w-3 text-primary animate-pulse" />
                          <span>Mission #{drone.currentMissionId} Active</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
