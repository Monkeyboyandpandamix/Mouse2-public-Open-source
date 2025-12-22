import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUp, Navigation, Gauge, Thermometer, Zap, Activity, AlertTriangle } from "lucide-react";
import { AttitudeIndicator } from "./AttitudeIndicator";
import { GyroscopeIndicator } from "./GyroscopeIndicator";
import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";

interface MotorData {
  rpm: number;
  temp: number;
  current: number;
  status: 'ok' | 'warning' | 'error';
}

export function TelemetryPanel() {
  const [motorCount, setMotorCount] = useState(() => {
    const saved = localStorage.getItem('mouse_motor_count');
    return saved ? parseInt(saved) : 4;
  });

  const [motors, setMotors] = useState<MotorData[]>([]);

  const [attitude, setAttitude] = useState({ pitch: 0, roll: 0, yaw: 0 });
  const [heading, setHeading] = useState(0);
  
  // Flight state
  const [altitude, setAltitude] = useState(0);
  const [groundSpeed, setGroundSpeed] = useState(0);
  const [flightMode, setFlightMode] = useState<'idle' | 'takeoff' | 'flying' | 'landing' | 'rtl'>('idle');
  // Default location - Burlington, NC
  const [position, setPosition] = useState({ lat: 36.0957, lng: -79.4378 });
  const [homePosition, setHomePosition] = useState({ lat: 36.0957, lng: -79.4378 });
  
  // Get user's actual GPS location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosition(loc);
          setHomePosition(loc);
        },
        () => console.log("Using default telemetry location")
      );
    }
  }, []);
  const [distToHome, setDistToHome] = useState(0);
  
  // Use refs to avoid stale closures
  const positionRef = useRef(position);
  const homePositionRef = useRef(homePosition);
  
  // Keep refs in sync with state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  
  useEffect(() => {
    homePositionRef.current = homePosition;
  }, [homePosition]);
  
  // Calculate distance between two points in meters
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  
  // Track drone arm state - only update telemetry when armed
  const [isArmed, setIsArmed] = useState(() => {
    const saved = localStorage.getItem('mouse_drone_armed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const handleMotorCountChange = (e: CustomEvent) => {
      setMotorCount(e.detail);
    };
    const handleArmStateChange = (e: CustomEvent<{ armed: boolean }>) => {
      setIsArmed(e.detail.armed);
      if (!e.detail.armed) {
        // Reset flight state when disarmed
        setFlightMode('idle');
        setAltitude(0);
        setGroundSpeed(0);
      }
    };
    const handleFlightCommand = (e: CustomEvent<{ command: string; target?: any }>) => {
      const { command, target } = e.detail;
      switch (command) {
        case 'takeoff':
          setFlightMode('takeoff');
          // Set home position when taking off (use ref for current position)
          setHomePosition({ ...positionRef.current });
          break;
        case 'land':
          setFlightMode('landing');
          break;
        case 'rtl':
          setFlightMode('rtl');
          // Use target from RTL command if provided (base location)
          if (target && target.lat && target.lng) {
            setHomePosition({ lat: target.lat, lng: target.lng });
          }
          break;
        case 'abort':
          setFlightMode('idle');
          setAltitude(0);
          setGroundSpeed(0);
          break;
      }
    };
    window.addEventListener('motor-count-changed' as any, handleMotorCountChange);
    window.addEventListener('arm-state-changed' as any, handleArmStateChange);
    window.addEventListener('flight-command' as any, handleFlightCommand);
    return () => {
      window.removeEventListener('motor-count-changed' as any, handleMotorCountChange);
      window.removeEventListener('arm-state-changed' as any, handleArmStateChange);
      window.removeEventListener('flight-command' as any, handleFlightCommand);
    };
  }, []);

  // Initialize motors based on motor count and arm state
  useEffect(() => {
    const newMotors: MotorData[] = [];
    for (let i = 0; i < motorCount; i++) {
      if (isArmed) {
        newMotors.push({
          rpm: 3200 + Math.random() * 400 + i * 50,
          temp: 42 + Math.random() * 8 + i * 2,
          current: 7.5 + Math.random() * 2 + i * 0.3,
          status: 'ok'
        });
      } else {
        newMotors.push({
          rpm: 0,
          temp: 25, // Ambient temp when idle
          current: 0,
          status: 'ok'
        });
      }
    }
    setMotors(newMotors);
  }, [motorCount, isArmed]);

  // Only simulate telemetry updates when drone is armed
  useEffect(() => {
    if (!isArmed) {
      // Reset to idle values when disarmed
      setAttitude({ pitch: 0, roll: 0, yaw: 0 });
      setHeading(0);
      setAltitude(0);
      setGroundSpeed(0);
      setMotors(prev => prev.map(m => ({ ...m, rpm: 0, current: 0 })));
      return;
    }
    
    const interval = setInterval(() => {
      // Update altitude based on flight mode
      setAltitude(prev => {
        switch (flightMode) {
          case 'takeoff':
            if (prev >= 50) {
              setFlightMode('flying');
              return 50;
            }
            return Math.min(50, prev + 2);
          case 'landing':
            if (prev <= 0) {
              setFlightMode('idle');
              return 0;
            }
            return Math.max(0, prev - 1.5);
          case 'rtl':
            // Maintain altitude during RTL, then descend when near home
            if (prev <= 0) return 0;
            return prev;
          case 'flying':
            return Math.max(0, Math.min(100, prev + (Math.random() - 0.5) * 2));
          default:
            return prev;
        }
      });
      
      // Update ground speed based on flight mode
      setGroundSpeed(prev => {
        switch (flightMode) {
          case 'takeoff':
            return Math.min(5, prev + 0.5);
          case 'landing':
            return Math.max(0, prev - 0.5);
          case 'rtl':
            return Math.min(15, Math.max(5, prev + (Math.random() - 0.5)));
          case 'flying':
            return Math.max(0, Math.min(20, prev + (Math.random() - 0.5) * 2));
          default:
            return Math.max(0, prev - 0.5);
        }
      });
      
      // Update position when flying or RTL
      if (flightMode === 'flying' || flightMode === 'rtl' || flightMode === 'takeoff') {
        setPosition(prev => {
          if (flightMode === 'rtl') {
            // Move toward home position (use ref for current home)
            const home = homePositionRef.current;
            const latDiff = home.lat - prev.lat;
            const lngDiff = home.lng - prev.lng;
            const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
            
            if (dist < 0.00001) {
              // Close enough to home, start landing
              setFlightMode('landing');
              return prev;
            }
            
            // Move 5% of the remaining distance each tick
            const moveSpeed = 0.05;
            return {
              lat: prev.lat + latDiff * moveSpeed,
              lng: prev.lng + lngDiff * moveSpeed
            };
          } else {
            // Random movement during normal flight
            return {
              lat: prev.lat + (Math.random() - 0.5) * 0.00005,
              lng: prev.lng + (Math.random() - 0.5) * 0.00005
            };
          }
        });
      }
      
      // Update distance to home using actual calculation (use refs for current values)
      const currentPos = positionRef.current;
      const homePos = homePositionRef.current;
      setDistToHome(calculateDistance(currentPos.lat, currentPos.lng, homePos.lat, homePos.lng));
      
      setAttitude(prev => ({
        pitch: prev.pitch + (Math.random() - 0.5) * 2,
        roll: prev.roll + (Math.random() - 0.5) * 2,
        yaw: (prev.yaw + 0.5) % 360,
      }));
      setHeading(prev => (prev + 0.2) % 360);
      setMotors(prev => prev.map(m => ({
        ...m,
        rpm: Math.max(2800, m.rpm + (Math.random() - 0.5) * 100),
        temp: Math.max(35, Math.min(70, m.temp + (Math.random() - 0.5) * 0.5)),
        current: Math.max(5, Math.min(15, m.current + (Math.random() - 0.5) * 0.2)),
        status: m.temp > 60 ? 'warning' : m.temp > 70 ? 'error' : 'ok'
      })));
    }, 100);
    return () => clearInterval(interval);
  }, [isArmed, flightMode]);

  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <div className="w-10 h-full border-l border-border bg-card/80 backdrop-blur-md flex flex-col items-center py-4">
        <button 
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          title="Expand Telemetry"
        >
          <Gauge className="h-5 w-5" />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[10px] text-muted-foreground">
          <div className="writing-mode-vertical transform -rotate-90 whitespace-nowrap">TELEMETRY</div>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-56 sm:w-64 lg:w-80 h-full border-l border-border rounded-none bg-card/80 backdrop-blur-md overflow-hidden flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-xs sm:text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Telemetry
            {isArmed ? (
              <Badge variant="default" className="bg-emerald-500/20 text-emerald-500 text-[8px] px-1.5 py-0 border-emerald-500/30">LIVE</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[8px] px-1.5 py-0">OFFLINE</Badge>
            )}
          </span>
          <button 
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Collapse"
          >
            <ArrowUp className="h-3 w-3 rotate-90" />
          </button>
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
                  {altitude.toFixed(1)} <span className="text-sm text-muted-foreground">m</span>
                </div>
                <Progress value={Math.min((altitude / 100) * 100, 100)} className="h-1 bg-muted" />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase">Ground Speed</span>
                <div className="text-2xl font-mono font-bold text-primary flex items-baseline gap-1">
                  {groundSpeed.toFixed(1)} <span className="text-sm text-muted-foreground">m/s</span>
                </div>
                <Progress value={Math.min((groundSpeed / 20) * 100, 100)} className="h-1 bg-muted" />
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
                <span className="font-mono text-foreground">{Math.round(distToHome)}m</span>
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
                  <span className="text-foreground">{position.lat.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lon:</span>
                  <span className="text-foreground">{position.lng.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GPS Fix:</span>
                  <span className={isArmed ? "text-emerald-500" : "text-muted-foreground"}>{isArmed ? "3D FIX" : "NO FIX"}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="motors" className="flex-1 overflow-y-auto px-4 mt-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="text-primary border-primary/30">
                {motorCount} Motors Configured
              </Badge>
            </div>

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Zap className="h-3 w-3" /> Motor RPM
              </span>
              
              {motors.map((motor, idx) => (
                <div key={idx} className="space-y-1" data-testid={`motor-rpm-${idx + 1}`}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Motor {idx + 1}
                      {motor.status === 'warning' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      {motor.status === 'error' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                    </span>
                    <span className="font-mono text-primary">{Math.round(motor.rpm)} RPM</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary" 
                      style={{ width: `${Math.min((motor.rpm / 5000) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Thermometer className="h-3 w-3" /> Motor Temps
              </span>
              
              {motors.map((motor, idx) => (
                <div key={idx} className="space-y-1" data-testid={`motor-temp-${idx + 1}`}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Motor {idx + 1}</span>
                    <span className={`font-mono ${motor.temp > 60 ? 'text-red-500' : motor.temp > 50 ? 'text-amber-500' : 'text-amber-400'}`}>
                      {motor.temp.toFixed(1)}°C
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${motor.temp > 60 ? 'bg-red-500' : motor.temp > 50 ? 'bg-amber-500' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min((motor.temp / 80) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                <Activity className="h-3 w-3" /> Current Draw
              </span>
              
              {motors.map((motor, idx) => (
                <div key={idx} className="space-y-1" data-testid={`motor-current-${idx + 1}`}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Motor {idx + 1}</span>
                    <span className="font-mono text-emerald-500">{motor.current.toFixed(1)}A</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${Math.min((motor.current / 20) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
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
                  <span className="font-mono text-amber-500">48°C</span>
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
