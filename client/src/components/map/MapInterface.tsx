import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import { Search, Map as MapIcon, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Fix for default marker icons in React Leaflet
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icons
const DroneIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="relative flex items-center justify-center w-8 h-8">
          <div class="absolute w-full h-full bg-primary/30 rounded-full animate-ping"></div>
          <div class="absolute w-4 h-4 bg-primary border-2 border-white rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const HomeIcon = L.divIcon({
  className: "bg-transparent",
  html: `<div class="flex items-center justify-center w-6 h-6 bg-emerald-500 text-white rounded-sm border-2 border-white font-bold text-xs shadow-md">H</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const WaypointIcon = (num: number) => L.divIcon({
  className: "bg-transparent",
  html: `<div class="flex items-center justify-center w-6 h-6 bg-accent text-black rounded-full border-2 border-white font-bold text-xs shadow-md">${num}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});


export function MapInterface() {
  const position: [number, number] = [34.0522, -118.2437]; // LA coordinates example
  const flightPath: [number, number][] = [
    [34.0522, -118.2437],
    [34.0525, -118.2440],
    [34.0530, -118.2435],
    [34.0528, -118.2425],
  ];

  const [mapType, setMapType] = useState<'dark' | 'satellite' | 'street'>('dark');

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

  return (
    <div className="w-full h-full relative z-0 bg-background group">
      <MapContainer 
        center={position} 
        zoom={18} 
        scrollWheelZoom={true} 
        className="w-full h-full"
        style={{ background: '#0f172a' }}
      >
        {/* Map Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={getTileUrl()}
        />
        
        {/* Drone Position */}
        <Marker position={position} icon={DroneIcon}>
          <Popup>
            <div className="font-mono text-sm">
              <strong>M.O.U.S.E Drone</strong><br/>
              Status: Airborne<br/>
              Alt: 45m
            </div>
          </Popup>
        </Marker>

        {/* Home Position */}
        <Marker position={[34.0520, -118.2435]} icon={HomeIcon}>
           <Popup>Home Point</Popup>
        </Marker>

        {/* Waypoints */}
        <Marker position={[34.0530, -118.2435]} icon={WaypointIcon(1)} />
        <Marker position={[34.0528, -118.2425]} icon={WaypointIcon(2)} />

        {/* Flight Path */}
        <Polyline 
          positions={flightPath} 
          pathOptions={{ color: 'hsl(190 90% 50%)', weight: 2, dashArray: '5, 10' }} 
        />
        
        {/* Safe Zone / GeoFence */}
        <Circle 
          center={[34.0522, -118.2437]} 
          pathOptions={{ color: 'hsl(0 85% 60%)', fillColor: 'hsl(0 85% 60%)', fillOpacity: 0.1, weight: 1, dashArray: '4' }} 
          radius={200} 
        />
      </MapContainer>

      {/* Search Bar Overlay */}
      <div className="absolute top-4 left-4 z-[400] w-72">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search address or coords..." 
            className="pl-8 bg-card/80 backdrop-blur-md border-border text-foreground"
          />
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
      </div>
    </div>
  );
}
