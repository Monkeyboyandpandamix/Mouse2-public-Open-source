import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Polygon, useMap, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState, useCallback, type MouseEvent } from "react";
import { MapErrorBoundary } from "@/components/map/MapErrorBoundary";

// Default location - Burlington, NC
const DEFAULT_LAT = 36.0957;
const DEFAULT_LNG = -79.4378;

import { Search, Map as MapIcon, Layers, ZoomIn, ZoomOut, RotateCcw, Crosshair, Plane, Battery, Signal, Radio, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { Drone } from "@shared/schema";
import { NoFlyZoneOverlay } from "@/components/map/NoFlyZoneOverlay";
import { NoFlyZoneLegend } from "@/components/map/NoFlyZoneLegend";
import { RegulatoryGeoJsonOverlay } from "@/components/map/RegulatoryGeoJsonOverlay";
import { useNoFlyZones } from "@/hooks/useNoFlyZones";

interface Waypoint {
  id: number;
  missionId: number;
  order: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number | null;
  action: string | null;
  hoverTime: number | null;
}

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const DroneIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-full h-full bg-primary/30 rounded-full animate-ping"></div>
          <div class="absolute w-4 h-4 bg-primary border-2 border-white rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Calculate camera footprint radius based on altitude (meters)
// Uses approximate 60-degree FOV (typical for drone cameras)
const calculateCameraFootprint = (altitude: number): number => {
  if (!altitude || altitude <= 0) return 0;
  // tan(30°) ≈ 0.577 for 60° FOV
  return Math.round(altitude * 0.577);
};

// Calculate map zoom level based on drone altitude for optimal view
const getOptimalZoom = (altitude: number): number => {
  if (altitude < 10) return 19;
  if (altitude < 30) return 18;
  if (altitude < 50) return 17;
  if (altitude < 100) return 16;
  if (altitude < 200) return 15;
  if (altitude < 500) return 14;
  return 13;
};

// Dynamic drone icon based on status
const createDroneIcon = (status: string, isSelected: boolean) => {
  const colors: Record<string, { bg: string; glow: string }> = {
    flying: { bg: '#3b82f6', glow: 'rgba(59,130,246,0.8)' },
    online: { bg: '#22c55e', glow: 'rgba(34,197,94,0.8)' },
    armed: { bg: '#f59e0b', glow: 'rgba(245,158,11,0.8)' },
    error: { bg: '#ef4444', glow: 'rgba(239,68,68,0.8)' },
    maintenance: { bg: '#f97316', glow: 'rgba(249,115,22,0.8)' },
    offline: { bg: '#6b7280', glow: 'rgba(107,114,128,0.5)' },
  };
  const { bg, glow } = colors[status] || colors.offline;
  const size = isSelected ? 'w-10 h-10' : 'w-8 h-8';
  const innerSize = isSelected ? 'w-5 h-5' : 'w-4 h-4';
  const ringClass = isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : '';
  
  return L.divIcon({
    className: "bg-transparent",
    html: `<div class="relative flex items-center justify-center ${size}">
            ${status === 'flying' || status === 'armed' ? `<div class="absolute w-full h-full rounded-full animate-ping" style="background: ${bg}33"></div>` : ''}
            <div class="${innerSize} ${ringClass} rounded-full border-2 border-white" style="background: ${bg}; box-shadow: 0 0 10px ${glow}"></div>
           </div>`,
    iconSize: isSelected ? [40, 40] : [32, 32],
    iconAnchor: isSelected ? [20, 20] : [16, 16],
  });
};

const HomeIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="flex items-center justify-center w-6 h-6 bg-emerald-500 text-white rounded-sm border-2 border-white font-bold text-xs shadow-md">H</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const EstimatedNavIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-full h-full rounded-full bg-amber-400/30 animate-ping"></div>
          <div class="w-4 h-4 rounded-full border-2 border-white bg-amber-400"></div>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const WaypointIcon = (num: number) => L.divIcon({
  className: "bg-transparent",
  html: `<div class="flex items-center justify-center w-6 h-6 bg-accent text-black rounded-full border-2 border-white font-bold text-xs shadow-md">${num}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const AircraftIcon = (heading: number, threat: 'low' | 'medium' | 'high') => {
  const color = threat === 'high' ? '#ef4444' : threat === 'medium' ? '#f59e0b' : '#3b82f6';
  return L.divIcon({
    className: "bg-transparent",
    html: `<div class="relative flex items-center justify-center w-8 h-8" style="transform: rotate(${heading}deg)">
            <svg viewBox="0 0 24 24" fill="${color}" class="w-6 h-6 drop-shadow-lg">
              <path d="M12 2L4 12h4v6h8v-6h4L12 2z"/>
            </svg>
          </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  threat: 'low' | 'medium' | 'high';
  verticalRate: number;
}

// Real ADS-B aircraft data - populated from actual receiver when connected
// Empty by default until real data arrives from ADS-B receiver
const defaultAircraft: Aircraft[] = [];

function ZoomControls({ dronePosition, operatorPosition }: { dronePosition?: [number, number] | null; operatorPosition?: [number, number] }) {
  const map = useMap();
  
  const handleCenterOnDrone = () => {
    if (dronePosition && dronePosition[0] !== 0 && dronePosition[1] !== 0) {
      map.setView(dronePosition, 18);
      toast.success("Centered on drone GPS position");
    } else {
      toast.error("No drone GPS position available");
    }
  };

  const handleCenterOnOperator = () => {
    if (operatorPosition && operatorPosition[0] !== 0 && operatorPosition[1] !== 0) {
      map.setView(operatorPosition, 18);
      toast.success("Centered on operator location");
    } else {
      toast.error("Operator location not available");
    }
  };

  const handleResetView = () => {
    if (dronePosition && dronePosition[0] !== 0 && dronePosition[1] !== 0) {
      map.setView(dronePosition, 16);
    } else if (operatorPosition) {
      map.setView(operatorPosition, 16);
    } else {
      map.setView([DEFAULT_LAT, DEFAULT_LNG], 16);
    }
  };
  
  return (
    <div className="absolute bottom-20 right-4 z-[400] flex flex-col gap-1 bg-card/90 backdrop-blur rounded-lg border border-border p-1 shadow-lg">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => map.zoomIn()}
        title="Zoom In"
        data-testid="button-zoom-in"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => map.zoomOut()}
        title="Zoom Out"
        data-testid="button-zoom-out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={handleCenterOnDrone}
        title="Center on Drone"
        data-testid="button-center-drone"
      >
        <Crosshair className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={handleCenterOnOperator}
        title="Center on Operator"
        data-testid="button-center-operator"
      >
        <User className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={handleResetView}
        title="Reset View"
        data-testid="button-reset-view"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}

function MapCenterUpdater({ searchResult }: { searchResult: {lat: number; lon: number; name: string} | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (searchResult) {
      map.setView([searchResult.lat, searchResult.lon], 17);
    }
  }, [searchResult, map]);
  
  return null;
}

