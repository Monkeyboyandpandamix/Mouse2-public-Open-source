import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Target, Users, Car, Box, AlertCircle } from "lucide-react";
import { useState } from "react";

export function TrackingPanel() {
  const [trackingActive, setTrackingActive] = useState(false);
  const [targetType, setTargetType] = useState("none");

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
              <Label htmlFor="tracking-toggle" className="text-sm">Tracking</Label>
              <Switch
                id="tracking-toggle"
                checked={trackingActive}
                onCheckedChange={setTrackingActive}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {trackingActive ? (
            <Badge className="bg-emerald-500">TRACKING ACTIVE</Badge>
          ) : (
            <Badge variant="outline">STANDBY</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Selection</CardTitle>
          <CardDescription>Choose what type of object to track</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={targetType === "person" ? "default" : "outline"}
              className="h-20 flex flex-col gap-2"
              onClick={() => setTargetType("person")}
            >
              <Users className="h-6 w-6" />
              <span className="text-xs">Person</span>
            </Button>
            <Button
              variant={targetType === "vehicle" ? "default" : "outline"}
              className="h-20 flex flex-col gap-2"
              onClick={() => setTargetType("vehicle")}
            >
              <Car className="h-6 w-6" />
              <span className="text-xs">Vehicle</span>
            </Button>
            <Button
              variant={targetType === "package" ? "default" : "outline"}
              className="h-20 flex flex-col gap-2"
              onClick={() => setTargetType("package")}
            >
              <Box className="h-6 w-6" />
              <span className="text-xs">Package</span>
            </Button>
            <Button
              variant={targetType === "custom" ? "default" : "outline"}
              className="h-20 flex flex-col gap-2"
              onClick={() => setTargetType("custom")}
            >
              <Target className="h-6 w-6" />
              <span className="text-xs">Custom</span>
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
              <span className="text-sm text-muted-foreground font-mono">75%</span>
            </div>
            <Slider defaultValue={[75]} max={100} step={5} disabled={!trackingActive} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Follow Distance</Label>
              <span className="text-sm text-muted-foreground font-mono">10m</span>
            </div>
            <Slider defaultValue={[10]} max={50} step={1} disabled={!trackingActive} />
          </div>

          <div className="space-y-2">
            <Label>Camera Mode</Label>
            <Select defaultValue="gimbal" disabled={!trackingActive}>
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
            <Switch defaultChecked disabled={!trackingActive} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Maintain line-of-sight</Label>
              <p className="text-xs text-muted-foreground">Adjust altitude to keep target visible</p>
            </div>
            <Switch disabled={!trackingActive} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detection Feed</CardTitle>
          <CardDescription>Currently detected objects in camera view</CardDescription>
        </CardHeader>
        <CardContent>
          {trackingActive ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-primary" />
                  <span className="text-sm font-mono">Vehicle #1</span>
                </div>
                <Badge variant="outline" className="text-xs">98%</Badge>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm font-mono">Person #1</span>
                </div>
                <Badge variant="outline" className="text-xs">87%</Badge>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Tracking disabled
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
