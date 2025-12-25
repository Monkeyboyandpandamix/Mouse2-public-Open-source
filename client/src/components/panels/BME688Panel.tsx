import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Thermometer, 
  Droplets, 
  Gauge, 
  Wind, 
  AlertTriangle,
  RefreshCw,
  Activity,
  Leaf,
  Flame,
  Skull,
  Mountain
} from 'lucide-react';
import { toast } from 'sonner';
import { BME688_THRESHOLDS } from '@shared/schema';

interface BME688Reading {
  success: boolean;
  simulated?: boolean;
  timestamp: string;
  tempC: number;
  tempF: number;
  humidity: number;
  pressure: number;
  gasOhms: number;
  altitude: number;
  iaqScore: number;
  vocPpm: number;
  vscPpb: number;
  co2Ppm: number;
  h2Ppm: number;
  coPpm: number;
  ethanolPpm: number;
  healthRisk: 'GOOD' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  healthRiskDesc: string;
}

interface BME688Status {
  success: boolean;
  sensorAvailable: boolean;
  platform: string;
  message: string;
}

export default function BME688Panel() {
  const [reading, setReading] = useState<BME688Reading | null>(null);
  const [status, setStatus] = useState<BME688Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [history, setHistory] = useState<BME688Reading[]>([]);

  const fetchReading = useCallback(async () => {
    try {
      const res = await fetch('/api/bme688/read');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const transformed: BME688Reading = {
            success: data.success,
            simulated: data.simulated,
            timestamp: data.timestamp,
            tempC: data.tempC ?? data.temperature_c ?? 0,
            tempF: data.tempF ?? data.temperature_f ?? 0,
            humidity: data.humidity ?? 0,
            pressure: data.pressure ?? 0,
            gasOhms: data.gasOhms ?? data.gas_resistance ?? 0,
            altitude: data.altitude ?? 0,
            iaqScore: data.iaqScore ?? data.iaq_score ?? 0,
            vocPpm: data.vocPpm ?? data.voc_level ?? 0,
            vscPpb: data.vscPpb ?? data.vsc_level ?? 0,
            co2Ppm: data.co2Ppm ?? data.co2_level ?? 0,
            h2Ppm: data.h2Ppm ?? data.h2_level ?? 0,
            coPpm: data.coPpm ?? data.co_level ?? 0,
            ethanolPpm: data.ethanolPpm ?? data.ethanol_level ?? 0,
            healthRisk: data.healthRisk ?? data.health_risk_level ?? 'GOOD',
            healthRiskDesc: data.healthRiskDesc ?? data.health_risk_description ?? 'No data available'
          };
          setReading(transformed);
          setHistory(prev => [...prev.slice(-29), transformed]);
        }
      }
    } catch (e) {
      console.error('BME688 read error:', e);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bme688/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error('BME688 status error:', e);
    }
  }, []);

  const handleManualRefresh = async () => {
    setLoading(true);
    await fetchReading();
    setLoading(false);
    toast.success('Sensor data refreshed');
  };

  useEffect(() => {
    fetchStatus();
    fetchReading();
  }, [fetchStatus, fetchReading]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchReading, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchReading]);

  const getHealthRiskColor = (risk: string) => {
    switch (risk) {
      case 'GOOD': return 'bg-green-500';
      case 'MODERATE': return 'bg-yellow-500';
      case 'HIGH': return 'bg-orange-500';
      case 'CRITICAL': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getHealthRiskTextColor = (risk: string) => {
    switch (risk) {
      case 'GOOD': return 'text-green-400';
      case 'MODERATE': return 'text-yellow-400';
      case 'HIGH': return 'text-orange-400';
      case 'CRITICAL': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getIAQLevel = (iaq: number) => {
    if (iaq <= BME688_THRESHOLDS.IAQ_GOOD) return { label: 'Excellent', color: 'text-green-400' };
    if (iaq <= BME688_THRESHOLDS.IAQ_MODERATE) return { label: 'Good', color: 'text-blue-400' };
    if (iaq <= BME688_THRESHOLDS.IAQ_POOR) return { label: 'Moderate', color: 'text-yellow-400' };
    return { label: 'Poor', color: 'text-red-400' };
  };

  const formatGasValue = (value: number, unit: string, threshold?: number) => {
    const isWarning = threshold !== undefined && value > threshold;
    return (
      <span className={isWarning ? 'text-orange-400 font-bold' : ''}>
        {value.toFixed(2)} {unit}
      </span>
    );
  };

  return (
    <div className="p-4 space-y-4 h-full overflow-auto" data-testid="bme688-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-bold">Environmental Monitor</h2>
          {reading?.simulated && (
            <Badge variant="outline" className="text-xs">Simulated</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'border-green-500' : ''}
            data-testid="button-auto-refresh"
          >
            <Activity className={`h-4 w-4 mr-1 ${autoRefresh ? 'text-green-500 animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {reading && (
        <>
          <Card className={`${getHealthRiskColor(reading.healthRisk)} bg-opacity-20 border-2`}
                style={{ borderColor: reading.healthRisk === 'CRITICAL' ? '#ef4444' : 
                         reading.healthRisk === 'HIGH' ? '#f97316' :
                         reading.healthRisk === 'MODERATE' ? '#eab308' : '#22c55e' }}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {reading.healthRisk === 'CRITICAL' ? (
                    <Skull className="h-8 w-8 text-red-500 animate-pulse" />
                  ) : reading.healthRisk === 'HIGH' ? (
                    <AlertTriangle className="h-8 w-8 text-orange-500" />
                  ) : (
                    <Leaf className="h-8 w-8 text-green-500" />
                  )}
                  <div>
                    <p className={`text-2xl font-bold ${getHealthRiskTextColor(reading.healthRisk)}`}>
                      {reading.healthRisk}
                    </p>
                    <p className="text-sm text-muted-foreground">{reading.healthRiskDesc}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">IAQ Score</p>
                  <p className={`text-3xl font-mono font-bold ${getIAQLevel(reading.iaqScore).color}`}>
                    {reading.iaqScore.toFixed(0)}
                  </p>
                  <p className={`text-xs ${getIAQLevel(reading.iaqScore).color}`}>
                    {getIAQLevel(reading.iaqScore).label}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-red-400" />
                  Temperature
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-mono font-bold">{reading.tempF.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">°F</span>
                </div>
                <p className="text-xs text-muted-foreground">{reading.tempC.toFixed(1)}°C</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-blue-400" />
                  Humidity
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-mono font-bold">{reading.humidity.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <Progress value={reading.humidity} className="h-1 mt-1" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-purple-400" />
                  Pressure
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-mono font-bold">{reading.pressure.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">hPa</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-green-400" />
                  Altitude
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-mono font-bold">{reading.altitude.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">m</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wind className="h-4 w-4 text-cyan-400" />
                Gas Analysis (AI Classification)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VOC:</span>
                  {formatGasValue(reading.vocPpm, 'ppm', BME688_THRESHOLDS.VOC_MODERATE)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VSC:</span>
                  {formatGasValue(reading.vscPpb, 'ppb', BME688_THRESHOLDS.VSC_STRONG)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CO₂:</span>
                  {formatGasValue(reading.co2Ppm, 'ppm', BME688_THRESHOLDS.CO2_ELEVATED)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">H₂:</span>
                  {formatGasValue(reading.h2Ppm, 'ppm', BME688_THRESHOLDS.H2_WARNING)}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Flame className="h-3 w-3" /> CO:
                  </span>
                  <span className={reading.coPpm > BME688_THRESHOLDS.CO_HIGH ? 'text-red-500 font-bold' : 
                                   reading.coPpm > BME688_THRESHOLDS.CO_LOW ? 'text-orange-400' : ''}>
                    {reading.coPpm.toFixed(2)} ppm
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ethanol:</span>
                  {formatGasValue(reading.ethanolPpm, 'ppm')}
                </div>
              </div>
              
              <Separator className="my-2" />
              
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Raw Gas Resistance:</span>
                <span className="font-mono">{(reading.gasOhms / 1000).toFixed(1)} kΩ</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm">Safe Levels Reference</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 text-xs text-muted-foreground space-y-1">
              <p><span className="text-green-400">VOC:</span> &lt;{BME688_THRESHOLDS.VOC_MODERATE} ppm</p>
              <p><span className="text-green-400">CO₂:</span> &lt;{BME688_THRESHOLDS.CO2_ELEVATED} ppm</p>
              <p><span className="text-green-400">CO:</span> &lt;{BME688_THRESHOLDS.CO_LOW} ppm <span className="text-red-400">(CRITICAL &gt;{BME688_THRESHOLDS.CO_CRITICAL})</span></p>
              <p><span className="text-green-400">H₂:</span> &lt;{BME688_THRESHOLDS.H2_WARNING} ppm</p>
              <p><span className="text-green-400">IAQ:</span> &lt;{BME688_THRESHOLDS.IAQ_GOOD} (Excellent)</p>
            </CardContent>
          </Card>

          {reading.timestamp && (
            <p className="text-xs text-muted-foreground text-center">
              Last update: {new Date(reading.timestamp).toLocaleTimeString()}
            </p>
          )}
        </>
      )}

      {!reading && !loading && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Leaf className="h-12 w-12 mb-4 opacity-50" />
          <p>Waiting for sensor data...</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={handleManualRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      )}

      {status && (
        <div className="text-xs text-muted-foreground text-center">
          Platform: {status.platform} | Sensor: {status.sensorAvailable ? 'Connected' : 'Simulated'}
        </div>
      )}
    </div>
  );
}
