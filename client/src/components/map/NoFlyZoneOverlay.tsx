import { Circle, Polygon, Popup } from "react-leaflet";
import type { NoFlyZone } from "@/lib/noFlyZones";

interface NoFlyZoneOverlayProps {
  zones: NoFlyZone[];
}

const restrictedPath = {
  color: "hsl(0 84% 60%)",
  fillColor: "hsl(0 84% 60%)",
  fillOpacity: 0.15,
  weight: 2,
  dashArray: "6, 4",
};

export function NoFlyZoneOverlay({ zones }: NoFlyZoneOverlayProps) {
  return (
    <>
      {zones.map((zone) => {
        if (zone.type === "circle" && zone.center && zone.radius) {
          return (
            <Circle key={zone.id} center={[zone.center.lat, zone.center.lng]} radius={zone.radius} pathOptions={restrictedPath}>
              <Popup>
                <div className="font-mono text-xs">
                  <strong>No-Fly Zone</strong>
                  <br />
                  {zone.name}
                  <br />
                  Radius: {Math.round(zone.radius)}m
                </div>
              </Popup>
            </Circle>
          );
        }

        if ((zone.type === "polygon" || zone.type === "custom") && zone.points && zone.points.length >= 3) {
          return (
            <Polygon key={zone.id} positions={zone.points.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={restrictedPath}>
              <Popup>
                <div className="font-mono text-xs">
                  <strong>No-Fly Zone</strong>
                  <br />
                  {zone.name}
                  <br />
                  Points: {zone.points.length}
                </div>
              </Popup>
            </Polygon>
          );
        }

        return null;
      })}
    </>
  );
}
