import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { GeoJSON } from "react-leaflet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

const DEFAULT_RADIUS_MILES = 30;

type FeatureCollection = {
  type: "FeatureCollection";
  features: any[];
};

interface LayerConfig {
  id: string;
  label: string;
  file: string;
  color: string;
  defaultOn: boolean;
  maxBytes?: number;
}

const LAYERS: LayerConfig[] = [
  {
    id: "faa-facility",
    label: "FAA UAS Facility Map",
    file: "/airspace/FAA_UAS_FacilityMap_Data.geojson",
    color: "#22c55e",
    defaultOn: false,
    maxBytes: 500 * 1024 * 1024,
  },
  {
    id: "national-security",
    label: "National Security Restrictions",
    file: "/airspace/National_Security_UAS_Flight_Restrictions.geojson",
    color: "#ef4444",
    defaultOn: true,
    maxBytes: 200 * 1024 * 1024,
  },
  {
    id: "part-time-security",
    label: "Part-Time Security Restrictions",
    file: "/airspace/Part_Time_National_Security_UAS_Flight_Restrictions.geojson",
    color: "#f59e0b",
    defaultOn: true,
  },
  {
    id: "pending-security",
    label: "Pending Security Restrictions",
    file: "/airspace/Pending_National_Security_UAS_Flight_Restrictions.geojson",
    color: "#3b82f6",
    defaultOn: true,
  },
];

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getGeometryCenter(geom: any): [number, number] | null {
  if (!geom) return null;
  if (geom.type === "Point") return geom.coordinates ? [geom.coordinates[1], geom.coordinates[0]] : null;
  if (geom.type === "Polygon" && geom.coordinates?.[0]?.length) {
    const coords = geom.coordinates[0];
    let lat = 0, lon = 0;
    for (const c of coords) {
      lon += c[0];
      lat += c[1];
    }
    return [lat / coords.length, lon / coords.length];
  }
  if (geom.type === "MultiPolygon" && geom.coordinates?.length) {
    const first = geom.coordinates[0]?.[0];
    if (!first?.length) return null;
    let lat = 0, lon = 0;
    for (const c of first) {
      lon += c[0];
      lat += c[1];
    }
    return [lat / first.length, lon / first.length];
  }
  return null;
}

function filterByRadius(
  fc: FeatureCollection | null,
  dronePos: [number, number] | null,
  operatorPos: [number, number] | null,
  radiusMeters: number,
): FeatureCollection | null {
  if (!fc?.features?.length) return fc;
  const refs = [dronePos, operatorPos].filter(Boolean) as [number, number][];
  if (refs.length === 0) return fc;
  const filtered = fc.features.filter((f) => {
    const center = getGeometryCenter(f.geometry);
    if (!center) return true;
    const [lat, lon] = center;
    return refs.some(([refLat, refLon]) => haversineMeters(lat, lon, refLat, refLon) <= radiusMeters);
  });
  return { ...fc, features: filtered };
}

interface RegulatoryGeoJsonOverlayProps {
  showControl?: boolean;
  controlClassName?: string;
  dronePosition?: [number, number] | null;
  operatorPosition?: [number, number] | null;
}

