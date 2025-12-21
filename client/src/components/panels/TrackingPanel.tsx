import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Users, Car, Box, AlertCircle, MapPin, Search, Crosshair, Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DetectedObject {
  id: string;
  type: string;
  confidence: number;
  locked: boolean;
}

export function TrackingPanel() {
  const [trackingActive, setTrackingActive] = useState(false);
  const [targetType, setTargetType] = useState("none");
  const [targetMethod, setTargetMethod] = useState<"map" | "address" | "camera">("camera");
  const [targetAddress, setTargetAddress] = useState("");
  const [confidenceThreshold, setConfidenceThreshold] = useState([75]);
  const [followDistance, setFollowDistance] = useState([10]);
  const [lockedTarget, setLockedTarget] = useState<string | null>(null);

  const [detectedObjects] = useState<DetectedObject[]>([
    { id: "v1", type: "vehicle", confidence: 98, locked: false },
    { id: "p1", type: "person", confidence: 87, locked: false },
    { id: "p2", type: "person", confidence: 72, locked: false },
  ]);

  const handleLockTarget = (objectId: string) => {
    if (lockedTarget === objectId) {
      setLockedTarget(null);
      toast.info("Target unlocked");
    } else {
      setLockedTarget(objectId);
      toast.success("Target locked for tracking");
    }
  };

  const handleAddressSearch = async () => {
    if (!targetAddress.trim()) {
      toast.error("Please enter an address");
      return;
    }
    toast.success(`Searching for: ${targetAddress}`);
  };

  const handleStartTracking = () => {
    if (!lockedTarget && targetMethod === "camera") {
      toast.error("Please lock a target first");
      return;
    }
    setTrackingActive(true);
    toast.success("Object tracking activated");
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
    <div className="h-full overflow-y-auto p-6 bg-background space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-sans">Object Tracking</h2>
        <p className="text-muted-foreground">Computer vision based target tracking and following</p>
      </div>

      <Card className="border-2 border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Tracking Status
              </CardTitle>
              <CardDescription>Enable autonomous target tracking</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {trackingActive ? (
                <Button variant="destructive" size="sm" onClick={() => setTrackingActive(false)}>
                  Stop Tracking
                </Button>
              ) : (
                <Button size="sm" onClick={handleStartTracking}>
                  Start Tracking
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {trackingActive ? (
              <Badge className="bg-emerald-500">TRACKING ACTIVE</Badge>
            ) : (
              <Badge variant="outline">STANDBY</Badge>
            )}
            {lockedTarget && (
              <Badge className="bg-primary">TARGET: {lockedTarget.toUpperCase()}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Selection Method</CardTitle>
          <CardDescription>Choose how to select tracking target</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={targetMethod} onValueChange={(v) => setTargetMethod(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="camera">
                <Crosshair className="h-4 w-4 mr-2" />
                Camera Feed
              </TabsTrigger>
              <TabsTrigger value="map">
                <MapPin className="h-4 w-4 mr-2" />
                Click on Map
              </TabsTrigger>
              <TabsTrigger value="address">
                <Search className="h-4 w-4 mr-2" />
                Enter Address
              </TabsTrigger>
            </TabsList>

            <TabsContent value="camera" className="mt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Select a target from the detected objects below, then click "Lock" to begin tracking.
              </p>
            </TabsContent>

            <TabsContent value="map" className="mt-4">
              <div className="bg-muted/50 border border-dashed border-border rounded-lg p-8 text-center">
                <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click on the map to set tracking destination
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  The drone will fly to and orbit the selected location
                </p>
              </div>
            </TabsContent>

            <TabsContent value="address" className="mt-4 space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter address or coordinates..."
                  value={targetAddress}
                  onChange={(e) => setTargetAddress(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAddressSearch}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Examples: "123 Main St, City" or "34.0522, -118.2437"
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Type Filter</CardTitle>
          <CardDescription>Choose what type of object to track</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={targetType === "person" ? "default" : "outline"}
              className="h-16 flex flex-col gap-1"
              onClick={() => setTargetType("person")}
            >
              <Users className="h-5 w-5" />
              <span className="text-xs">Person</span>
            </Button>
            <Button
              variant={targetType === "vehicle" ? "default" : "outline"}
              className="h-16 flex flex-col gap-1"
              onClick={() => setTargetType("vehicle")}
            >
              <Car className="h-5 w-5" />
              <span className="text-xs">Vehicle</span>
            </Button>
            <Button
              variant={targetType === "package" ? "default" : "outline"}
              className="h-16 flex flex-col gap-1"
              onClick={() => setTargetType("package")}
            >
              <Box className="h-5 w-5" />
              <span className="text-xs">Package</span>
            </Button>
            <Button
              variant={targetType === "all" ? "default" : "outline"}
              className="h-16 flex flex-col gap-1"
              onClick={() => setTargetType("all")}
            >
              <Target className="h-5 w-5" />
              <span className="text-xs">All Objects</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracking Parameters</CardTitle>
          <CardDescription>Configure detection and following behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Confidence Threshold</Label>
              <span className="text-sm text-muted-foreground font-mono">{confidenceThreshold[0]}%</span>
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
              <Label>Follow Distance</Label>
              <span className="text-sm text-muted-foreground font-mono">{followDistance[0]}m</span>
            </div>
            <Slider 
              value={followDistance} 
              onValueChange={setFollowDistance}
              max={50} 
              step={1} 
            />
          </div>

          <div className="space-y-2">
            <Label>Camera Mode</Label>
            <Select defaultValue="gimbal">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gimbal">Gimbal Camera</SelectItem>
                <SelectItem value="thermal">Thermal Camera</SelectItem>
                <SelectItem value="both">Both Cameras</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-center target in frame</Label>
              <p className="text-xs text-muted-foreground">Gimbal follows target automatically</p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Maintain line-of-sight</Label>
              <p className="text-xs text-muted-foreground">Adjust altitude to keep target visible</p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detected Objects</CardTitle>
          <CardDescription>Objects detected in camera view - click to lock target</CardDescription>
        </CardHeader>
        <CardContent>
          {detectedObjects.length > 0 ? (
            <div className="space-y-2">
              {detectedObjects
                .filter(obj => targetType === "all" || targetType === "none" || obj.type === targetType)
                .filter(obj => obj.confidence >= confidenceThreshold[0])
                .map((obj) => (
                  <div
                    key={obj.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                      lockedTarget === obj.id
                        ? "bg-primary/20 border-primary"
                        : "bg-muted/50 border-border hover:bg-muted"
                    }`}
                    onClick={() => handleLockTarget(obj.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded ${lockedTarget === obj.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {getTypeIcon(obj.type)}
                      </div>
                      <div>
                        <span className="font-mono text-sm capitalize">{obj.type} #{obj.id}</span>
                        <div className="text-xs text-muted-foreground">Confidence: {obj.confidence}%</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{obj.confidence}%</Badge>
                      {lockedTarget === obj.id ? (
                        <Lock className="h-4 w-4 text-primary" />
                      ) : (
                        <Unlock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No objects detected
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
