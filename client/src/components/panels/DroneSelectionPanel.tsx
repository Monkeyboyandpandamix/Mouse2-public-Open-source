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
  RefreshCw,
  X,
  Eye
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Drone } from "@shared/schema";
import { usePermissions } from "@/hooks/usePermissions";
import { getRuntimePlatform, getSerialPortOptions } from "@/lib/platform";

interface DroneSelectionPanelProps {
  onDroneSelected: (drone: Drone) => void;
  onSkipPreview?: () => void;
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

export function DroneSelectionPanel({ onDroneSelected, onSkipPreview }: DroneSelectionPanelProps) {
  const queryClient = useQueryClient();
  const { hasPermission, isAdmin } = usePermissions();
  const canManageDrones = hasPermission('system_settings') || isAdmin();
  const runtimePlatform = getRuntimePlatform();
  const serialPortOptions = getSerialPortOptions(runtimePlatform);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDrone, setEditingDrone] = useState<Drone | null>(null);
  const [showSkipButton, setShowSkipButton] = useState(true);
  const [newDrone, setNewDrone] = useState({
    name: "",
    callsign: "",
    model: "M.O.U.S.E",
    connectionType: "mavlink",
    connectionString: "",
    motorCount: 4,
    hasGripper: true,
    hasCamera: true,
    hasThermal: true,
    hasLidar: true,
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
        model: "M.O.U.S.E",
        connectionType: "mavlink",
        connectionString: "",
        motorCount: 4,
        hasGripper: true,
        hasCamera: true,
        hasThermal: true,
        hasLidar: true,
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
    mutationFn: async (id: string) => {
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

  const updateDroneMutation = useMutation({
    mutationFn: async (drone: Partial<Drone> & { id: string }) => {
      const res = await fetch(`/api/drones/${drone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drone),
      });
      if (!res.ok) throw new Error("Failed to update drone");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drones"] });
      setShowEditDialog(false);
      setEditingDrone(null);
      toast.success("Drone updated successfully");
    },
    onError: () => {
      toast.error("Failed to update drone");
    },
  });

  const handleEditDrone = (drone: Drone, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDrone(drone);
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editingDrone) return;
    updateDroneMutation.mutate(editingDrone);
  };

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4 relative">
      {/* Skip/Preview Button */}
      {showSkipButton && onSkipPreview && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSkipPreview}
            className="bg-background/80 backdrop-blur-sm border-primary/30 hover:border-primary"
            data-testid="button-skip-preview"
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview Control Page
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 bg-background/80 backdrop-blur-sm"
            onClick={() => setShowSkipButton(false)}
            data-testid="button-hide-skip"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      
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
          
          {canManageDrones && (
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
                        <SelectItem value="M.O.U.S.E">M.O.U.S.E Drone</SelectItem>
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

                <div className="space-y-3">
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
                        placeholder={
                          newDrone.connectionType === "mavlink" 
                            ? "udp:192.168.1.100:14550" 
                            : "connection string"
                        }
                        value={newDrone.connectionString}
                        onChange={(e) => setNewDrone({ ...newDrone, connectionString: e.target.value })}
                        data-testid="input-connection-string"
                      />
                    </div>
                  </div>
                  
	                  {newDrone.connectionType === "mavlink" && (
	                    <div className="space-y-3">
	                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-emerald-400 text-xs">Auto-Detect MAVLink</p>
                          <Button 
                            variant="outline" 
                            size="sm"
	                            onClick={(e) => {
	                              e.preventDefault();
	                              toast.info("Scanning for MAVLink devices...");
	                              setTimeout(() => {
	                                const detectedPorts = serialPortOptions.slice(0, 2).map((option, index) => ({
	                                  port: option.value,
	                                  name: index === 0 ? "Flight Controller" : "Telemetry Radio",
	                                }));
	                                if (detectedPorts.length > 0) {
	                                  setNewDrone((prev) => ({ ...prev, connectionString: `serial:${detectedPorts[0].port}:57600` }));
	                                  toast.success(`Found: ${detectedPorts[0].name} on ${detectedPorts[0].port}`);
	                                } else {
	                                  toast.error("No MAVLink devices found");
                                }
                              }, 1500);
                            }}
                            data-testid="button-scan-mavlink"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Scan
                          </Button>
                        </div>
	                        <p className="text-muted-foreground text-[10px]">
	                          Typical serial ports: <span className="font-mono text-emerald-300">{serialPortOptions[0]?.value}</span>{serialPortOptions[1]?.value ? <> or <span className="font-mono text-emerald-300">{serialPortOptions[1].value}</span></> : null}
	                        </p>
	                      </div>
	                      
	                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-2">
	                        <p className="font-semibold text-blue-400">Manual Connection Guide:</p>
	                        <ul className="space-y-1 text-muted-foreground">
	                          <li>• <span className="font-mono text-blue-300">serial:{serialPortOptions[0]?.value || "/dev/ttyACM0"}:57600</span> - USB serial</li>
	                          <li>• <span className="font-mono text-blue-300">udp:IP:14550</span> - Network connection</li>
	                          <li>• <span className="font-mono text-blue-300">tcp:IP:5760</span> - TCP connection</li>
	                        </ul>
                        <p className="text-muted-foreground mt-2">
                          For Pi hotspot: <span className="font-mono text-blue-300">udp:10.42.0.1:14550</span>
                        </p>
                      </div>
                    </div>
                  )}
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
          )}
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
              {canManageDrones && (
                <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-first-drone">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Drone
                </Button>
              )}
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
                          {canManageDrones && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => handleEditDrone(drone, e)}
                                data-testid={`button-edit-drone-${drone.id}`}
                              >
                                <Settings className="h-4 w-4 text-muted-foreground" />
                              </Button>
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
                            </>
                          )}
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

        {/* Edit Drone Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Drone: {editingDrone?.name}</DialogTitle>
              <DialogDescription>Modify hardware features and settings for this drone</DialogDescription>
            </DialogHeader>
            
            {editingDrone && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Drone Name</Label>
                    <Input
                      value={editingDrone.name}
                      onChange={(e) => setEditingDrone({ ...editingDrone, name: e.target.value })}
                      data-testid="input-edit-drone-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Connection String</Label>
                    <Input
                      value={editingDrone.connectionString || ""}
                      onChange={(e) => setEditingDrone({ ...editingDrone, connectionString: e.target.value })}
                      placeholder="udp:192.168.1.100:14550"
                      data-testid="input-edit-connection-string"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Motor Count</Label>
                    <Select 
                      value={editingDrone.motorCount?.toString() || "4"} 
                      onValueChange={(value) => setEditingDrone({ ...editingDrone, motorCount: parseInt(value) })}
                    >
                      <SelectTrigger data-testid="select-edit-motor-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4 Motors</SelectItem>
                        <SelectItem value="6">6 Motors</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Speed (m/s)</Label>
                    <Input
                      type="number"
                      value={editingDrone.maxSpeed || 15}
                      onChange={(e) => setEditingDrone({ ...editingDrone, maxSpeed: parseFloat(e.target.value) || 15 })}
                      data-testid="input-edit-max-speed"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Altitude (m)</Label>
                    <Input
                      type="number"
                      value={editingDrone.maxAltitude || 120}
                      onChange={(e) => setEditingDrone({ ...editingDrone, maxAltitude: parseFloat(e.target.value) || 120 })}
                      data-testid="input-edit-max-altitude"
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
                        variant={(editingDrone as any)[key] ? "default" : "outline"}
                        size="sm"
                        onClick={() => setEditingDrone({ ...editingDrone, [key]: !(editingDrone as any)[key] })}
                        data-testid={`button-edit-toggle-${key}`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs">
                  <p className="font-semibold text-amber-400 mb-1">Auto Sensor Detection</p>
                  <p className="text-muted-foreground">
                    When connected via MAVLink, the system will automatically detect available sensors 
                    from the flight controller's SYS_STATUS message and update hardware features accordingly.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={updateDroneMutation.isPending} data-testid="button-confirm-edit-drone">
                {updateDroneMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
