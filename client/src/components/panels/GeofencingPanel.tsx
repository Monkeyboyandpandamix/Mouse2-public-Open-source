import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, 
  Circle, 
  Pentagon, 
  MapPin, 
  Navigation, 
  Search, 
  Trash2, 
  Plus, 
  Save,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface GeofenceZone {
  id: string;
  name: string;
  type: "circle" | "polygon";
  enabled: boolean;
  action: "rtl" | "land" | "hover" | "warn";
  center?: { lat: number; lng: number };
  radius?: number;
  points?: { lat: number; lng: number }[];
  maxAltitude?: number;
  minAltitude?: number;
}

const defaultZones: GeofenceZone[] = [
  {
    id: "home_zone",
    name: "Home Base Perimeter",
    type: "circle",
    enabled: true,
    action: "rtl",
    center: { lat: 34.0522, lng: -118.2437 },
    radius: 500,
    maxAltitude: 120,
    minAltitude: 0
  }
];

export function GeofencingPanel() {
  const [zones, setZones] = useState<GeofenceZone[]>(() => {
    const saved = localStorage.getItem('mouse_geofence_zones');
    return saved ? JSON.parse(saved) : defaultZones;
  });
  const [selectedZone, setSelectedZone] = useState<GeofenceZone | null>(null);
  const [editMode, setEditMode] = useState<"circle" | "polygon">("circle");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [newZone, setNewZone] = useState({
    name: "",
    lat: "",
    lng: "",
    radius: "500",
    maxAltitude: "120",
    minAltitude: "0",
    action: "rtl" as const
  });

  useEffect(() => {
    localStorage.setItem('mouse_geofence_zones', JSON.stringify(zones));
    // Dispatch custom event for same-tab updates to MapInterface
    window.dispatchEvent(new CustomEvent('geofence-updated'));
  }, [zones]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const results = await response.json();
        if (results.length > 0) {
          setNewZone(prev => ({
            ...prev,
            lat: results[0].lat,
            lng: results[0].lon,
            name: prev.name || results[0].display_name.split(',')[0]
          }));
          toast.success(`Found: ${results[0].display_name.substring(0, 50)}...`);
        } else {
          toast.error("Location not found");
        }
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setNewZone(prev => ({
            ...prev,
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6)
          }));
          toast.success("Current location captured");
        },
        () => toast.error("Could not get current location")
      );
    }
  };

  const createZone = () => {
    const lat = parseFloat(newZone.lat);
    const lng = parseFloat(newZone.lng);
    const radius = parseFloat(newZone.radius);
    
    if (!newZone.name || isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      toast.error("Please fill in all required fields");
      return;
    }

    const zone: GeofenceZone = {
      id: Date.now().toString(),
      name: newZone.name,
      type: editMode,
      enabled: true,
      action: newZone.action,
      center: { lat, lng },
      radius: editMode === "circle" ? radius : undefined,
      points: editMode === "polygon" ? [{ lat, lng }] : undefined,
      maxAltitude: parseFloat(newZone.maxAltitude) || 120,
      minAltitude: parseFloat(newZone.minAltitude) || 0
    };

    setZones(prev => [...prev, zone]);
    setNewZone({ name: "", lat: "", lng: "", radius: "500", maxAltitude: "120", minAltitude: "0", action: "rtl" });
    toast.success(`Geofence "${zone.name}" created`);
  };

  const deleteZone = (id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
    if (selectedZone?.id === id) setSelectedZone(null);
    toast.success("Geofence deleted");
  };

  const toggleZone = (id: string, enabled: boolean) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, enabled } : z));
    toast.success(enabled ? "Geofence enabled" : "Geofence disabled");
  };

  const updateZoneAction = (id: string, action: GeofenceZone["action"]) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, action } : z));
    toast.success("Breach action updated");
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "rtl": return <Badge className="bg-amber-500">RTL</Badge>;
      case "land": return <Badge className="bg-red-500">Land</Badge>;
      case "hover": return <Badge className="bg-blue-500">Hover</Badge>;
      case "warn": return <Badge className="bg-yellow-500">Warn Only</Badge>;
      default: return <Badge>Unknown</Badge>;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Geofencing
            </h2>
            <p className="text-muted-foreground">Define flight boundaries and breach actions</p>
          </div>
          <Badge className={zones.some(z => z.enabled) ? "bg-emerald-500" : "bg-gray-500"}>
            {zones.filter(z => z.enabled).length} Active Zone(s)
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left - Zone List */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Active Geofences</CardTitle>
                <CardDescription>Click to edit, toggle to enable/disable</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {zones.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No geofences defined</p>
                  </div>
                ) : (
                  zones.map(zone => (
                    <div 
                      key={zone.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedZone?.id === zone.id 
                          ? "border-primary bg-primary/10" 
                          : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedZone(zone)}
                      data-testid={`geofence-zone-${zone.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {zone.type === "circle" ? (
                            <Circle className="h-4 w-4 text-primary" />
                          ) : (
                            <Pentagon className="h-4 w-4 text-primary" />
                          )}
                          <span className="font-medium">{zone.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getActionBadge(zone.action)}
                          <Switch 
                            checked={zone.enabled}
                            onCheckedChange={(checked) => toggleZone(zone.id, checked)}
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`toggle-geofence-${zone.id}`}
                          />
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {zone.type === "circle" && zone.center && (
                          <span>
                            Center: {zone.center.lat.toFixed(4)}, {zone.center.lng.toFixed(4)} | 
                            Radius: {zone.radius}m
                          </span>
                        )}
                        {zone.maxAltitude && <span className="ml-2">| Max Alt: {zone.maxAltitude}m</span>}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Selected Zone Details */}
            {selectedZone && (
              <Card className="border-primary/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{selectedZone.name}</CardTitle>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => deleteZone(selectedZone.id)}
                      data-testid="button-delete-geofence"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Breach Action</Label>
                      <Select 
                        value={selectedZone.action}
                        onValueChange={(v) => updateZoneAction(selectedZone.id, v as GeofenceZone["action"])}
                      >
                        <SelectTrigger data-testid="select-breach-action">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rtl">Return to Launch</SelectItem>
                          <SelectItem value="land">Land Immediately</SelectItem>
                          <SelectItem value="hover">Hover in Place</SelectItem>
                          <SelectItem value="warn">Warning Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Zone Type</Label>
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        {selectedZone.type === "circle" ? (
                          <><Circle className="h-4 w-4" /> Circular</>
                        ) : (
                          <><Pentagon className="h-4 w-4" /> Polygon</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Max Altitude (m)</Label>
                      <Input 
                        type="number" 
                        value={selectedZone.maxAltitude || ""} 
                        onChange={(e) => {
                          setZones(prev => prev.map(z => 
                            z.id === selectedZone.id 
                              ? { ...z, maxAltitude: parseFloat(e.target.value) } 
                              : z
                          ));
                          setSelectedZone(prev => prev ? { ...prev, maxAltitude: parseFloat(e.target.value) } : null);
                        }}
                        data-testid="input-max-altitude"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Min Altitude (m)</Label>
                      <Input 
                        type="number" 
                        value={selectedZone.minAltitude || ""} 
                        onChange={(e) => {
                          setZones(prev => prev.map(z => 
                            z.id === selectedZone.id 
                              ? { ...z, minAltitude: parseFloat(e.target.value) } 
                              : z
                          ));
                          setSelectedZone(prev => prev ? { ...prev, minAltitude: parseFloat(e.target.value) } : null);
                        }}
                        data-testid="input-min-altitude"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right - Create New Zone */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Create New Geofence</CardTitle>
                <CardDescription>Define by address, coordinates, or drag on map</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs value={editMode} onValueChange={(v) => setEditMode(v as "circle" | "polygon")}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="circle" className="flex items-center gap-1">
                      <Circle className="h-4 w-4" /> Circular
                    </TabsTrigger>
                    <TabsTrigger value="polygon" className="flex items-center gap-1">
                      <Pentagon className="h-4 w-4" /> Polygon
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="space-y-2">
                  <Label>Zone Name</Label>
                  <Input 
                    placeholder="e.g., Flight Area Alpha"
                    value={newZone.name}
                    onChange={(e) => setNewZone(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-zone-name"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Set Location by Address</Label>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Enter address or place name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      data-testid="input-geofence-address"
                    />
                    <Button onClick={handleSearch} disabled={isSearching} data-testid="button-search-address">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">— or —</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Set by Coordinates</Label>
                    <Button variant="outline" size="sm" onClick={useCurrentLocation} data-testid="button-use-current-location">
                      <Navigation className="h-3 w-3 mr-1" />
                      Current Location
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Latitude</Label>
                      <Input 
                        type="number" 
                        step="any"
                        placeholder="34.0522"
                        value={newZone.lat}
                        onChange={(e) => setNewZone(prev => ({ ...prev, lat: e.target.value }))}
                        data-testid="input-geofence-lat"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Longitude</Label>
                      <Input 
                        type="number" 
                        step="any"
                        placeholder="-118.2437"
                        value={newZone.lng}
                        onChange={(e) => setNewZone(prev => ({ ...prev, lng: e.target.value }))}
                        data-testid="input-geofence-lng"
                      />
                    </div>
                  </div>
                </div>

                {editMode === "circle" && (
                  <div className="space-y-2">
                    <Label>Radius (meters)</Label>
                    <Input 
                      type="number"
                      placeholder="500"
                      value={newZone.radius}
                      onChange={(e) => setNewZone(prev => ({ ...prev, radius: e.target.value }))}
                      data-testid="input-geofence-radius"
                    />
                  </div>
                )}

                {editMode === "polygon" && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-500">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    Polygon mode: Click points on the map view to define boundary vertices
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Max Altitude (m)</Label>
                    <Input 
                      type="number"
                      value={newZone.maxAltitude}
                      onChange={(e) => setNewZone(prev => ({ ...prev, maxAltitude: e.target.value }))}
                      data-testid="input-new-max-altitude"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Altitude (m)</Label>
                    <Input 
                      type="number"
                      value={newZone.minAltitude}
                      onChange={(e) => setNewZone(prev => ({ ...prev, minAltitude: e.target.value }))}
                      data-testid="input-new-min-altitude"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Breach Action</Label>
                  <Select 
                    value={newZone.action}
                    onValueChange={(v) => setNewZone(prev => ({ ...prev, action: v as "rtl" }))}
                  >
                    <SelectTrigger data-testid="select-new-breach-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtl">Return to Launch</SelectItem>
                      <SelectItem value="land">Land Immediately</SelectItem>
                      <SelectItem value="hover">Hover in Place</SelectItem>
                      <SelectItem value="warn">Warning Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button className="w-full" onClick={createZone} data-testid="button-create-geofence">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Geofence
                </Button>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-emerald-500">Geofencing Active</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      When the drone approaches or crosses a boundary, the configured action 
                      will be automatically executed to maintain safe operations.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