export function RegulatoryGeoJsonOverlay({
  showControl = true,
  controlClassName = "",
  dronePosition = null,
  operatorPosition = null,
}: RegulatoryGeoJsonOverlayProps) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultOn])),
  );
  const [displayRangeMiles, setDisplayRangeMiles] = useState<number>(() => {
    const raw = Number(localStorage.getItem("mouse_airspace_display_range_miles") || DEFAULT_RADIUS_MILES);
    return Number.isFinite(raw) ? Math.max(1, Math.min(200, raw)) : DEFAULT_RADIUS_MILES;
  });
  const [data, setData] = useState<Record<string, FeatureCollection | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [panelPos, setPanelPos] = useState(() => {
    try {
      const saved = localStorage.getItem("mouse_faa_panel_pos");
      return saved ? JSON.parse(saved) : { x: 16, y: 16 };
    } catch { return { x: 16, y: 16 }; }
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const radiusMeters = displayRangeMiles * 1609.344;

  useEffect(() => {
    localStorage.setItem("mouse_faa_panel_pos", JSON.stringify(panelPos));
  }, [panelPos]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y };
  }, [panelPos]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPanelPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragStartRef.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragStartRef.current.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const onSession = (e: CustomEvent<{ isLoggedIn?: boolean }>) => {
      if (e.detail?.isLoggedIn) {
        setEnabled(Object.fromEntries(LAYERS.map((l) => [l.id, true])));
      }
    };
    window.addEventListener("session-change" as any, onSession);
    return () => window.removeEventListener("session-change" as any, onSession);
  }, []);

  useEffect(() => {
    const syncRange = () => {
      const raw = Number(localStorage.getItem("mouse_airspace_display_range_miles") || DEFAULT_RADIUS_MILES);
      const next = Number.isFinite(raw) ? Math.max(1, Math.min(200, raw)) : DEFAULT_RADIUS_MILES;
      setDisplayRangeMiles(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "mouse_airspace_display_range_miles") return;
      syncRange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("airspace-display-range-changed", syncRange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("airspace-display-range-changed", syncRange as EventListener);
    };
  }, []);

  useEffect(() => {
    const layersToLoad = LAYERS.filter((layer) => enabled[layer.id] && !data[layer.id] && !loading[layer.id]);
    if (layersToLoad.length === 0) return;

    let active = true;
    const loadAll = async () => {
      for (const layer of layersToLoad) {
        setLoading((prev) => ({ ...prev, [layer.id]: true }));
        try {
          if (layer.maxBytes) {
            const head = await fetch(layer.file, { method: "HEAD" });
            const len = Number(head.headers.get("content-length") || "0");
            if (Number.isFinite(len) && len > layer.maxBytes) {
              setErrors((prev) => ({
                ...prev,
                [layer.id]: `Layer too large (${Math.round(len / (1024 * 1024))}MB). Keep disabled to avoid UI lockups.`,
              }));
              setData((prev) => ({ ...prev, [layer.id]: null }));
              continue;
            }
          }
          const res = await fetch(layer.file);
          if (!res.ok) throw new Error(`Failed to load ${layer.file}`);
          const json = await res.json();
          if (!active) return;
          setData((prev) => ({ ...prev, [layer.id]: json }));
          setErrors((prev) => ({ ...prev, [layer.id]: "" }));
        } catch {
          if (!active) return;
          setData((prev) => ({ ...prev, [layer.id]: null }));
          setErrors((prev) => ({ ...prev, [layer.id]: "Failed to load layer" }));
        } finally {
          if (active) setLoading((prev) => ({ ...prev, [layer.id]: false }));
        }
      }
    };
    void loadAll();

    return () => {
      active = false;
    };
  }, [enabled, data, loading]);

  const activeLayers = useMemo(() => LAYERS.filter((l) => enabled[l.id] && data[l.id]), [enabled, data]);

  const filteredData = useMemo(() => {
    const out: Record<string, FeatureCollection | null> = {};
    for (const layer of activeLayers) {
      const raw = data[layer.id];
      out[layer.id] = filterByRadius(raw, dronePosition, operatorPosition, radiusMeters);
    }
    return out;
  }, [activeLayers, data, dronePosition, operatorPosition, radiusMeters]);

  const totalVisibleFeatures = useMemo(
    () =>
      activeLayers.reduce((sum, layer) => {
        const count = filteredData[layer.id]?.features?.length || 0;
        return sum + count;
      }, 0),
    [activeLayers, filteredData],
  );

  return (
    <>
      {activeLayers.map((layer) => {
        const fc = filteredData[layer.id];
        if (!fc?.features?.length) return null;
        return (
          <GeoJSON
            key={layer.id}
            data={fc as any}
            style={() => ({
              color: layer.color,
              weight: 2,
              opacity: 0.9,
              fillColor: layer.color,
              fillOpacity: 0.15,
            })}
          />
        );
      })}

      {showControl && (
        <div
          ref={panelRef}
          className={`fixed z-[450] bg-card/90 backdrop-blur-md rounded-lg border border-border shadow-lg ${controlClassName}`.trim()}
          style={{ left: panelPos.x, top: panelPos.y, width: collapsed ? "auto" : 288 }}
          data-testid="faa-overlay-panel"
        >
          <div className="flex items-center justify-between p-2 gap-1">
            <button
              className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground"
              onMouseDown={handleDragStart}
              data-testid="faa-panel-drag"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold flex-1">FAA Overlays</span>
            <span className="text-[10px] text-muted-foreground mr-1">{totalVisibleFeatures}</span>
            <button
              className="p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed((c) => !c)}
              data-testid="faa-panel-toggle"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </div>
          {!collapsed && (
            <div className="px-3 pb-3 space-y-2">
              {LAYERS.map((layer) => (
                <div key={layer.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: layer.color }} />
                      <Label className="text-[11px] truncate">{layer.label}</Label>
                    </div>
                    <Switch
                      checked={Boolean(enabled[layer.id])}
                      onCheckedChange={(checked) => setEnabled((prev) => ({ ...prev, [layer.id]: checked }))}
                    />
                  </div>
                  {loading[layer.id] && <p className="text-[10px] text-blue-400 animate-pulse">Loading...</p>}
                  {errors[layer.id] && <p className="text-[10px] text-amber-500">{errors[layer.id]}</p>}
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                Visible within {displayRangeMiles}mi: {totalVisibleFeatures} feature(s).
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
