import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import { Lock, Save } from "lucide-react";

const VEHICLE_PRESETS: Record<string, Array<{ name: string; value: number }>> = {
  rover: [
    { name: "CRUISE_SPEED", value: 3.5 },
    { name: "CRUISE_THROTTLE", value: 45 },
    { name: "ATC_STR_RAT_MAX", value: 90 },
    { name: "ATC_ACCEL_MAX", value: 1.5 },
    { name: "WP_SPEED", value: 3.0 },
    { name: "WP_RADIUS", value: 2.0 },
  ],
  plane: [
    { name: "TRIM_ARSPD_CM", value: 1400 },
    { name: "ARSPD_FBW_MIN", value: 11 },
    { name: "ARSPD_FBW_MAX", value: 22 },
    { name: "TECS_CLMB_MAX", value: 4 },
    { name: "TECS_SINK_MAX", value: 3 },
    { name: "NAVL1_PERIOD", value: 18 },
  ],
  sub: [
    { name: "JS_GAIN_DEFAULT", value: 0.8 },
    { name: "PILOT_SPEED_UP", value: 150 },
    { name: "PILOT_SPEED_DN", value: 120 },
    { name: "WPNAV_SPEED", value: 120 },
    { name: "ATC_RAT_YAW_P", value: 0.2 },
    { name: "ATC_RAT_YAW_I", value: 0.02 },
  ],
};

const VEHICLE_ACTION_MODES: Record<string, string[]> = {
  rover: ["MANUAL", "HOLD", "AUTO", "GUIDED", "RTL"],
  plane: ["MANUAL", "FBWA", "CRUISE", "AUTO", "RTL", "LOITER"],
  sub: ["MANUAL", "STABILIZE", "ALT_HOLD", "POSHOLD", "AUTO"],
};

