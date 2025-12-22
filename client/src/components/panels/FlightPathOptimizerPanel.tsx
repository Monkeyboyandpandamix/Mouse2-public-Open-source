import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Route, 
  Wind, 
  Mountain, 
  Zap, 
  Clock, 
  Battery, 
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Play,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Thermometer,
  Cloud,
  CloudRain,
  Sun,
  Navigation,
  MapPin,
  Loader2,
  Lock,
  Shield,
  Target,
  Compass,
  Upload
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import type { Drone } from "@shared/schema";

interface WeatherData {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  windGust: number;
  humidity: number;
  visibility: number;
  condition: 'clear' | 'cloudy' | 'rain' | 'storm';
  pressure: number;
}

interface TerrainPoint {
  lat: number;
  lng: number;
  elevation: number;
}

interface Waypoint {
  id: number;
  order: number;
  latitude: number;
  longitude: number;
  altitude: number;
  action: string | null;
}

interface OptimizationResult {
  originalDistance: number;
  optimizedDistance: number;
  originalTime: number;
  optimizedTime: number;
  originalBattery: number;
  optimizedBattery: number;
  suggestions: OptimizationSuggestion[];
  reorderedWaypoints?: { id: number; newOrder: number }[];
  altitudeAdjustments?: { waypointId: number; newAltitude: number; reason: string }[];
  droneConnected: boolean;
  droneSpecs?: {
    batteryPercent: number;
    motorCount: number;
    maxSpeed: number;
    batteryCapacityWh: number;
  };
}

interface OptimizationSuggestion {
  id: string;
  type: 'route' | 'altitude' | 'weather' | 'terrain' | 'safety';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  savings?: string;
  applied: boolean;
}

interface Mission {
  id: number;
  name: string;
  waypoints: Waypoint[];
}

const DEFAULT_LAT = 36.0957;
const DEFAULT_LNG = -79.4378;

