import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUp, Navigation, Gauge, Thermometer, Zap, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AttitudeIndicator } from "./AttitudeIndicator";
import { GyroscopeIndicator } from "./GyroscopeIndicator";
import { useState, useEffect } from "react";

interface MotorTelemetry {
  motor1Rpm: number;
  motor2Rpm: number;
  motor3Rpm: number;
  motor4Rpm: number;
  motor1Temp: number;
  motor2Temp: number;
  motor3Temp: number;
  motor4Temp: number;
  motor1Current: number;
  motor2Current: number;
  motor3Current: number;
  motor4Current: number;
  escTemp: number;
}

export function TelemetryPanel() {
  const { data: motorTelemetry } = useQuery<MotorTelemetry[]>({
    queryKey: ["/api/motor-telemetry/recent"],
    refetchInterval: 1000,
  });

  const latestMotor = motorTelemetry?.[0];

  const [attitude, setAttitude] = useState({ pitch: -2, roll: 0, yaw: 0 });
  const [heading, setHeading] = useState(315);

  useEffect(() => {
    const interval = setInterval(() => {
      setAttitude(prev => ({
        pitch: prev.pitch + (Math.random() - 0.5) * 2,
        roll: prev.roll + (Math.random() - 0.5) * 2,
        yaw: (prev.yaw + 0.5) % 360,
      }));
      setHeading(prev => (prev + 0.2) % 360);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="w-80 h-full border-l border-border rounded-none bg-card/80 backdrop-blur-md overflow-hidden flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Gauge className="h-4 w-4" /> Telemetry Data
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <Tabs defaultValue="flight" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 mx-4">
            <TabsTrigger value="flight" className="text-xs">Flight</TabsTrigger>
            <TabsTrigger value="motors" className="text-xs">Motors</TabsTrigger>
            <TabsTrigger value="sensors" className="text-xs">Sensors</TabsTrigger>
          </TabsList>

          <TabsContent value="flight" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
            {/* Attitude & Gyro Indicators */}
            <div className="flex justify-center gap-4 py-2">
              <div className="text-center">
                <AttitudeIndicator pitch={attitude.pitch} roll={attitude.roll} size={100} />
                <p className="text-[10px] text-muted-foreground mt-6">ATTITUDE</p>
              </div>
              <div className="text-center">
                <GyroscopeIndicator yaw={attitude.yaw} heading={heading} size={100} />
                <p className="text-[10px] text-muted-foreground mt-6">HEADING</p>
              </div>
            </div>

            <Separator />

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

            {/* Attitude Values */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted/20 rounded border border-border/50">
                <div className="text-xs text-muted-foreground">PITCH</div>
                <div className="font-mono text-lg text-foreground">{attitude.pitch.toFixed(1)}°</div>
              </div>
              <div className="p-2 bg-muted/20 rounded border border-border/50">
                <div className="text-xs text-muted-foreground">ROLL</div>
                <div className="font-mono text-lg text-foreground">{attitude.roll.toFixed(1)}°</div>
              </div>
              <div className="p-2 bg-muted/20 rounded border border-border/50">
                <div className="text-xs text-muted-foreground">YAW</div>
                <div className="font-mono text-lg text-foreground">{attitude.yaw.toFixed(0)}°</div>
              </div>
            </div>

            <Separator />

            {/* GPS & Navigation */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                  <Navigation className="h-3 w-3" /> Heading
                </span>
                <span className="font-mono text-primary">NW {heading.toFixed(0)}°</span>
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

            {/* Position Data */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground uppercase font-bold">Position</span>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lat:</span>
                  <span className="text-foreground">34.052235°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lon:</span>
                  <span className="text-foreground">-118.243683°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GPS Fix:</span>
                  <span className="text-emerald-500">3D FIX</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="motors" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Zap className="h-3 w-3" /> Motor RPM
              </span>
              
              {[1, 2, 3, 4].map((motor) => {
                const rpm = latestMotor?.[`motor${motor}Rpm` as keyof MotorTelemetry] ?? (3200 + motor * 100);
                return (
                  <div key={motor} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Motor {motor}</span>
                      <span className="font-mono text-primary">{rpm} RPM</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${Math.min((Number(rpm) / 5000) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Thermometer className="h-3 w-3" /> Motor Temps
              </span>
              
              {[1, 2, 3, 4].map((motor) => {
                const temp = latestMotor?.[`motor${motor}Temp` as keyof MotorTelemetry] ?? (45 + motor);
                return (
                  <div key={motor} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Motor {motor}</span>
                      <span className="font-mono text-amber-500">{temp}°C</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500" 
                        style={{ width: `${Math.min((Number(temp) / 80) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Activity className="h-3 w-3" /> Current Draw
              </span>
              
              {[1, 2, 3, 4].map((motor) => {
                const current = latestMotor?.[`motor${motor}Current` as keyof MotorTelemetry] ?? (8 + motor * 0.5);
                return (
                  <div key={motor} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Motor {motor}</span>
                      <span className="font-mono text-emerald-500">{current}A</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500" 
                        style={{ width: `${Math.min((Number(current) / 20) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="sensors" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
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
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Thermometer className="h-3 w-3" /> ESC Temp
                  </span>
                  <span className="font-mono text-amber-500">{latestMotor?.escTemp ?? 48}°C</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 w-[48%]" />
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

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold">Additional Sensors</span>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between p-2 bg-muted/20 rounded">
                  <span className="text-muted-foreground">Barometer</span>
                  <span className="font-mono text-foreground">1013.25 hPa</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/20 rounded">
                  <span className="text-muted-foreground">IMU Status</span>
                  <span className="font-mono text-emerald-500">HEALTHY</span>
                </div>
                <div className="flex justify-between p-2 bg-muted/20 rounded">
                  <span className="text-muted-foreground">Compass</span>
                  <span className="font-mono text-emerald-500">CALIBRATED</span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