function MapCenterPersist() {
  const map = useMap();
  
  useEffect(() => {
    const saved = localStorage.getItem('mouse_map_center');
    if (saved) {
      try {
        const { lat, lng, zoom } = JSON.parse(saved);
        if (lat && lng) {
          map.setView([lat, lng], zoom || 16);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    const saveCenter = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      localStorage.setItem('mouse_map_center', JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom
      }));
    };
    
    map.on('moveend', saveCenter);
    map.on('zoomend', saveCenter);
    
    return () => {
      map.off('moveend', saveCenter);
      map.off('zoomend', saveCenter);
    };
  }, [map]);
  
  return null;
}

export function MapInterface() {
  const [currentLocation, setCurrentLocation] = useState<[number, number]>([DEFAULT_LAT, DEFAULT_LNG]);
  const noFlyZones = useNoFlyZones();
  
  // Get user's actual GPS location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCurrentLocation([pos.coords.latitude, pos.coords.longitude]),
        () => console.log("Using default map location")
      );
    }
  }, []);
  
  const position: [number, number] = currentLocation;
  const flightPath: [number, number][] = [
    currentLocation,
    [currentLocation[0] + 0.0003, currentLocation[1] - 0.0003],
    [currentLocation[0] + 0.0008, currentLocation[1] + 0.0002],
    [currentLocation[0] + 0.0006, currentLocation[1] + 0.0012],
  ];

  const [mapType, setMapType] = useState<'dark' | 'satellite' | 'street'>('dark');
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{lat: number; lon: number; name: string} | null>(null);
  const [showAdsb, setShowAdsb] = useState(true);
  const [aircraft, setAircraft] = useState<Aircraft[]>(defaultAircraft);
  const [liveTelemetryPosition, setLiveTelemetryPosition] = useState<[number, number] | null>(null);
  const [gpsDeniedNav, setGpsDeniedNav] = useState<{
    active: boolean;
    method: "visual" | "dead" | "hybrid";
    estimatedPosition: { lat: number; lng: number } | null;
    breadcrumbs: { lat: number; lng: number }[];
    backtracing: boolean;
  }>({
    active: false,
    method: "hybrid",
    estimatedPosition: null,
    breadcrumbs: [],
    backtracing: false,
  });
  
  // ADS-B panel drag state (using top/left positioning)
  const [adsbPosition, setAdsbPosition] = useState({ x: 16, y: 200 });
  const [adsbDragging, setAdsbDragging] = useState(false);
  const [adsbDragOffset, setAdsbDragOffset] = useState({ x: 0, y: 0 });
  
  const [selectedMissionId, setSelectedMissionId] = useState<number | null>(null);
  
  // Fetch waypoints for selected mission
  const { data: missionWaypoints = [] } = useQuery<Waypoint[]>({
    queryKey: ["/api/missions", selectedMissionId, "waypoints"],
    queryFn: async () => {
      if (!selectedMissionId) return [];
      const res = await fetch(`/api/missions/${selectedMissionId}/waypoints`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedMissionId,
  });
  
  // Fetch all missions to get the first one as default
  const { data: missions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/missions"],
    queryFn: async () => {
      const res = await fetch("/api/missions");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch all drones for map display
  const { data: allDrones = [] } = useQuery<Drone[]>({
    queryKey: ["/api/drones"],
    queryFn: async () => {
      const res = await fetch("/api/drones");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 3000, // Refresh every 3 seconds for real-time positions
  });

  // Get selected drone from localStorage
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(() => {
    const saved = localStorage.getItem('mouse_selected_drone');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.id ? String(parsed.id) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  // Listen for drone selection changes
  useEffect(() => {
    const handleDroneChange = (e: CustomEvent<Drone>) => {
      setSelectedDroneId(e.detail?.id ? String(e.detail.id) : null);
    };
    window.addEventListener('drone-selected' as any, handleDroneChange);
    return () => window.removeEventListener('drone-selected' as any, handleDroneChange);
  }, []);

  // Use live telemetry position for selected drone when available.
  useEffect(() => {
    const handleTelemetry = (e: CustomEvent<{ position?: { lat: number; lng: number }; latitude?: number; longitude?: number }>) => {
      const pos = e.detail?.position || (
        typeof e.detail?.latitude === "number" && typeof e.detail?.longitude === "number"
          ? { lat: e.detail.latitude, lng: e.detail.longitude }
          : null
      );
      if (pos) {
        setLiveTelemetryPosition([pos.lat, pos.lng]);
      }
    };
    window.addEventListener("telemetry-update" as any, handleTelemetry);
    return () => window.removeEventListener("telemetry-update" as any, handleTelemetry);
  }, []);
  
  // Auto-select first mission if none selected (only once)
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  useEffect(() => {
    if (missions.length > 0 && !selectedMissionId && !hasAutoSelected) {
      setSelectedMissionId(missions[0].id);
      setHasAutoSelected(true);
    }
  }, [missions, selectedMissionId, hasAutoSelected]);
  
  // Listen for mission selection changes from MissionPlanningPanel
  useEffect(() => {
    const handleMissionSelect = (e: CustomEvent<{ missionId: number }>) => {
      setSelectedMissionId(e.detail.missionId);
    };
    
    window.addEventListener('mission-selected' as any, handleMissionSelect);
    return () => window.removeEventListener('mission-selected' as any, handleMissionSelect);
  }, []);

  // Listen for real ADS-B data from receiver
  useEffect(() => {
    const handleAdsbUpdate = (e: CustomEvent<Aircraft[]>) => {
      setAircraft(e.detail);
    };

    window.addEventListener('adsb-update' as any, handleAdsbUpdate);
    return () => window.removeEventListener('adsb-update' as any, handleAdsbUpdate);
  }, []);

  // Listen for GPS-denied fused position updates.
  useEffect(() => {
    const handleGpsDenied = (
      e: CustomEvent<{
        active: boolean;
        method: "visual" | "dead" | "hybrid";
        estimatedPosition: { lat: number; lng: number } | null;
        breadcrumbs: { lat: number; lng: number }[];
        backtracing: boolean;
      }>,
    ) => {
      setGpsDeniedNav({
        active: Boolean(e.detail?.active),
        method: e.detail?.method || "hybrid",
        estimatedPosition: e.detail?.estimatedPosition || null,
        breadcrumbs: e.detail?.breadcrumbs || [],
        backtracing: Boolean(e.detail?.backtracing),
      });
    };
    window.addEventListener("gps-denied-position-update" as any, handleGpsDenied);
    return () => window.removeEventListener("gps-denied-position-update" as any, handleGpsDenied);
  }, []);

  const getTileUrl = () => {
    switch(mapType) {
      case 'satellite':
        return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      case 'street':
        return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      case 'dark':
      default:
        return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      
      if (!response.ok) {
        throw new Error("Geocoding request failed");
      }
      
      const results = await response.json();
      
      if (results.length > 0) {
        const lat = parseFloat(results[0].lat);
        const lon = parseFloat(results[0].lon);
        setSearchResult({ lat, lon, name: results[0].display_name });
        toast.success(`Found: ${results[0].display_name.substring(0, 50)}...`);
      } else {
        toast.error("Location not found");
      }
    } catch (error) {
      toast.error("Search failed - please try again");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdsbMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAdsbDragging(true);
    setAdsbDragOffset({ x: e.clientX - adsbPosition.x, y: e.clientY - adsbPosition.y });
  };

  // Use window event listeners for drag tracking
  useEffect(() => {
    if (!adsbDragging) return;
    
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 220, e.clientX - adsbDragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - adsbDragOffset.y));
      setAdsbPosition({ x: newX, y: newY });
    };
    
    const handleMouseUp = () => {
      setAdsbDragging(false);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [adsbDragging, adsbDragOffset]);

  // Get selected drone's GPS position for centering
  const selectedDrone = selectedDroneId ? allDrones.find(d => d.id === selectedDroneId) : null;
  const selectedDronePosition: [number, number] | null = 
    gpsDeniedNav.active && gpsDeniedNav.estimatedPosition
      ? [gpsDeniedNav.estimatedPosition.lat, gpsDeniedNav.estimatedPosition.lng]
      : liveTelemetryPosition
      ? liveTelemetryPosition
      : selectedDrone?.latitude && selectedDrone?.longitude 
      ? [selectedDrone.latitude, selectedDrone.longitude] 
      : null;

  useEffect(() => {
    // If operator geolocation is unavailable and we have drone telemetry,
    // use drone position as operator reference for 30-mile overlay filtering.
    if (
      selectedDronePosition &&
      currentLocation[0] === DEFAULT_LAT &&
      currentLocation[1] === DEFAULT_LNG
    ) {
      // Avoid update loops when selectedDronePosition is the same as current/default.
      const [nextLat, nextLng] = selectedDronePosition;
      if (Math.abs(currentLocation[0] - nextLat) > 1e-9 || Math.abs(currentLocation[1] - nextLng) > 1e-9) {
        setCurrentLocation(selectedDronePosition);
      }
    }
  }, [selectedDronePosition, currentLocation]);

  return (
    <div className="w-full h-full relative z-0 bg-background group">
      <MapErrorBoundary>
      <MapContainer 
        center={position} 
        zoom={18} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ background: '#0f172a' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url={getTileUrl()}
        />
        <NoFlyZoneOverlay zones={noFlyZones} />
        <RegulatoryGeoJsonOverlay 
          controlClassName="top-20 left-4" 
          dronePosition={selectedDronePosition}
          operatorPosition={currentLocation}
        />
        
        <ZoomControls dronePosition={selectedDronePosition} operatorPosition={currentLocation} />
        <MapCenterPersist />
        <MapCenterUpdater searchResult={searchResult} />
        
        {/* Search Result Marker */}
        {searchResult && (
          <Marker position={[searchResult.lat, searchResult.lon]}>
            <Popup>
              <div className="text-sm max-w-xs">
                <strong>Search Result</strong><br/>
                {searchResult.name}
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* All Connected Drones */}
        {allDrones.map((drone) => {
          const hasPosition = drone.latitude && drone.longitude;
          const dronePos: [number, number] = hasPosition 
            ? [drone.latitude!, drone.longitude!] 
            : position; // Fall back to current location for drones without position
          const isSelected = drone.id === selectedDroneId;
          
          // Parse geofence data for this drone
          const geofence = drone.geofenceData as { 
            type?: 'circle' | 'polygon'; 
            center?: { lat: number; lng: number }; 
            radius?: number; 
            points?: { lat: number; lng: number }[];
            maxAltitude?: number;
          } | null;
          
          return (
            <div key={drone.id}>
              {/* Drone Marker */}
              <Marker 
                position={dronePos} 
                icon={createDroneIcon(drone.status, isSelected)}
              >
                <Tooltip 
                  permanent={false} 
                  direction="top" 
                  offset={[0, -12]}
                  className="leaflet-tooltip-drone"
                >
                  <div className="font-mono text-[10px] leading-tight whitespace-nowrap">
                    <strong>{drone.callsign}</strong>
                    <span className="mx-1">|</span>
                    ALT: {drone.altitude?.toFixed(0) ?? '--'}m
                    <span className="mx-1">|</span>
                    BAT: {drone.batteryPercent ?? '--'}%
                    {drone.status === 'flying' && (
                      <>
                        <span className="mx-1">|</span>
                        <span className="text-blue-500">FLYING</span>
                      </>
                    )}
                  </div>
                </Tooltip>
                <Popup>
                  <div className="font-sans text-sm min-w-[200px]">
                    <div className="flex items-center justify-between mb-2">
                      <strong className="text-base">{drone.callsign}</strong>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        drone.status === 'flying' ? 'bg-blue-100 text-blue-700' :
                        drone.status === 'online' ? 'bg-emerald-100 text-emerald-700' :
                        drone.status === 'armed' ? 'bg-amber-100 text-amber-700' :
                        drone.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{drone.status}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">{drone.name}</div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Battery:</span>
                        <span className={`font-medium ${
                          (drone.batteryPercent || 0) > 50 ? 'text-emerald-600' :
                          (drone.batteryPercent || 0) > 20 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>{drone.batteryPercent ?? '--'}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Signal:</span>
                        <span className="font-medium">{drone.signalStrength ?? '--'}%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Alt:</span>
                        <span className="font-medium">{drone.altitude?.toFixed(1) ?? '--'}m</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">GPS:</span>
                        <span className={`font-medium ${
                          drone.gpsStatus === '3d_fix' || drone.gpsStatus === 'rtk_fixed' ? 'text-emerald-600' :
                          drone.gpsStatus === '2d_fix' ? 'text-amber-600' :
                          'text-red-600'
                        }`}>{drone.gpsStatus?.replace('_', ' ') || 'No Fix'}</span>
                      </div>
                    </div>
                    
                    <div className="text-xs border-t pt-2 mt-2">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-gray-500">Model:</span>
                        <span>{drone.model} ({drone.motorCount}M)</span>
                      </div>
                      {drone.currentMissionId && (
                        <div className="flex items-center gap-1 text-blue-600">
                          <span>Mission #{drone.currentMissionId}</span>
                          {drone.currentWaypointIndex && (
                            <span>• WP {drone.currentWaypointIndex}</span>
                          )}
                        </div>
                      )}
                      {drone.geofenceEnabled && (
                        <div className="flex items-center gap-1 text-amber-600">
                          <span>Geofence Active</span>
                        </div>
                      )}
                    </div>
                    
                    {isSelected && (
                      <div className="mt-2 pt-2 border-t text-center text-xs font-medium text-primary">
                        Currently Controlled
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
              
              {/* Camera Footprint Visualization - shows camera field of view based on altitude */}
              {isSelected && drone.altitude && drone.altitude > 0 && hasPosition && (
                <Circle
                  center={dronePos}
                  radius={calculateCameraFootprint(drone.altitude)}
                  pathOptions={{
                    color: '#06b6d4',
                    fillColor: '#06b6d4',
                    fillOpacity: 0.15,
                    weight: 1,
                    dashArray: '3, 6',
                  }}
                >
                  <Popup>
                    <div className="font-mono text-xs">
                      <strong>Camera Footprint</strong><br/>
                      Altitude: {drone.altitude?.toFixed(1)}m<br/>
                      Coverage: ~{calculateCameraFootprint(drone.altitude) * 2}m diameter<br/>
                      <span className="text-gray-500">Based on 60° FOV</span>
                    </div>
                  </Popup>
                </Circle>
              )}
              
              {/* Drone's Geofence Zone (if enabled and has data) */}
              {drone.geofenceEnabled && geofence && (
                <>
                  {geofence.type === 'circle' && geofence.center && geofence.radius && (
                    <Circle
                      center={[geofence.center.lat, geofence.center.lng]}
                      radius={geofence.radius}
                      pathOptions={{
                        color: isSelected ? '#f59e0b' : '#94a3b8',
                        fillColor: isSelected ? '#f59e0b' : '#94a3b8',
                        fillOpacity: 0.1,
                        weight: isSelected ? 2 : 1,
                        dashArray: '5, 5',
                      }}
                    />
                  )}
                  {geofence.type === 'polygon' && geofence.points && geofence.points.length >= 3 && (
                    <Polygon
                      positions={geofence.points.map(p => [p.lat, p.lng] as [number, number])}
                      pathOptions={{
                        color: isSelected ? '#f59e0b' : '#94a3b8',
                        fillColor: isSelected ? '#f59e0b' : '#94a3b8',
                        fillOpacity: 0.1,
                        weight: isSelected ? 2 : 1,
                        dashArray: '5, 5',
                      }}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Fallback: Show current position if no drones */}
        {allDrones.length === 0 && (
          <Marker position={position} icon={DroneIcon}>
            <Popup>
              <div className="font-mono text-sm">
                <strong>M.O.U.S.E GCS</strong><br/>
                No drones connected<br/>
                Add a drone to get started
              </div>
            </Popup>
          </Marker>
        )}

        {/* Home Position */}
        <Marker position={currentLocation} icon={HomeIcon}>
           <Popup>Home Point (Operator Location)</Popup>
        </Marker>

        {/* Mission Waypoints */}
        {missionWaypoints.map((wp, idx) => (
          <Marker 
            key={wp.id} 
            position={[wp.latitude, wp.longitude]} 
            icon={WaypointIcon(wp.order)}
          >
            <Popup>
              <div className="font-mono text-sm">
                <strong>Waypoint {wp.order}</strong><br/>
                Alt: {wp.altitude}m | Speed: {wp.speed || 'Auto'} m/s<br/>
                {wp.action && <span>Action: {wp.action}</span>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Mission Flight Path - from operator location to waypoints */}
        {missionWaypoints.length > 0 && (
          <Polyline 
            positions={[currentLocation, ...missionWaypoints.map(wp => [wp.latitude, wp.longitude] as [number, number])]} 
            pathOptions={{ color: 'hsl(190 90% 50%)', weight: 2, dashArray: '5, 10' }} 
          />
        )}
        
        {/* ADS-B Aircraft */}
        {showAdsb && aircraft.map(ac => (
          <Marker 
            key={ac.id} 
            position={[ac.lat, ac.lon]} 
            icon={AircraftIcon(ac.heading, ac.threat)}
          >
            <Popup>
              <div className="font-mono text-sm space-y-1 min-w-[180px]">
                <div className="flex items-center justify-between border-b pb-1 mb-1">
                  <strong className="text-base">{ac.callsign}</strong>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    ac.threat === 'high' ? 'bg-red-500 text-white' : 
                    ac.threat === 'medium' ? 'bg-amber-500 text-black' : 
                    'bg-blue-500 text-white'
                  }`}>
                    {ac.threat.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  <span className="text-gray-500">Altitude:</span>
                  <span>{Math.round(ac.altitude)} ft</span>
                  <span className="text-gray-500">Speed:</span>
                  <span>{ac.speed} kts</span>
                  <span className="text-gray-500">Heading:</span>
                  <span>{ac.heading}°</span>
                  <span className="text-gray-500">V/S:</span>
                  <span>{ac.verticalRate > 0 ? '+' : ''}{ac.verticalRate} fpm</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* GPS-denied estimated position and breadcrumb trail */}
        {gpsDeniedNav.estimatedPosition && (
          <>
            <Marker
              position={[gpsDeniedNav.estimatedPosition.lat, gpsDeniedNav.estimatedPosition.lng]}
              icon={EstimatedNavIcon}
            >
              <Popup>
                <div className="font-mono text-xs">
                  <strong>GPS-Denied Navigation</strong><br />
                  Mode: {gpsDeniedNav.method.toUpperCase()}<br />
                  Status: {gpsDeniedNav.active ? "ACTIVE" : "STANDBY"}<br />
                  {gpsDeniedNav.backtracing ? "Backtrace in progress" : "Estimating local pose"}
                </div>
              </Popup>
            </Marker>
            {gpsDeniedNav.breadcrumbs.length > 1 && (
              <Polyline
                positions={gpsDeniedNav.breadcrumbs.map((p) => [p.lat, p.lng] as [number, number])}
                pathOptions={{
                  color: gpsDeniedNav.backtracing ? "#f59e0b" : "#38bdf8",
                  weight: 2,
                  dashArray: "3,6",
                }}
              />
            )}
          </>
        )}
      </MapContainer>
      </MapErrorBoundary>

      {/* Search Bar Overlay */}
      <div className="absolute top-4 left-4 z-[400] w-72">
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search address or coords..." 
              className="pl-8 bg-card/80 backdrop-blur-md border-border text-foreground"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button 
            variant="secondary" 
            size="icon" 
            className="bg-card/80 backdrop-blur-md"
            onClick={handleSearch}
            disabled={isSearching}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Map Layer Controls */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
        <div className="bg-card/80 backdrop-blur-md p-1 rounded-lg border border-border shadow-lg flex flex-col gap-1">
           <Button 
            variant={mapType === 'dark' ? "default" : "ghost"} 
            size="sm" 
            className="justify-start h-8 px-2 text-xs"
            onClick={() => setMapType('dark')}
           >
             <MapIcon className="w-3 h-3 mr-2" /> Dark Map
           </Button>
           <Button 
            variant={mapType === 'satellite' ? "default" : "ghost"} 
            size="sm" 
            className="justify-start h-8 px-2 text-xs"
            onClick={() => setMapType('satellite')}
           >
             <Layers className="w-3 h-3 mr-2" /> Satellite
           </Button>
           <Button 
            variant={mapType === 'street' ? "default" : "ghost"} 
            size="sm" 
            className="justify-start h-8 px-2 text-xs"
            onClick={() => setMapType('street')}
           >
             <MapIcon className="w-3 h-3 mr-2" /> Street
           </Button>
        </div>
        <div className="bg-card/80 backdrop-blur-md px-3 py-2 rounded-lg border border-border shadow-lg text-xs">
          <div className="font-semibold">No-Fly Overlay</div>
          <div className="text-muted-foreground">{noFlyZones.length} restricted zone(s)</div>
        </div>
      </div>

      <NoFlyZoneLegend className="absolute bottom-4 right-4 z-[400]" />

      {/* ADS-B Panel - Draggable */}
      <div 
        className="absolute z-[400] bg-card/90 backdrop-blur rounded-lg border border-border shadow-lg min-w-[200px]"
        style={{ left: adsbPosition.x, top: adsbPosition.y }}
        data-testid="adsb-panel"
      >
        {/* Drag Handle - only this area triggers dragging */}
        <div 
          className={`flex items-center justify-between p-3 pb-2 select-none ${adsbDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleAdsbMouseDown}
        >
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-blue-500" />
            <span className="font-bold text-sm">ADS-B Traffic</span>
            <span className="text-[10px] text-muted-foreground">(drag)</span>
          </div>
          <Switch 
            checked={showAdsb} 
            onCheckedChange={setShowAdsb}
            data-testid="switch-adsb-map"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="px-3 pb-3">
        {showAdsb && aircraft.length === 0 && (
          <div className="text-xs text-muted-foreground italic py-2">
            Awaiting ADS-B feed...
          </div>
        )}
        {showAdsb && aircraft.length > 0 && (
          <div className="space-y-1.5 max-h-32 overflow-auto">
            {aircraft.map(ac => (
              <div 
                key={ac.id} 
                className={`flex items-center justify-between text-xs p-1.5 rounded ${
                  ac.threat === 'high' ? 'bg-red-500/20 text-red-400' : 
                  ac.threat === 'medium' ? 'bg-amber-500/20 text-amber-400' : 
                  'bg-blue-500/10 text-blue-400'
                }`}
                data-testid={`adsb-aircraft-${ac.id}`}
              >
                <span className="font-mono font-bold">{ac.callsign}</span>
                <span>{Math.round(ac.altitude)}ft</span>
                <span>{ac.speed}kts</span>
              </div>
            ))}
          </div>
        )}
        {showAdsb && aircraft.filter(a => a.threat === 'high').length > 0 && (
          <div className="mt-2 p-2 bg-red-500/20 rounded text-xs text-red-400 font-bold animate-pulse">
            ⚠️ TRAFFIC ALERT: {aircraft.filter(a => a.threat === 'high').length} nearby aircraft
          </div>
        )}
        </div>
      </div>

      {/* Zoom Level Indicator */}
      <div className="absolute bottom-4 left-4 z-[400] bg-card/80 backdrop-blur px-3 py-1 rounded text-xs font-mono text-muted-foreground">
        Lat: {(gpsDeniedNav.estimatedPosition?.lat ?? position[0]).toFixed(4)} | Lon: {(gpsDeniedNav.estimatedPosition?.lng ?? position[1]).toFixed(4)}
      </div>
    </div>
  );
}