export function VehicleSetupPanel() {
  const { hasPermission } = usePermissions();
  const { selectedDrone } = useAppState();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const [connectionString, setConnectionString] = useState("serial:/dev/ttyACM0:57600");
  const [vehicleType, setVehicleType] = useState<"rover" | "plane" | "sub">("rover");
  const [airframeProfile, setAirframeProfile] = useState("quad_x");
  const [airframeProfiles, setAirframeProfiles] = useState<Record<string, any>>({});
  const [optionalHardwareProfiles, setOptionalHardwareProfiles] = useState<Record<string, Array<{ name: string; value: number }>>>({});
  const [optionalHardwareProfile, setOptionalHardwareProfile] = useState("dronecan_core");
  const [reconfigureProfiles, setReconfigureProfiles] = useState("dronecan_core");
  const [busy, setBusy] = useState(false);
  const [rawPatch, setRawPatch] = useState('[\n  { "name": "PARAM_NAME", "value": 1 }\n]');

  useEffect(() => {
    const next = String(selectedDrone?.connectionString || "").trim();
    if (next) setConnectionString(next);
  }, [selectedDrone?.connectionString]);

  const presets = useMemo(() => VEHICLE_PRESETS[vehicleType], [vehicleType]);
  const modeHints = useMemo(() => VEHICLE_ACTION_MODES[vehicleType], [vehicleType]);

  const applyPreset = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/params/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          params: presets,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Preset apply failed");
      toast.success(`${vehicleType.toUpperCase()} preset applied`);
      if ((data.failed?.length || 0) > 0) {
        toast.error(`Failed ${data.failed.length} parameter updates`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to apply preset");
    } finally {
      setBusy(false);
    }
  };

  const applyRawPatch = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(rawPatch);
    } catch {
      toast.error("Invalid JSON");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toast.error("Provide a JSON array of {name,value}");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/params/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, params: parsed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Patch apply failed");
      toast.success(`Applied ${data.applied?.length || 0} parameter updates`);
      if ((data.failed?.length || 0) > 0) toast.error(`Failed ${data.failed.length} updates`);
    } catch (e: any) {
      toast.error(e.message || "Failed to apply patch");
    } finally {
      setBusy(false);
    }
  };

  const loadAirframeProfiles = async () => {
    try {
      const res = await fetch("/api/mavlink/airframe/profiles");
      const data = await res.json();
      if (res.ok && data.success) setAirframeProfiles(data.profiles || {});
    } catch {
      // ignore
    }
  };

  const applyAirframeProfile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/airframe/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          profileId: airframeProfile,
          rebootAfter: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Airframe apply failed");
      toast.success(`Airframe switched: ${data.profileName}`);
      if ((data.failed?.length || 0) > 0) toast.error(`Failed ${data.failed.length} parameter writes`);
      if (data.reboot?.success) toast.success("Flight controller reboot command sent");
    } catch (e: any) {
      toast.error(e.message || "Airframe apply failed");
    } finally {
      setBusy(false);
    }
  };

  const runAirframeReconfigure = async () => {
    setBusy(true);
    try {
      const optionalProfiles = reconfigureProfiles
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch("/api/mavlink/airframe/reconfigure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          profileId: airframeProfile,
          optionalProfiles,
          rebootAfter: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Airframe reconfigure failed");
      toast.success(`Airframe workflow applied: ${data.profileName}`);
      if ((data.baseFailed?.length || 0) + (data.optionalFailed?.length || 0) > 0) {
        toast.error(`Some parameter writes failed`);
      }
    } catch (e: any) {
      toast.error(e.message || "Airframe reconfigure failed");
    } finally {
      setBusy(false);
    }
  };

  const loadOptionalHardwareProfiles = async () => {
    try {
      const res = await fetch("/api/mavlink/optional-hardware/profiles");
      const data = await res.json();
      if (res.ok && data.success) setOptionalHardwareProfiles(data.profiles || {});
    } catch {
      // ignore
    }
  };

  const applyOptionalHardwareProfile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/optional-hardware/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          profileId: optionalHardwareProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Optional hardware apply failed");
      toast.success(`Applied optional hardware profile: ${optionalHardwareProfile}`);
      if ((data.failed?.length || 0) > 0) toast.error(`Failed ${data.failed.length} parameter writes`);
    } catch (e: any) {
      toast.error(e.message || "Optional hardware apply failed");
    } finally {
      setBusy(false);
    }
  };

  const quickMode = async (mode: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/vehicle/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          action: "set_mode",
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Mode set failed");
      toast.success(`Mode set to ${mode}`);
    } catch (e: any) {
      toast.error(e.message || "Mode set failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadAirframeProfiles();
    void loadOptionalHardwareProfiles();
  }, []);

  if (!canUse) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-2" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm">Vehicle setup requires System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span>Vehicle-Specific Setup</span>
            <Badge variant="outline">Rover / Plane / Sub</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            className="h-8 text-xs font-mono"
            placeholder="serial:/dev/ttyACM0:57600"
          />

          <Tabs value={vehicleType} onValueChange={(v) => setVehicleType(v as any)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="rover">Rover</TabsTrigger>
              <TabsTrigger value="plane">Plane</TabsTrigger>
              <TabsTrigger value="sub">Sub</TabsTrigger>
            </TabsList>
            <TabsContent value={vehicleType} className="space-y-2 mt-3">
              {presets.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs rounded border p-2">
                  <span className="font-mono">{p.name}</span>
                  <span>{p.value}</span>
                </div>
              ))}
            </TabsContent>
          </Tabs>

          <Button onClick={applyPreset} disabled={busy} className="w-full">
            <Save className="h-4 w-4 mr-1" /> Apply {vehicleType.toUpperCase()} Base Preset
          </Button>

          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs">Recommended Modes</Label>
            <div className="flex flex-wrap gap-2">
              {modeHints.map((mode) => (
                <Button key={mode} size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => quickMode(mode)}>
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs">Copter Airframe Switch (Quad/Hex/Octa)</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadAirframeProfiles} disabled={busy}>Load Profiles</Button>
            </div>
            <Tabs value={airframeProfile} onValueChange={setAirframeProfile}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="quad_x">Quad X</TabsTrigger>
                <TabsTrigger value="hexa_x">Hexa X</TabsTrigger>
                <TabsTrigger value="octa_x">Octa X</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              Applies frame-class parameters and reboots FC so motor topology changes take effect.
            </p>
            {airframeProfiles[airframeProfile]?.firmware && (
              <Badge variant="secondary" className="text-xs">
                Firmware target: {airframeProfiles[airframeProfile].firmware}
              </Badge>
            )}
            <Button onClick={applyAirframeProfile} disabled={busy} className="w-full">
              Apply Airframe Profile
            </Button>
            <Input
              value={reconfigureProfiles}
              onChange={(e) => setReconfigureProfiles(e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="optional profiles csv (e.g. dronecan_core,esc_telemetry)"
            />
            <Button variant="secondary" onClick={runAirframeReconfigure} disabled={busy} className="w-full">
              Run Reconfigure Workflow
            </Button>
          </div>

          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs">Optional Hardware Profiles</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadOptionalHardwareProfiles} disabled={busy}>Load Profiles</Button>
              <Input
                value={optionalHardwareProfile}
                onChange={(e) => setOptionalHardwareProfile(e.target.value)}
                className="h-8 text-xs font-mono"
                placeholder="dronecan_core"
              />
              <Button size="sm" onClick={applyOptionalHardwareProfile} disabled={busy}>Apply</Button>
            </div>
            {optionalHardwareProfiles[optionalHardwareProfile] && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto max-h-36">
                {JSON.stringify(optionalHardwareProfiles[optionalHardwareProfile], null, 2)}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Advanced Param Patch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Apply additional vehicle-specific tuning as a JSON array of parameter assignments.
          </p>
          <Textarea rows={14} value={rawPatch} onChange={(e) => setRawPatch(e.target.value)} className="font-mono text-xs" />
          <Button variant="secondary" onClick={applyRawPatch} disabled={busy} className="w-full">
            Apply Patch
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
