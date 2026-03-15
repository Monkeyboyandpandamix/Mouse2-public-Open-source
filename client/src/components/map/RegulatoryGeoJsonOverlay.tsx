import { useEffect, useMemo, useState } from "react";
import { GeoJSON } from "react-leaflet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
    maxBytes: 50 * 1024 * 1024,
  },
  {
    id: "national-security",
    label: "National Security Restrictions",
    file: "/airspace/National_Security_UAS_Flight_Restrictions.geojson",
    color: "#ef4444",
    defaultOn: true,
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

interface RegulatoryGeoJsonOverlayProps {
  showControl?: boolean;
  controlClassName?: string;
}

export function RegulatoryGeoJsonOverlay({
  showControl = true,
  controlClassName = "",
}: RegulatoryGeoJsonOverlayProps) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(LAYERS.map((l) => [l.id, l.defaultOn])),
  );
  const [data, setData] = useState<Record<string, FeatureCollection | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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
            if (!Number.isFinite(len) || len <= 0) {
              setErrors((prev) => ({
                ...prev,
                [layer.id]: "Layer size unknown. Loading blocked for safety.",
              }));
              setData((prev) => ({ ...prev, [layer.id]: null }));
              continue;
            }
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

  return (
    <>
      {activeLayers.map((layer) => (
        <GeoJSON
          key={layer.id}
          data={data[layer.id] as any}
          style={() => ({
            color: layer.color,
            weight: 2,
            opacity: 0.9,
            fillColor: layer.color,
            fillOpacity: 0.15,
          })}
        />
      ))}

      {showControl && (
        <div
          className={`absolute top-4 left-4 z-[450] w-72 bg-card/90 backdrop-blur-md rounded-lg border border-border shadow-lg p-3 space-y-2 ${controlClassName}`.trim()}
        >
          <div className="text-xs font-semibold">FAA Regulatory Overlays</div>
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
              {errors[layer.id] && <p className="text-[10px] text-amber-500">{errors[layer.id]}</p>}
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            FAA Facility Map is large and is loaded on demand when enabled.
          </p>
        </div>
      )}
    </>
  );
}