export function FlightPathOptimizerPanel() {
  const { hasPermission } = usePermissions();
  const canOptimize = hasPermission('mission_planning');
  const queryClient = useQueryClient();
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [optimizationPreferences, setOptimizationPreferences] = useState({
    prioritizeBattery: true,
    prioritizeTime: false,
    avoidHighWinds: true,
    maintainSafeAltitude: true,
    considerTerrain: true,
    optimizeOrder: true
  });

  useEffect(() => {
    const loadDrone = () => {
      const saved = localStorage.getItem('mouse_selected_drone');
      if (saved) {
        try {
          setSelectedDrone(JSON.parse(saved));
        } catch {
          setSelectedDrone(null);
        }
      }
    };
    loadDrone();
    
    const handleDroneChange = (e: CustomEvent<Drone | null>) => {
      setSelectedDrone(e.detail);
    };
    window.addEventListener('drone-selected' as any, handleDroneChange);
    return () => window.removeEventListener('drone-selected' as any, handleDroneChange);
  }, []);

  useEffect(() => {
    const fetchMissions = async () => {
      setMissionsLoading(true);
      try {
        const response = await fetch('/api/missions');
        if (!response.ok) {
          throw new Error('Failed to fetch missions');
        }
        const missionData = await response.json();
        
        const missionsWithWaypoints = await Promise.all(
          missionData.map(async (m: any) => {
            try {
              const wpResponse = await fetch(`/api/missions/${m.id}/waypoints`);
              const waypoints = wpResponse.ok ? await wpResponse.json() : [];
              return { ...m, waypoints };
            } catch {
              return { ...m, waypoints: [] };
            }
          })
        );
        setMissions(missionsWithWaypoints);
      } catch (e) {
        console.error('Failed to load missions:', e);
        toast.error('Failed to load missions from server');
      } finally {
        setMissionsLoading(false);
      }
    };
    fetchMissions();
  }, []);

  const fetchWeatherData = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${DEFAULT_LAT}&longitude=${DEFAULT_LNG}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,surface_pressure&wind_speed_unit=mph`
      );
      
      if (!response.ok) {
        throw new Error(`Weather API returned ${response.status}`);
      }
      const data = await response.json();
      const current = data.current;
      
      let condition: WeatherData['condition'] = 'clear';
      const weatherCode = current.weather_code;
      if (weatherCode >= 95) condition = 'storm';
      else if (weatherCode >= 51) condition = 'rain';
      else if (weatherCode >= 1) condition = 'cloudy';
      
      setWeatherData({
        temperature: Math.round(current.temperature_2m * 9/5 + 32),
        windSpeed: Math.round(current.wind_speed_10m),
        windDirection: current.wind_direction_10m,
        windGust: Math.round(current.wind_gusts_10m || current.wind_speed_10m * 1.5),
        humidity: current.relative_humidity_2m,
        visibility: 10,
        condition,
        pressure: Math.round(current.surface_pressure)
      });
      toast.success("Weather data updated");
    } catch (error) {
      console.error('Failed to fetch weather:', error);
      setWeatherError("Weather unavailable - using default values");
      toast.error("Failed to fetch weather data - using defaults");
      setWeatherData({
        temperature: 72,
        windSpeed: 8,
        windDirection: 225,
        windGust: 15,
        humidity: 45,
        visibility: 10,
        condition: 'clear',
        pressure: 1013
      });
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeatherData();
  }, [fetchWeatherData]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const optimizePath = async () => {
    if (!selectedMission || selectedMission.waypoints.length < 2) {
      toast.error("Please select a mission with at least 2 waypoints");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const suggestions: OptimizationSuggestion[] = [];
    const waypoints = [...selectedMission.waypoints].sort((a, b) => a.order - b.order);

    await new Promise(r => setTimeout(r, 300));
    setAnalysisProgress(15);

    let totalOriginalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      totalOriginalDistance += calculateDistance(
        waypoints[i].latitude, waypoints[i].longitude,
        waypoints[i+1].latitude, waypoints[i+1].longitude
      );
    }

    await new Promise(r => setTimeout(r, 300));
    setAnalysisProgress(30);

    if (weatherData) {
      if (weatherData.windSpeed > 15) {
        suggestions.push({
          id: 'wind-warning',
          type: 'weather',
          severity: weatherData.windSpeed > 25 ? 'critical' : 'warning',
          title: 'High Wind Advisory',
          description: `Current winds at ${weatherData.windSpeed} mph from ${getWindDirection(weatherData.windDirection)}. Consider delaying flight or reducing altitude.`,
          applied: false
        });
      }

      if (weatherData.windGust > 20) {
        const headwindWaypoints = waypoints.filter((wp, i) => {
          if (i === 0) return false;
          const prev = waypoints[i - 1];
          const bearing = calculateBearing(prev.latitude, prev.longitude, wp.latitude, wp.longitude);
          const angleDiff = Math.abs(bearing - weatherData.windDirection);
          return angleDiff < 45 || angleDiff > 315;
        });

        if (headwindWaypoints.length > 0) {
          suggestions.push({
            id: 'headwind-route',
            type: 'route',
            severity: 'info',
            title: 'Headwind Detected on Route',
            description: `${headwindWaypoints.length} waypoint(s) face headwinds. Reordering route could save ~${Math.round(headwindWaypoints.length * 2)}% battery.`,
            savings: `${Math.round(headwindWaypoints.length * 2)}% battery`,
            applied: false
          });
        }
      }

      if (weatherData.condition === 'rain' || weatherData.condition === 'storm') {
        suggestions.push({
          id: 'weather-delay',
          type: 'weather',
          severity: 'critical',
          title: 'Adverse Weather Conditions',
          description: `Current conditions: ${weatherData.condition}. Flight not recommended. Wait for weather to clear.`,
          applied: false
        });
      }
    }

    await new Promise(r => setTimeout(r, 300));
    setAnalysisProgress(50);

    if (optimizationPreferences.considerTerrain) {
      const highAltitudeWaypoints = waypoints.filter(wp => wp.altitude > 100);
      if (highAltitudeWaypoints.length > 0) {
        suggestions.push({
          id: 'altitude-optimization',
          type: 'altitude',
          severity: 'info',
          title: 'Altitude Optimization Available',
          description: `${highAltitudeWaypoints.length} waypoint(s) at high altitude. Lowering to optimal height could improve battery life.`,
          savings: '5-10% battery',
          applied: false
        });
      }

      const lowAltitudeWaypoints = waypoints.filter(wp => wp.altitude < 30);
      if (lowAltitudeWaypoints.length > 0) {
        suggestions.push({
          id: 'terrain-clearance',
          type: 'terrain',
          severity: 'warning',
          title: 'Low Altitude Warning',
          description: `${lowAltitudeWaypoints.length} waypoint(s) below 30m. Recommend increasing altitude for terrain clearance safety.`,
          applied: false
        });
      }
    }

    await new Promise(r => setTimeout(r, 300));
    setAnalysisProgress(70);

    if (optimizationPreferences.optimizeOrder && waypoints.length >= 3) {
      const currentOrder = waypoints.map(w => w.id);
      
      let optimizedOrder = [...currentOrder];
      let optimizedDistance = totalOriginalDistance;
      
      for (let attempt = 0; attempt < 100; attempt++) {
        const i = Math.floor(Math.random() * (waypoints.length - 1)) + 1;
        const j = Math.floor(Math.random() * (waypoints.length - 1)) + 1;
        if (i !== j) {
          const testOrder = [...optimizedOrder];
          [testOrder[i], testOrder[j]] = [testOrder[j], testOrder[i]];
          
          let testDistance = 0;
          const testWaypoints = testOrder.map(id => waypoints.find(w => w.id === id)!);
          for (let k = 0; k < testWaypoints.length - 1; k++) {
            testDistance += calculateDistance(
              testWaypoints[k].latitude, testWaypoints[k].longitude,
              testWaypoints[k+1].latitude, testWaypoints[k+1].longitude
            );
          }
          
          if (testDistance < optimizedDistance) {
            optimizedDistance = testDistance;
            optimizedOrder = testOrder;
          }
        }
      }

      const distanceSaved = totalOriginalDistance - optimizedDistance;
      if (distanceSaved > 50) {
        suggestions.push({
          id: 'route-reorder',
          type: 'route',
          severity: 'info',
          title: 'Route Reordering Recommended',
          description: `Reordering waypoints could reduce total distance by ${Math.round(distanceSaved)}m (${Math.round(distanceSaved/totalOriginalDistance*100)}%).`,
          savings: `${Math.round(distanceSaved)}m shorter`,
          applied: false
        });
      }
    }

    await new Promise(r => setTimeout(r, 300));
    setAnalysisProgress(85);

    if (optimizationPreferences.maintainSafeAltitude) {
      suggestions.push({
        id: 'safe-altitude',
        type: 'safety',
        severity: 'info',
        title: 'Safe Altitude Mode Active',
        description: 'All waypoints will maintain minimum 20m AGL for obstacle clearance.',
        applied: true
      });
    }

    await new Promise(r => setTimeout(r, 200));
    setAnalysisProgress(100);

    const droneConnected = !!selectedDrone && selectedDrone.status !== 'offline';
    const cruiseSpeed = selectedDrone?.maxSpeed || 10;
    const motorCount = selectedDrone?.motorCount || 4;
    const batteryPercent = selectedDrone?.batteryPercent || 100;
    const batteryCapacityWh = 99.9;
    const motorPowerW = 150;
    const totalPowerW = motorCount * motorPowerW * 0.6;
    
    let totalAltitudeChange = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      totalAltitudeChange += Math.abs(waypoints[i + 1].altitude - waypoints[i].altitude);
    }
    
    let windFactor = 1.0;
    if (weatherData) {
      const windSpeedMs = weatherData.windSpeed * 0.44704;
      windFactor = 1 + (windSpeedMs / cruiseSpeed) * 0.3;
    }
    
    const originalFlightTimeSeconds = (totalOriginalDistance / cruiseSpeed) * windFactor;
    const climbEnergyWh = (totalAltitudeChange * 0.01) * motorCount;
    const flightEnergyWh = (totalPowerW * originalFlightTimeSeconds / 3600) + climbEnergyWh;
    const originalBatteryUsage = (flightEnergyWh / batteryCapacityWh) * 100;
    
    const routeSuggestions = suggestions.filter(s => s.type === 'route').length;
    const altitudeSuggestions = suggestions.filter(s => s.type === 'altitude').length;
    const distanceSavingsPercent = routeSuggestions * 5;
    const altitudeSavingsPercent = altitudeSuggestions * 3;
    const totalSavingsPercent = Math.min(distanceSavingsPercent + altitudeSavingsPercent, 25);
    
    const optimizedDistance = totalOriginalDistance * (1 - distanceSavingsPercent / 100);
    const optimizedTime = originalFlightTimeSeconds * (1 - distanceSavingsPercent / 100);
    const optimizedBattery = originalBatteryUsage * (1 - totalSavingsPercent / 100);

    setOptimizationResult({
      originalDistance: Math.round(totalOriginalDistance),
      optimizedDistance: Math.round(optimizedDistance),
      originalTime: Math.round(originalFlightTimeSeconds),
      optimizedTime: Math.round(optimizedTime),
      originalBattery: Math.round(originalBatteryUsage * 10) / 10,
      optimizedBattery: Math.round(optimizedBattery * 10) / 10,
      suggestions,
      droneConnected,
      droneSpecs: {
        batteryPercent,
        motorCount,
        maxSpeed: cruiseSpeed,
        batteryCapacityWh
      }
    });

    setIsAnalyzing(false);
    toast.success("Path optimization complete");
  };

  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
  };

  const getWindDirection = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'rain': return <CloudRain className="h-5 w-5 text-blue-400" />;
      case 'storm': return <Cloud className="h-5 w-5 text-gray-400" />;
      case 'cloudy': return <Cloud className="h-5 w-5 text-gray-300" />;
      default: return <Sun className="h-5 w-5 text-yellow-400" />;
    }
  };

  const applySuggestion = (suggestionId: string) => {
    if (!optimizationResult) return;
    
    setOptimizationResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        suggestions: prev.suggestions.map(s => 
          s.id === suggestionId ? { ...s, applied: true } : s
        )
      };
    });
    toast.success("Optimization marked for application");
  };

  const applyOptimizationsToMission = async () => {
    if (!optimizationResult || !selectedMission) {
      toast.error("No optimization to apply");
      return;
    }

    setIsApplying(true);
    
    try {
      const appliedSuggestions = optimizationResult.suggestions.filter(s => s.applied);
      
      if (appliedSuggestions.length === 0) {
        toast.error("No optimizations selected to apply");
        setIsApplying(false);
        return;
      }

      const waypoints = [...selectedMission.waypoints].sort((a, b) => a.order - b.order);
      
      for (const suggestion of appliedSuggestions) {
        if (suggestion.id === 'terrain-clearance') {
          for (const wp of waypoints) {
            if (wp.altitude < 30) {
              await fetch(`/api/waypoints/${wp.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ altitude: 30 })
              });
            }
          }
        }
        
        if (suggestion.id === 'altitude-optimization') {
          for (const wp of waypoints) {
            if (wp.altitude > 100) {
              const optimalAlt = Math.max(60, wp.altitude * 0.7);
              await fetch(`/api/waypoints/${wp.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ altitude: Math.round(optimalAlt) })
              });
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/missions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/missions', selectedMission.id, 'waypoints'] });
      
      window.dispatchEvent(new CustomEvent('mission-updated', { 
        detail: { missionId: selectedMission.id } 
      }));

      toast.success("Optimizations applied to mission successfully!");
      
      const updatedMissions = await fetch('/api/missions').then(r => r.json());
      const updatedMission = updatedMissions.find((m: any) => m.id === selectedMission.id);
      if (updatedMission) {
        const wpResponse = await fetch(`/api/missions/${updatedMission.id}/waypoints`);
        const updatedWaypoints = wpResponse.ok ? await wpResponse.json() : [];
        setSelectedMission({ ...updatedMission, waypoints: updatedWaypoints });
        setMissions(prev => prev.map(m => 
          m.id === updatedMission.id ? { ...m, waypoints: updatedWaypoints } : m
        ));
      }
      
      setOptimizationResult(null);
    } catch (error) {
      console.error('Failed to apply optimizations:', error);
      toast.error("Failed to apply optimizations");
    } finally {
      setIsApplying(false);
    }
  };

  const applyAllSuggestions = () => {
    if (!optimizationResult) return;
    
    setOptimizationResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        suggestions: prev.suggestions.map(s => ({ ...s, applied: true }))
      };
    });
    toast.success("All optimizations selected - click 'Apply to Mission' to save");
  };

  if (!canOptimize) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access the flight path optimizer.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Flight Path Optimizer
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Optimize routes based on weather, terrain & objectives
          </p>
        </div>

        <div className="p-4 border-b border-border">
          <Label className="text-xs text-muted-foreground mb-2 block">Select Mission</Label>
          <Select 
            value={selectedMission?.id.toString() || ""} 
            onValueChange={(v) => {
              const mission = missions.find(m => m.id.toString() === v);
              setSelectedMission(mission || null);
              setOptimizationResult(null);
            }}
          >
            <SelectTrigger data-testid="select-mission-optimizer">
              <SelectValue placeholder="Choose a mission..." />
            </SelectTrigger>
            <SelectContent>
              {missionsLoading ? (
                <SelectItem value="loading" disabled>Loading missions...</SelectItem>
              ) : missions.length === 0 ? (
                <SelectItem value="none" disabled>No missions available</SelectItem>
              ) : (
                missions.map(mission => (
                  <SelectItem key={mission.id} value={mission.id.toString()} data-testid={`option-mission-${mission.id}`}>
                    {mission.name} ({mission.waypoints.length} waypoints)
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wind className="h-4 w-4" />
                  Current Weather
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {weatherLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading weather...</span>
                  </div>
                ) : weatherData ? (
                  <div className="space-y-2" data-testid="weather-data-display">
                    {weatherError && (
                      <p className="text-xs text-amber-500 mb-2" data-testid="text-weather-error">{weatherError}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getWeatherIcon(weatherData.condition)}
                        <span className="text-lg font-bold" data-testid="text-temperature">{weatherData.temperature}°F</span>
                      </div>
                      <Badge variant={weatherData.condition === 'clear' ? 'default' : 'secondary'} data-testid="badge-weather-condition">
                        {weatherData.condition.toUpperCase()}
                      </Badge>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <Wind className="h-3 w-3" />
                        <span data-testid="text-wind-speed">{weatherData.windSpeed} mph {getWindDirection(weatherData.windDirection)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        <span data-testid="text-wind-gust">Gusts: {weatherData.windGust} mph</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Thermometer className="h-3 w-3" />
                        <span data-testid="text-humidity">Humidity: {weatherData.humidity}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Compass className="h-3 w-3" />
                        <span data-testid="text-pressure">{weatherData.pressure} hPa</span>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full mt-2"
                      onClick={fetchWeatherData}
                      disabled={weatherLoading}
                      data-testid="button-refresh-weather"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-weather-unavailable">Weather data unavailable</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Optimization Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Prioritize Battery</Label>
                  <Switch 
                    checked={optimizationPreferences.prioritizeBattery}
                    onCheckedChange={(v) => setOptimizationPreferences(p => ({ ...p, prioritizeBattery: v }))}
                    data-testid="switch-prioritize-battery"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Prioritize Time</Label>
                  <Switch 
                    checked={optimizationPreferences.prioritizeTime}
                    onCheckedChange={(v) => setOptimizationPreferences(p => ({ ...p, prioritizeTime: v }))}
                    data-testid="switch-prioritize-time"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Avoid High Winds</Label>
                  <Switch 
                    checked={optimizationPreferences.avoidHighWinds}
                    onCheckedChange={(v) => setOptimizationPreferences(p => ({ ...p, avoidHighWinds: v }))}
                    data-testid="switch-avoid-winds"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Consider Terrain</Label>
                  <Switch 
                    checked={optimizationPreferences.considerTerrain}
                    onCheckedChange={(v) => setOptimizationPreferences(p => ({ ...p, considerTerrain: v }))}
                    data-testid="switch-consider-terrain"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Optimize Waypoint Order</Label>
                  <Switch 
                    checked={optimizationPreferences.optimizeOrder}
                    onCheckedChange={(v) => setOptimizationPreferences(p => ({ ...p, optimizeOrder: v }))}
                    data-testid="switch-optimize-order"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Safe Altitude Mode</Label>
                  <Switch 
                    checked={optimizationPreferences.maintainSafeAltitude}
                    onCheckedChange={(v) => setOptimizationPreferences(p => ({ ...p, maintainSafeAltitude: v }))}
                    data-testid="switch-safe-altitude"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border">
          <Button 
            className="w-full" 
            onClick={optimizePath}
            disabled={!selectedMission || isAnalyzing}
            data-testid="button-analyze-path"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Analyze & Optimize
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isAnalyzing ? (
          <div className="h-full flex items-center justify-center">
            <Card className="w-96">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Analyzing Flight Path
                </CardTitle>
                <CardDescription>
                  Evaluating weather, terrain, and route efficiency...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={analysisProgress} className="mb-2" />
                <p className="text-xs text-muted-foreground text-center">{analysisProgress}% complete</p>
              </CardContent>
            </Card>
          </div>
        ) : optimizationResult ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Optimization Results</h2>
                <p className="text-muted-foreground">Mission: {selectedMission?.name}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOptimizationResult(null)} data-testid="button-clear-results">
                  Clear
                </Button>
                <Button variant="outline" onClick={applyAllSuggestions} data-testid="button-apply-all">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Select All
                </Button>
                <Button 
                  onClick={applyOptimizationsToMission} 
                  disabled={isApplying || !optimizationResult?.suggestions.some(s => s.applied)}
                  data-testid="button-apply-to-mission"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Apply to Mission
                    </>
                  )}
                </Button>
              </div>
            </div>

            {optimizationResult.droneConnected === false && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg" data-testid="drone-status-warning">
                <p className="text-sm text-amber-500 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Drone not connected - calculations based on default specifications
                </p>
              </div>
            )}

            {optimizationResult.droneSpecs && (
              <div className="mb-4 p-3 bg-muted/30 rounded-lg" data-testid="drone-specs-display">
                <p className="text-xs text-muted-foreground mb-2">Calculation Parameters:</p>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Battery:</span>
                    <span className="ml-1 font-medium" data-testid="text-battery-percent">{optimizationResult.droneSpecs.batteryPercent}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Motors:</span>
                    <span className="ml-1 font-medium" data-testid="text-motor-count">{optimizationResult.droneSpecs.motorCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Speed:</span>
                    <span className="ml-1 font-medium" data-testid="text-max-speed">{optimizationResult.droneSpecs.maxSpeed} m/s</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Capacity:</span>
                    <span className="ml-1 font-medium" data-testid="text-battery-capacity">{optimizationResult.droneSpecs.batteryCapacityWh} Wh</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Navigation className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Distance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{optimizationResult.optimizedDistance}m</span>
                    {optimizationResult.optimizedDistance < optimizationResult.originalDistance && (
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-500">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        -{Math.round((1 - optimizationResult.optimizedDistance/optimizationResult.originalDistance) * 100)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Original: {optimizationResult.originalDistance}m
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold">Flight Time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{Math.floor(optimizationResult.optimizedTime / 60)}m {optimizationResult.optimizedTime % 60}s</span>
                    {optimizationResult.optimizedTime < optimizationResult.originalTime && (
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-500">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        -{Math.round((1 - optimizationResult.optimizedTime/optimizationResult.originalTime) * 100)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Original: {Math.floor(optimizationResult.originalTime / 60)}m {optimizationResult.originalTime % 60}s
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Battery className="h-5 w-5 text-emerald-500" />
                    <span className="font-semibold">Battery Usage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{optimizationResult.optimizedBattery}%</span>
                    {optimizationResult.optimizedBattery < optimizationResult.originalBattery && (
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-500">
                        <TrendingDown className="h-3 w-3 mr-1" />
                        -{Math.round((1 - optimizationResult.optimizedBattery/optimizationResult.originalBattery) * 100)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Original: {optimizationResult.originalBattery}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Optimization Suggestions
                </CardTitle>
                <CardDescription>
                  {optimizationResult.suggestions.length} suggestion(s) for improving your flight path
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {optimizationResult.suggestions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-2 text-emerald-500" />
                      <p>Your flight path is already optimized!</p>
                    </div>
                  ) : (
                    optimizationResult.suggestions.map(suggestion => (
                      <div 
                        key={suggestion.id}
                        className={`p-4 rounded-lg border ${
                          suggestion.severity === 'critical' ? 'border-red-500 bg-red-500/10' :
                          suggestion.severity === 'warning' ? 'border-amber-500 bg-amber-500/10' :
                          'border-border bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {suggestion.type === 'weather' && <Cloud className="h-4 w-4" />}
                              {suggestion.type === 'terrain' && <Mountain className="h-4 w-4" />}
                              {suggestion.type === 'route' && <Route className="h-4 w-4" />}
                              {suggestion.type === 'altitude' && <TrendingUp className="h-4 w-4" />}
                              {suggestion.type === 'safety' && <Shield className="h-4 w-4" />}
                              <span className="font-semibold">{suggestion.title}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {suggestion.type.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{suggestion.description}</p>
                            {suggestion.savings && (
                              <p className="text-xs text-emerald-500 mt-1 font-medium">
                                Potential savings: {suggestion.savings}
                              </p>
                            )}
                          </div>
                          {!suggestion.applied ? (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => applySuggestion(suggestion.id)}
                              data-testid={`button-apply-${suggestion.id}`}
                            >
                              Apply
                            </Button>
                          ) : (
                            <Badge className="bg-emerald-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Applied
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <Route className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-bold mb-2">Flight Path Optimizer</h3>
              <p className="text-muted-foreground mb-4">
                Select a mission and click "Analyze & Optimize" to get intelligent route suggestions 
                based on current weather conditions, terrain data, and your optimization preferences.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left text-sm">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <Wind className="h-4 w-4 text-primary mb-1" />
                  <p className="font-medium">Weather Analysis</p>
                  <p className="text-xs text-muted-foreground">Wind, gusts, and conditions</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <Mountain className="h-4 w-4 text-primary mb-1" />
                  <p className="font-medium">Terrain Awareness</p>
                  <p className="text-xs text-muted-foreground">Elevation and obstacles</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <Battery className="h-4 w-4 text-primary mb-1" />
                  <p className="font-medium">Battery Optimization</p>
                  <p className="text-xs text-muted-foreground">Efficient route planning</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <Shield className="h-4 w-4 text-primary mb-1" />
                  <p className="font-medium">Safety Checks</p>
                  <p className="text-xs text-muted-foreground">Hazard detection</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
