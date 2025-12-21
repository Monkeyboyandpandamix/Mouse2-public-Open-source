import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ArrowUp, Navigation, Gauge, Thermometer } from "lucide-react";

export function TelemetryPanel() {
  return (
    <Card className="w-80 h-full border-l border-border rounded-none bg-card/80 backdrop-blur-md overflow-y-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Gauge className="h-4 w-4" /> Telemetry Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Altitude & Speed */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground uppercase">Altitude (AGL)</span>
            <div className="text-2xl font-mono font-bold text-primary flex items-baseline gap-1">
              45.2 <span className="text-sm text-muted-foreground">m</span>
            </div>
            <Progress value={45} className="h-1 bg-muted" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground uppercase">Ground Speed</span>
            <div className="text-2xl font-mono font-bold text-primary flex items-baseline gap-1">
              12.5 <span className="text-sm text-muted-foreground">m/s</span>
            </div>
            <Progress value={60} className="h-1 bg-muted" />
          </div>
        </div>

        <Separator />

        {/* Attitude Indicators (Text based for now) */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-muted/20 rounded border border-border/50">
            <div className="text-xs text-muted-foreground">PITCH</div>
            <div className="font-mono text-lg text-foreground">-2°</div>
          </div>
          <div className="p-2 bg-muted/20 rounded border border-border/50">
            <div className="text-xs text-muted-foreground">ROLL</div>
            <div className="font-mono text-lg text-foreground">0°</div>
          </div>
          <div className="p-2 bg-muted/20 rounded border border-border/50">
            <div className="text-xs text-muted-foreground">YAW</div>
            <div className="font-mono text-lg text-foreground">145°</div>
          </div>
        </div>

        <Separator />

        {/* GPS & Navigation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase flex items-center gap-1">
              <Navigation className="h-3 w-3" /> Heading
            </span>
            <span className="font-mono text-primary">NW 315°</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase">Dist. to Home</span>
            <span className="font-mono text-foreground">142m</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase">Next Waypoint</span>
            <span className="font-mono text-foreground">WP 3 (45m)</span>
          </div>
        </div>

        <Separator />

        {/* Sensors */}
        <div className="space-y-3">
          <span className="text-xs text-muted-foreground uppercase font-bold">System Health</span>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">LiDAR Range</span>
              <span className="font-mono text-emerald-500">12.4m</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[70%]" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Thermometer className="h-3 w-3" /> CPU Temp
              </span>
              <span className="font-mono text-amber-500">52°C</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 w-[52%]" />
            </div>
          </div>
          
           <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Vibration</span>
              <span className="font-mono text-emerald-500">0.2 G</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[10%]" />
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
