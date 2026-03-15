import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Lock, RefreshCw, Save } from "lucide-react";

interface MappingState {
  FLTMODE1: number;
  FLTMODE2: number;
  FLTMODE3: number;
  FLTMODE4: number;
  FLTMODE5: number;
  FLTMODE6: number;
  MODE_CH: number;
  RCMAP_ROLL: number;
  RCMAP_PITCH: number;
  RCMAP_THROTTLE: number;
  RCMAP_YAW: number;
}

const initialMapping: MappingState = {
  FLTMODE1: 0,
  FLTMODE2: 3,
  FLTMODE3: 5,
  FLTMODE4: 6,
  FLTMODE5: 4,
  FLTMODE6: 9,
  MODE_CH: 5,
  RCMAP_ROLL: 1,
  RCMAP_PITCH: 2,
  RCMAP_THROTTLE: 3,
  RCMAP_YAW: 4,
};

export function FlightModeMappingPanel() {
  const { hasPermission } = usePermissions();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const [busy, setBusy] = useState(false);
  const [connectionString, setConnectionString] = useState(() => {
    const saved = localStorage.getItem("mouse_selected_drone");
    try {
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed?.connectionString || "serial:/dev/ttyACM0:57600";
    } catch {
      return "serial:/dev/ttyACM0:57600";
    }
  });
  const [mapping, setMapping] = useState<MappingState>(initialMapping);

  const hasMissing = useMemo(() => Object.values(mapping).some((v) => !Number.isFinite(v)), [mapping]);

  const loadMapping = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/mavlink/mode-mapping?connectionString=${encodeURIComponent(connectionString)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load mode mapping");
      const merged: any = { ...initialMapping };
      for (const key of Object.keys(merged)) {
        const val = Number(data.mapping?.[key]);
        if (Number.isFinite(val)) merged[key] = val;
      }
      setMapping(merged);
      toast.success("Loaded mapping from FC");
    } catch (e: any) {
      toast.error(e.message || "Failed to load mapping");
    } finally {
      setBusy(false);
    }
  };

  const saveMapping = async () => {
    if (hasMissing) {
      toast.error("Invalid mapping values");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/mode-mapping/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, mapping }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to apply mapping");
      toast.success(`Applied ${data.applied?.length || 0} params`);
      if ((data.failed?.length || 0) > 0) {
        toast.error(`Failed ${data.failed.length} params`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to apply mapping");
    } finally {
      setBusy(false);
    }
  };

  if (!canUse) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-2" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm">Mode mapping requires System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Flight Mode Mapping</span>
            <Badge variant="outline">ArduPilot</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            className="h-8 text-xs font-mono"
            placeholder="serial:/dev/ttyACM0:57600"
          />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6].map((idx) => {
              const key = `FLTMODE${idx}` as keyof MappingState;
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{key}</Label>
                  <Input
                    type="number"
                    value={mapping[key]}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="h-8 text-xs"
                  />
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">MODE_CH (flight mode switch RC channel)</Label>
            <Input
              type="number"
              value={mapping.MODE_CH}
              onChange={(e) => setMapping((prev) => ({ ...prev, MODE_CH: Number(e.target.value) }))}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadMapping} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" /> Load from FC
            </Button>
            <Button onClick={saveMapping} disabled={busy}>
              <Save className="h-4 w-4 mr-1" /> Apply to FC
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>RC Channel Mapping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE", "RCMAP_YAW"] as const).map((key) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{key}</Label>
              <Input
                type="number"
                value={mapping[key]}
                onChange={(e) => setMapping((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="h-8 text-xs"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Use standard mapping unless your transmitter channel order differs. Apply only when motors are disarmed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

