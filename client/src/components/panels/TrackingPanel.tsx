import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Users, Car, Box, AlertCircle, MapPin, Search, Crosshair, Lock, Unlock, Camera, Play, Square, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { MissionMap } from "@/components/map/MissionMap";

interface DetectedObject {
  id: string;
  type: string;
  confidence: number;
  x: number;
  y: number;
}

export function TrackingPanel() {
  const [trackingActive, setTrackingActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [targetType, setTargetType] = useState("all");
  const [targetMethod, setTargetMethod] = useState<"camera" | "map" | "address">("camera");
  const [targetAddress, setTargetAddress] = useState("");
  const [addressResults, setAddressResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState([75]);
  const [followDistance, setFollowDistance] = useState([10]);
  const [lockedTarget, setLockedTarget] = useState<string | null>(null);
  const [targetCoords, setTargetCoords] = useState<{lat: number, lng: number} | null>(null);

  const [detectedObjects] = useState<DetectedObject[]>([
    { id: "v1", type: "vehicle", confidence: 98, x: 120, y: 80 },
    { id: "p1", type: "person", confidence: 87, x: 200, y: 150 },
    { id: "p2", type: "person", confidence: 72, x: 300, y: 200 },
    { id: "v2", type: "vehicle", confidence: 65, x: 50, y: 100 },
  ]);

  const filteredObjects = detectedObjects
    .filter(obj => targetType === "all" || obj.type === targetType)
    .filter(obj => obj.confidence >= confidenceThreshold[0]);

  const handleLockTarget = (objectId: string) => {
    if (lockedTarget === objectId) {
      setLockedTarget(null);
      toast.info("Target unlocked");
    } else {
      setLockedTarget(objectId);
      toast.success("Target locked - ready to track");
    }
  };

  const handleAddressSearch = async () => {
    if (!targetAddress.trim()) {
      toast.error("Please enter an address");
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(targetAddress)}&limit=5`
      );
      const results = await response.json();
      
      if (results.length > 0) {
        setAddressResults(results);
        toast.success(`Found ${results.length} location(s)`);
      } else {
        toast.error("No locations found");
        setAddressResults([]);
      }
    } catch (error) {
      toast.error("Failed to search address");
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddressResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setTargetCoords({ lat, lng });
    setTargetAddress(result.display_name);
    setAddressResults([]);
    toast.success(`Target set to ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setTargetCoords({ lat, lng });
    toast.success(`Target location set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  }, []);

  const handleStartTracking = async () => {
    if (targetMethod === "camera" && !lockedTarget) {
      toast.error("Please lock a target from the camera feed first");
      return;
    }
    
    if ((targetMethod === "map" || targetMethod === "address") && !targetCoords) {
      toast.error("Please set a target location first");
      return;
    }

    setIsStarting(true);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setTrackingActive(true);
    setIsStarting(false);
    toast.success("Tracking activated - drone is following target");
  };

  const handleStopTracking = () => {
    setTrackingActive(false);
    toast.info("Tracking stopped");
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "vehicle": return <Car className="h-4 w-4" />;
      case "person": return <Users className="h-4 w-4" />;
      case "package": return <Box className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left Panel - Controls */}
      <div className="w-96 overflow-y-auto p-4 bg-background space-y-4 border-r border-border">
        <div>
          <h2 className="text-xl font-bold tracking-tight font-sans">Object Tracking</h2>
          <p className="text-sm text-muted-foreground">Computer vision target tracking</p>
        </div>

        <Card className="border-2 border-primary/50">
          <CardHeader className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Tracking Status
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {trackingActive ? (
                  <Badge className="bg-emerald-500 animate-pulse">ACTIVE</Badge>
                ) : (
                  <Badge variant="outline">STANDBY</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex gap-2">
              {trackingActive ? (
                <Button variant="destructive" className="flex-1" onClick={handleStopTracking}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop Tracking
                </Button>
              ) : (
                <Button className="flex-1" onClick={handleStartTracking} disabled={isStarting}>
                  {isStarting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {isStarting ? "Starting..." : "Start Tracking"}
                </Button>
              )}
            </div>
            
            {(lockedTarget || targetCoords) && (
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                {lockedTarget && (
                  <div className="flex items-center gap-2">
                    <Lock className="h-3 w-3 text-primary" />
                    <span>Locked: {lockedTarget.toUpperCase()}</span>
                  </div>
                )}
                {targetCoords && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-primary" />
                    <span>Location: {targetCoords.lat.toFixed(4)}, {targetCoords.lng.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Target Selection Method</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <Tabs value={targetMethod} onValueChange={(v) => setTargetMethod(v as any)}>
              <TabsList className="grid w-full grid-cols-3 h-8">
                <TabsTrigger value="camera" className="text-xs">
                  <Camera className="h-3 w-3 mr-1" />
                  Camera
                </TabsTrigger>
                <TabsTrigger value="map" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  Map
                </TabsTrigger>
                <TabsTrigger value="address" className="text-xs">
                  <Search className="h-3 w-3 mr-1" />
                  Address
                </TabsTrigger>
              </TabsList>

              <TabsContent value="camera" className="mt-2">
                <p className="text-xs text-muted-foreground">
                  Lock a target from detected objects below
                </p>
              </TabsContent>

              <TabsContent value="map" className="mt-2">
                <p className="text-xs text-muted-foreground">
                  Click on the map to set tracking destination
                </p>
              </TabsContent>

              <TabsContent value="address" className="mt-2 space-y-2">
                <div className="flex gap-1">
                  <Input
                    placeholder="Enter address..."
                    value={targetAddress}
                    onChange={(e) => setTargetAddress(e.target.value)}
                    className="flex-1 h-8 text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddressSearch()}
                  />
                  <Button size="sm" className="h-8" onClick={handleAddressSearch} disabled={isSearching}>
                    {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                </div>
                
                {addressResults.length > 0 && (
                  <div className="bg-muted rounded border border-border max-h-24 overflow-y-auto">
                    {addressResults.map((result, idx) => (
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
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Filter by Type</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "all", label: "All", icon: Target },
                { id: "person", label: "Person", icon: Users },
                { id: "vehicle", label: "Vehicle", icon: Car },
                { id: "package", label: "Package", icon: Box },
              ].map((type) => (
                <Button
                  key={type.id}
                  variant={targetType === type.id ? "default" : "outline"}
                  className="h-12 flex flex-col gap-1 p-1"
                  onClick={() => setTargetType(type.id)}
                >
                  <type.icon className="h-4 w-4" />
                  <span className="text-[10px]">{type.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Tracking Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Confidence Threshold</Label>
                <span className="text-xs text-muted-foreground font-mono">{confidenceThreshold[0]}%</span>
              </div>
              <Slider 
                value={confidenceThreshold} 
                onValueChange={setConfidenceThreshold}
                max={100} 
                step={5} 
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Follow Distance</Label>
                <span className="text-xs text-muted-foreground font-mono">{followDistance[0]}m</span>
              </div>
              <Slider 
                value={followDistance} 
                onValueChange={setFollowDistance}
                max={50} 
                step={1} 
              />
            </div>
          </CardContent>
        </Card>

        {targetMethod === "camera" && (
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">Detected Objects ({filteredObjects.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              {filteredObjects.length > 0 ? (
                filteredObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                      lockedTarget === obj.id
                        ? "bg-primary/20 border-primary"
                        : "bg-muted/50 border-border hover:bg-muted"
                    }`}
                    onClick={() => handleLockTarget(obj.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded ${lockedTarget === obj.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {getTypeIcon(obj.type)}
                      </div>
                      <div>
                        <span className="font-mono text-xs capitalize">{obj.type} #{obj.id}</span>
                        <div className="text-[10px] text-muted-foreground">{obj.confidence}% confidence</div>
                      </div>
                    </div>
                    {lockedTarget === obj.id ? (
                      <Lock className="h-4 w-4 text-primary" />
                    ) : (
                      <Unlock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  No objects match filter
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Panel - Map or Camera View */}
      <div className="flex-1 relative">
        {targetMethod === "map" ? (
          <MissionMap
            waypoints={targetCoords ? [{ order: 1, latitude: targetCoords.lat, longitude: targetCoords.lng, altitude: 50 }] : []}
            onMapClick={handleMapClick}
            clickEnabled={true}
            showClickHint={!targetCoords}
          />
        ) : (
          <div className="w-full h-full bg-slate-900 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Camera className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-sm">Camera feed will display here</p>
                <p className="text-xs mt-1">Detected objects shown with bounding boxes</p>
              </div>
            </div>
            
            {/* Simulated detection boxes */}
            {targetMethod === "camera" && filteredObjects.map((obj) => (
              <div
                key={obj.id}
                className={`absolute border-2 rounded pointer-events-none ${
                  lockedTarget === obj.id ? "border-primary" : "border-amber-500"
                }`}
                style={{
                  left: `${obj.x}px`,
                  top: `${obj.y}px`,
                  width: "80px",
                  height: "60px",
                }}
              >
                <div className={`absolute -top-5 left-0 text-[10px] px-1 font-bold ${
                  lockedTarget === obj.id ? "bg-primary text-primary-foreground" : "bg-amber-500 text-black"
                }`}>
                  {obj.type.toUpperCase()} {obj.confidence}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
