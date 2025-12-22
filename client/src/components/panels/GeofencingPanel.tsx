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
  Pencil, 
  MapPin, 
  Navigation, 
  Search, 
  Trash2, 
  Plus, 
  CheckCircle,
  MousePointer,
  Undo2,
  Map,
  Satellite,
  Moon,
  Locate
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { MapContainer, TileLayer, Circle as LeafletCircle, Polygon, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GeofenceZone {
  id: string;
  name: string;
  type: "circle" | "custom" | "polygon"; // "polygon" kept for legacy compatibility
  enabled: boolean;
  action: "rtl" | "land" | "hover" | "warn";
  center?: { lat: number; lng: number };
  radius?: number;
  points?: { lat: number; lng: number }[];
  maxAltitude?: number;
  minAltitude?: number;
}

// Helper to check if zone is a custom/polygon type (for legacy compatibility)
const isCustomZone = (type: string) => type === "custom" || type === "polygon";

// Default location - Burlington, NC
const DEFAULT_LAT = 36.0957;
const DEFAULT_LNG = -79.4378;

const defaultZones: GeofenceZone[] = [
  {
    id: "home_zone",
    name: "Home Base Perimeter",
    type: "circle",
    enabled: true,
    action: "rtl",
    center: { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
    radius: 500,
    maxAltitude: 120,
    minAltitude: 0
  }
];

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function MapClickHandler({ 
  editMode, 
  onCircleCenter, 
  onAddPoint 
}: { 
  editMode: "circle" | "custom";
  onCircleCenter: (lat: number, lng: number) => void;
  onAddPoint: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (e) => {
      if (editMode === "circle") {
        onCircleCenter(e.latlng.lat, e.latlng.lng);
      } else {
        onAddPoint(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

function MapCenterOnZone({ center }: { center?: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], 15);
    }
  }, [center, map]);
  return null;
}

export function GeofencingPanel() {
  const [zones, setZones] = useState<GeofenceZone[]>(() => {
    const saved = localStorage.getItem('mouse_geofence_zones');
    return saved ? JSON.parse(saved) : defaultZones;
  });
  const [selectedZone, setSelectedZone] = useState<GeofenceZone | null>(null);
  const [editMode, setEditMode] = useState<"circle" | "custom">("circle");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const [newZone, setNewZone] = useState({
    name: "",
    lat: "",
    lng: "",
    radius: "500",
    maxAltitude: "120",
    minAltitude: "0",
    action: "rtl" as const
  });

  const [drawingPoints, setDrawingPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
  const [mapStyle, setMapStyle] = useState<"standard" | "dark" | "satellite">("standard");

  // Get user's actual GPS location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMapCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.log("Using default location")
      );
    }
  }, []);

  // Map tile configurations
  const mapTiles = {
    standard: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    },
    dark: {
      url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>'
    }
  };

  const goToCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setMapCenter({ lat, lng });
          toast.success("Map centered on your current location");
        },
        () => toast.error("Could not get current location")
      );
    }
  };

  useEffect(() => {
    localStorage.setItem('mouse_geofence_zones', JSON.stringify(zones));
    window.dispatchEvent(new CustomEvent('geofence-updated'));
  }, [zones]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      if (response.ok) {
        const results = await response.json();
        if (results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lng = parseFloat(results[0].lon);
          setNewZone(prev => ({
            ...prev,
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
            name: prev.name || results[0].display_name.split(',')[0]
          }));
          setMapCenter({ lat, lng });
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
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setNewZone(prev => ({
            ...prev,
            lat: lat.toFixed(6),
            lng: lng.toFixed(6)
          }));
          setMapCenter({ lat, lng });
          toast.success("Current location captured");
        },
        () => toast.error("Could not get current location")
      );
    }
  };

  const handleCircleCenter = useCallback((lat: number, lng: number) => {
    if (!isDrawing) return;
    setNewZone(prev => ({
      ...prev,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6)
    }));
    toast.success("Center point set - adjust radius below");
  }, [isDrawing]);

  const handleAddPoint = useCallback((lat: number, lng: number) => {
    if (!isDrawing) return;
    setDrawingPoints(prev => [...prev, { lat, lng }]);
    toast.success(`Point ${drawingPoints.length + 1} added`);
  }, [isDrawing, drawingPoints.length]);

  const undoLastPoint = () => {
    setDrawingPoints(prev => prev.slice(0, -1));
  };

  const startDrawing = () => {
    setIsDrawing(true);
    setDrawingPoints([]);
    if (editMode === "circle") {
      toast.info("Click on the map to set the circle center");
    } else {
      toast.info("Click on the map to add boundary points. Click 'Finish' when done.");
    }
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setDrawingPoints([]);
  };

  const createZone = () => {
    const lat = parseFloat(newZone.lat);
    const lng = parseFloat(newZone.lng);
    const radius = parseFloat(newZone.radius);
    
    if (!newZone.name) {
      toast.error("Please enter a zone name");
      return;
    }

    if (editMode === "circle") {
      if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
        toast.error("Please set a center point and radius");
        return;
      }

      const zone: GeofenceZone = {
        id: Date.now().toString(),
        name: newZone.name,
        type: "circle",
        enabled: true,
        action: newZone.action,
        center: { lat, lng },
        radius: radius,
        maxAltitude: parseFloat(newZone.maxAltitude) || 120,
        minAltitude: parseFloat(newZone.minAltitude) || 0
      };

      setZones(prev => [...prev, zone]);
      toast.success(`Circular geofence "${zone.name}" created`);
    } else {
      if (drawingPoints.length < 3) {
        toast.error("Please add at least 3 points to create a custom boundary");
        return;
      }

      const zone: GeofenceZone = {
        id: Date.now().toString(),
        name: newZone.name,
        type: "custom",
        enabled: true,
        action: newZone.action,
        points: drawingPoints,
        maxAltitude: parseFloat(newZone.maxAltitude) || 120,
        minAltitude: parseFloat(newZone.minAltitude) || 0
      };

      setZones(prev => [...prev, zone]);
      toast.success(`Custom geofence "${zone.name}" created with ${drawingPoints.length} points`);
    }

    // Reset form
    setNewZone({ name: "", lat: "", lng: "", radius: "500", maxAltitude: "120", minAltitude: "0", action: "rtl" });
    setDrawingPoints([]);
    setIsDrawing(false);
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

  const previewCenter = newZone.lat && newZone.lng ? { lat: parseFloat(newZone.lat), lng: parseFloat(newZone.lng) } : null;
  const previewRadius = parseFloat(newZone.radius) || 500;

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Left - Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={14}
          className="h-full w-full"
          style={{ background: '#1a1a2e' }}
        >
          <TileLayer
            key={mapStyle}
            attribution={mapTiles[mapStyle].attribution}
            url={mapTiles[mapStyle].url}
          />
          
          <MapCenterOnZone center={mapCenter} />
          
          {isDrawing && (
            <MapClickHandler
              editMode={editMode}
              onCircleCenter={handleCircleCenter}
              onAddPoint={handleAddPoint}
            />
          )}

          {/* Existing zones */}
          {zones.map(zone => {
            if (zone.type === "circle" && zone.center && zone.radius) {
              return (
                <LeafletCircle
                  key={zone.id}
                  center={[zone.center.lat, zone.center.lng]}
                  radius={zone.radius}
                  pathOptions={{
                    color: zone.enabled ? '#22c55e' : '#6b7280',
                    fillColor: zone.enabled ? '#22c55e' : '#6b7280',
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: zone.id === selectedZone?.id ? undefined : '5, 5'
                  }}
                />
              );
            } else if (isCustomZone(zone.type) && zone.points && zone.points.length >= 3) {
              return (
                <Polygon
                  key={zone.id}
                  positions={zone.points.map(p => [p.lat, p.lng] as [number, number])}
                  pathOptions={{
                    color: zone.enabled ? '#22c55e' : '#6b7280',
                    fillColor: zone.enabled ? '#22c55e' : '#6b7280',
                    fillOpacity: 0.2,
                    weight: 2,
                    dashArray: zone.id === selectedZone?.id ? undefined : '5, 5'
                  }}
                />
              );
            }
            return null;
          })}

          {/* Preview circle while editing */}
          {editMode === "circle" && previewCenter && (
            <LeafletCircle
              center={[previewCenter.lat, previewCenter.lng]}
              radius={previewRadius}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '10, 5'
              }}
            />
          )}

          {/* Preview markers for custom shape */}
          {editMode === "custom" && drawingPoints.map((point, idx) => (
            <Marker
              key={idx}
              position={[point.lat, point.lng]}
            />
          ))}

          {/* Preview polygon while drawing */}
          {editMode === "custom" && drawingPoints.length >= 3 && (
            <Polygon
              positions={drawingPoints.map(p => [p.lat, p.lng] as [number, number])}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '10, 5'
              }}
            />
          )}
        </MapContainer>

        {/* Map overlay instructions */}
        {isDrawing && (
          <div className="absolute top-4 left-4 right-4 z-[1000]">
            <Card className="bg-background/95 backdrop-blur">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MousePointer className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      {editMode === "circle" 
                        ? "Click to set circle center" 
                        : `Click to add points (${drawingPoints.length} added)`}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {editMode === "custom" && drawingPoints.length > 0 && (
                      <Button size="sm" variant="outline" onClick={undoLastPoint}>
                        <Undo2 className="h-3 w-3 mr-1" />
                        Undo
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={cancelDrawing}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Map style controls */}
        <div className="absolute bottom-4 left-4 z-[1000] flex gap-2">
          <div className="bg-background/95 backdrop-blur rounded-lg border border-border p-1 flex gap-1">
            <Button
              size="sm"
              variant={mapStyle === "standard" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setMapStyle("standard")}
              title="Standard Map"
              data-testid="button-map-standard"
            >
              <Map className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={mapStyle === "dark" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setMapStyle("dark")}
              title="Dark Mode"
              data-testid="button-map-dark"
            >
              <Moon className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={mapStyle === "satellite" ? "default" : "ghost"}
              className="h-8 px-2"
              onClick={() => setMapStyle("satellite")}
              title="Satellite View"
              data-testid="button-map-satellite"
            >
              <Satellite className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-10 bg-background/95 backdrop-blur border border-border"
            onClick={goToCurrentLocation}
            title="Go to Current Location"
            data-testid="button-current-location"
          >
            <Locate className="h-4 w-4 mr-1" />
            My Location
          </Button>
        </div>
      </div>

      {/* Right - Controls */}
      <div className="w-96 border-l border-border bg-card/50 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Geofencing
              </h2>
              <p className="text-xs text-muted-foreground">Define flight boundaries</p>
            </div>
            <Badge className={zones.some(z => z.enabled) ? "bg-emerald-500" : "bg-gray-500"}>
              {zones.filter(z => z.enabled).length} Active
            </Badge>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Create New Zone */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Create Geofence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs value={editMode} onValueChange={(v) => {
                setEditMode(v as "circle" | "custom");
                setDrawingPoints([]);
                setIsDrawing(false);
              }}>
                <TabsList className="grid grid-cols-2 w-full h-8">
                  <TabsTrigger value="circle" className="text-xs flex items-center gap-1">
                    <Circle className="h-3 w-3" /> Circular
                  </TabsTrigger>
                  <TabsTrigger value="custom" className="text-xs flex items-center gap-1">
                    <Pencil className="h-3 w-3" /> Hand Drawn
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-1">
                <Label className="text-xs">Zone Name</Label>
                <Input 
                  placeholder="e.g., Flight Area Alpha"
                  value={newZone.name}
                  onChange={(e) => setNewZone(prev => ({ ...prev, name: e.target.value }))}
                  className="h-8 text-sm"
                  data-testid="input-zone-name"
                />
              </div>

              {/* Address Search */}
              <div className="space-y-1">
                <Label className="text-xs">Search Location</Label>
                <div className="flex gap-1">
                  <Input 
                    placeholder="Enter address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="h-8 text-sm"
                    data-testid="input-geofence-address"
                  />
                  <Button size="sm" className="h-8 px-2" onClick={handleSearch} disabled={isSearching}>
                    <Search className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2" onClick={useCurrentLocation}>
                    <Navigation className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Drawing controls */}
              {!isDrawing ? (
                <Button className="w-full h-8 text-xs" variant="outline" onClick={startDrawing}>
                  <MousePointer className="h-3 w-3 mr-1" />
                  {editMode === "circle" ? "Click Map to Set Center" : "Start Drawing Boundary"}
                </Button>
              ) : (
                <div className="p-2 bg-primary/10 border border-primary/30 rounded text-xs text-center">
                  {editMode === "circle" 
                    ? "Click on the map to set center point"
                    : `Drawing mode active - ${drawingPoints.length} points added`}
                </div>
              )}

              {editMode === "circle" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Latitude</Label>
                      <Input 
                        type="number" 
                        step="any"
                        value={newZone.lat}
                        onChange={(e) => setNewZone(prev => ({ ...prev, lat: e.target.value }))}
                        className="h-8 text-xs"
                        data-testid="input-geofence-lat"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Longitude</Label>
                      <Input 
                        type="number" 
                        step="any"
                        value={newZone.lng}
                        onChange={(e) => setNewZone(prev => ({ ...prev, lng: e.target.value }))}
                        className="h-8 text-xs"
                        data-testid="input-geofence-lng"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Radius (meters)</Label>
                    <Input 
                      type="number"
                      value={newZone.radius}
                      onChange={(e) => setNewZone(prev => ({ ...prev, radius: e.target.value }))}
                      className="h-8 text-sm"
                      data-testid="input-geofence-radius"
                    />
                  </div>
                </>
              )}

              {editMode === "custom" && drawingPoints.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {drawingPoints.length} points defined
                  {drawingPoints.length < 3 && " (need at least 3)"}
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Max Alt (m)</Label>
                  <Input 
                    type="number"
                    value={newZone.maxAltitude}
                    onChange={(e) => setNewZone(prev => ({ ...prev, maxAltitude: e.target.value }))}
                    className="h-8 text-sm"
                    data-testid="input-new-max-altitude"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min Alt (m)</Label>
                  <Input 
                    type="number"
                    value={newZone.minAltitude}
                    onChange={(e) => setNewZone(prev => ({ ...prev, minAltitude: e.target.value }))}
                    className="h-8 text-sm"
                    data-testid="input-new-min-altitude"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Breach Action</Label>
                <Select 
                  value={newZone.action}
                  onValueChange={(v) => setNewZone(prev => ({ ...prev, action: v as "rtl" }))}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid="select-new-breach-action">
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
                <Plus className="h-4 w-4 mr-1" />
                Create Geofence
              </Button>
            </CardContent>
          </Card>

          {/* Zone List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Active Geofences</CardTitle>
              <CardDescription className="text-xs">Click to select, toggle to enable/disable</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {zones.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">No geofences defined</p>
                </div>
              ) : (
                zones.map(zone => (
                  <div 
                    key={zone.id}
                    className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedZone?.id === zone.id 
                        ? "border-primary bg-primary/10" 
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedZone(zone);
                      if (zone.center) {
                        setMapCenter(zone.center);
                      } else if (zone.points && zone.points.length > 0) {
                        setMapCenter(zone.points[0]);
                      }
                    }}
                    data-testid={`geofence-zone-${zone.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {zone.type === "circle" ? (
                          <Circle className="h-3 w-3 text-primary" />
                        ) : (
                          <Pencil className="h-3 w-3 text-primary" />
                        )}
                        <span className="font-medium text-sm">{zone.name}</span>
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
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {zone.type === "circle" && zone.center && (
                        <span>Radius: {zone.radius}m</span>
                      )}
                      {isCustomZone(zone.type) && zone.points && (
                        <span>{zone.points.length} boundary points</span>
                      )}
                      {zone.maxAltitude && <span className="ml-2">| Max: {zone.maxAltitude}m</span>}
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
                  <CardTitle className="text-sm">{selectedZone.name}</CardTitle>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => deleteZone(selectedZone.id)}
                    data-testid="button-delete-geofence"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Breach Action</Label>
                  <Select 
                    value={selectedZone.action}
                    onValueChange={(v) => updateZoneAction(selectedZone.id, v as GeofenceZone["action"])}
                  >
                    <SelectTrigger className="h-8 text-sm" data-testid="select-breach-action">
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Max Alt (m)</Label>
                    <Input 
                      type="number" 
                      value={selectedZone.maxAltitude || ""} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setZones(prev => prev.map(z => 
                          z.id === selectedZone.id ? { ...z, maxAltitude: val } : z
                        ));
                        setSelectedZone(prev => prev ? { ...prev, maxAltitude: val } : null);
                      }}
                      className="h-8 text-sm"
                      data-testid="input-max-altitude"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Alt (m)</Label>
                    <Input 
                      type="number" 
                      value={selectedZone.minAltitude || ""} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setZones(prev => prev.map(z => 
                          z.id === selectedZone.id ? { ...z, minAltitude: val } : z
                        ));
                        setSelectedZone(prev => prev ? { ...prev, minAltitude: val } : null);
                      }}
                      className="h-8 text-sm"
                      data-testid="input-min-altitude"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info card */}
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  When the drone crosses a boundary, the configured action will be automatically executed.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
