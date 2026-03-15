import { MapContainer, TileLayer, Marker, Polyline, Circle, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, MapPin, Layers, Map as MapIcon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { NoFlyZoneOverlay } from "@/components/map/NoFlyZoneOverlay";
import { NoFlyZoneLegend } from "@/components/map/NoFlyZoneLegend";
import { RegulatoryGeoJsonOverlay } from "@/components/map/RegulatoryGeoJsonOverlay";
import { useNoFlyZones } from "@/hooks/useNoFlyZones";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const HomeIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="flex items-center justify-center w-6 h-6 bg-emerald-500 text-white rounded-sm border-2 border-white font-bold text-xs shadow-md">H</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const WaypointIcon = (num: number, action?: string | null) => {
  const color = action === 'hover' ? 'bg-amber-500' : 
                action === 'patrol' ? 'bg-purple-500' :
                action === 'rtl' ? 'bg-emerald-500' :
                action === 'alert' ? 'bg-red-500' : 'bg-primary';
  return L.divIcon({
    className: "bg-transparent",
    html: `<div class="flex items-center justify-center w-6 h-6 ${color} text-white rounded-full border-2 border-white font-bold text-xs shadow-md">${num}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

interface Waypoint {
  id?: number;
  order: number;
  latitude: number;
  longitude: number;
  altitude: number;
  action?: string | null;
}

interface MissionMapProps {
  waypoints: Waypoint[];
  homePosition?: [number, number];
  onMapClick?: (lat: number, lng: number) => void;
  clickEnabled?: boolean;
  showClickHint?: boolean;
}

function MapClickHandler({ onClick, enabled }: { onClick: (lat: number, lng: number) => void; enabled: boolean }) {
  useMapEvents({
    click: (e) => {
      if (enabled) {
        onClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function ZoomControls() {
  const map = useMap();
  
  return (
    <div className="absolute bottom-4 right-4 z-[400] flex flex-col gap-1 bg-card/90 backdrop-blur rounded-lg border border-border p-1">
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => map.zoomIn()}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => map.zoomOut()}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={() => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
              () => map.setView([36.0957, -79.4378], 16)
            );
          }
        }}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function MissionMap({ waypoints, homePosition, onMapClick, clickEnabled = false, showClickHint = false }: MissionMapProps) {
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [mapType, setMapType] = useState<'dark' | 'satellite' | 'street'>('dark');
  const noFlyZones = useNoFlyZones();

  // Get user's actual GPS location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.log("Geolocation error:", error.message);
          // Fallback to Burlington, NC if geolocation fails
          setCurrentLocation([36.0957, -79.4378]);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      // Fallback to Burlington, NC
      setCurrentLocation([36.0957, -79.4378]);
    }
  }, []);

  const defaultPosition: [number, number] = homePosition || currentLocation || [36.0957, -79.4378];

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

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (onMapClick) {
      onMapClick(lat, lng);
      toast.success(`Waypoint added at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  }, [onMapClick]);

  const orderedWaypoints = [...waypoints].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    return orderDiff !== 0 ? orderDiff : (a.id ?? 0) - (b.id ?? 0);
  });
  const flightPath: [number, number][] = orderedWaypoints.map(wp => [wp.latitude, wp.longitude]);
  if (homePosition && flightPath.length > 0) {
    flightPath.unshift(homePosition);
  }

  return (
    <div className="w-full h-full relative z-0 bg-background">
      <MapContainer 
        center={defaultPosition} 
        zoom={16} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ background: '#0f172a' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url={getTileUrl()}
        />
        
        <MapClickHandler onClick={handleMapClick} enabled={clickEnabled} />
        <ZoomControls />
        <NoFlyZoneOverlay zones={noFlyZones} />
        <RegulatoryGeoJsonOverlay operatorPosition={homePosition || currentLocation || undefined} />

        {homePosition && (
          <Marker position={homePosition} icon={HomeIcon} />
        )}

        {orderedWaypoints.map((wp, idx) => (
          <Marker 
            key={wp.id || idx} 
            position={[wp.latitude, wp.longitude]} 
            icon={WaypointIcon(idx + 1, wp.action || undefined)} 
          />
        ))}

        {flightPath.length > 1 && (
          <Polyline 
            positions={flightPath} 
            pathOptions={{ color: 'hsl(190 90% 50%)', weight: 2, dashArray: '5, 10' }} 
          />
        )}

        {homePosition && (
          <Circle 
            center={homePosition} 
            pathOptions={{ color: 'hsl(0 85% 60%)', fillColor: 'hsl(0 85% 60%)', fillOpacity: 0.1, weight: 1, dashArray: '4' }} 
            radius={200} 
          />
        )}
      </MapContainer>

      {showClickHint && clickEnabled && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg animate-pulse">
          <MapPin className="h-4 w-4" />
          Click on the map to add a waypoint
        </div>
      )}

      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-1">
        <div className="bg-card/90 backdrop-blur p-1 rounded-lg border border-border shadow-lg flex flex-col gap-1">
          <Button 
            variant={mapType === 'dark' ? "default" : "ghost"} 
            size="sm" 
            className="justify-start h-7 px-2 text-xs"
            onClick={() => setMapType('dark')}
          >
            <MapIcon className="w-3 h-3 mr-1" /> Dark
          </Button>
          <Button 
            variant={mapType === 'satellite' ? "default" : "ghost"} 
            size="sm" 
            className="justify-start h-7 px-2 text-xs"
            onClick={() => setMapType('satellite')}
          >
            <Layers className="w-3 h-3 mr-1" /> Satellite
          </Button>
          <Button 
            variant={mapType === 'street' ? "default" : "ghost"} 
            size="sm" 
            className="justify-start h-7 px-2 text-xs"
            onClick={() => setMapType('street')}
          >
            <MapIcon className="w-3 h-3 mr-1" /> Street
          </Button>
        </div>
      </div>

      <NoFlyZoneLegend className="absolute bottom-4 left-4 z-[400]" />
    </div>
  );
}
