import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppState } from "@/contexts/AppStateContext";
import { FcConnectionBadge, useFcConnectionString } from "@/components/shared/FcConnectionBadge";
import { toast } from "sonner";
import { reportApiError } from "@/lib/apiErrors";
import { Label } from "@/components/ui/label";
import { dispatchBackendCommand } from "@/lib/commandService";
import { Lock, Radio, PlugZap, RefreshCw, Gamepad2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function MavlinkToolsPanel() {
  const { hasPermission } = usePermissions();
  const { selectedDrone } = useAppState();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const connectionString = useFcConnectionString();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [passthroughState, setPassthroughState] = useState<any>(null);
  const [localPort, setLocalPort] = useState("5760");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("GUIDED");
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [z, setZ] = useState("500");
  const [r, setR] = useState("0");
  const [durationMs, setDurationMs] = useState("400");
  const [serialPort, setSerialPort] = useState("1");
  const [radioProfile, setRadioProfile] = useState<"long_range" | "low_latency">("long_range");
  const [radioStatus, setRadioStatus] = useState<Record<string, number | null> | null>(null);
  const [radioVerify, setRadioVerify] = useState<any>(null);
  const [modemPort, setModemPort] = useState("/dev/ttyUSB0");
  const [modemCommand, setModemCommand] = useState("ATI");
  const [modemResult, setModemResult] = useState<any>(null);
  const [modemProfiles, setModemProfiles] = useState<Record<string, string[]>>({});
  const [modemProfileId, setModemProfileId] = useState("long_range");
  const [modemApplyResult, setModemApplyResult] = useState<any>(null);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [liveLatest, setLiveLatest] = useState<any>(null);
  const [liveSeries, setLiveSeries] = useState<Array<{ t: string; total: number; attitude: number; gps: number; sys: number; heartbeat: number }>>([]);

  // connectionString is derived from the selected drone via useFcConnectionString();
  // no setter is needed — it updates automatically when the operator switches drones.

  const refreshPassthrough = async () => {
    const res = await fetch("/api/mavlink/serial-passthrough/status");
    const data = await res.json();
    if (res.ok && data.success) setPassthroughState(data.state);
  };

  const fetchSnapshot = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/mavlink/inspector/snapshot?connectionString=${encodeURIComponent(connectionString)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Snapshot failed");
      setSnapshot(data.snapshot || null);
      toast.success("MAVLink snapshot fetched");
    } catch (e: any) {
      reportApiError(e, "Snapshot failed");
    } finally {
      setBusy(false);
    }
  };

  const fetchLiveInspector = async () => {
    const res = await fetch(`/api/mavlink/inspector/live?connectionString=${encodeURIComponent(connectionString)}&duration=2`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Live inspector failed");
    const live = data.live || {};
    setLiveRates(live.messageRates || {});
    setLiveLatest(live.latest || null);
    const bins = Array.isArray(live.bins) ? live.bins : [];
    setLiveSeries((prev) => {
      const next = [...prev];
      for (const b of bins) {
        next.push({
          t: String(Date.now()),
          total: Number(b.total || 0),
          attitude: Number(b.attitude || 0),
          gps: Number(b.gps || 0),
          sys: Number(b.sys || 0),
          heartbeat: Number(b.heartbeat || 0),
        });
      }
      return next.slice(-40);
    });
  };

  const startPassthrough = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/serial-passthrough/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, localPort: Number(localPort) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to start passthrough");
      setPassthroughState(data.state);
      toast.success("Serial passthrough started");
    } catch (e: any) {
      reportApiError(e, "Failed to start passthrough");
    } finally {
      setBusy(false);
    }
  };

  const stopPassthrough = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/serial-passthrough/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to stop passthrough");
      setPassthroughState(data.state);
      toast.success("Serial passthrough stopped");
    } catch (e: any) {
      reportApiError(e, "Failed to stop passthrough");
    } finally {
      setBusy(false);
    }
  };

  const vehicleAction = async (action: "arm" | "disarm" | "set_mode") => {
    setBusy(true);
    try {
      await dispatchBackendCommand({
        commandType: action === "set_mode" ? "set_mode" : action,
        payload: action === "set_mode" ? { mode } : {},
        connectionString,
      });
      toast.success(action === "set_mode" ? `Mode set to ${mode}` : `${action} command sent`);
    } catch (e: any) {
      reportApiError(e, "Vehicle action failed");
    } finally {
      setBusy(false);
    }
  };

  const sendManual = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/manual-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          x: Number(x),
          y: Number(y),
          z: Number(z),
          r: Number(r),
          durationMs: Number(durationMs),
          buttons: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Manual control failed");
      toast.success("Manual control frame streamed");
    } catch (e: any) {
      reportApiError(e, "Manual control failed");
    } finally {
      setBusy(false);
    }
  };

  const loadRadioStatus = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/mavlink/radio-sik/status?connectionString=${encodeURIComponent(connectionString)}&serialPort=${encodeURIComponent(serialPort)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load radio status");
      setRadioStatus(data.values || null);
      toast.success("Telemetry radio status loaded");
    } catch (e: any) {
      reportApiError(e, "Failed to load radio status");
    } finally {
      setBusy(false);
    }
  };

  const applyRadioProfile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/radio-sik/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          serialPort: Number(serialPort),
          profile: radioProfile,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to apply radio profile");
      toast.success(`Applied ${radioProfile} profile`);
      if ((data.failed?.length || 0) > 0) {
        toast.error(`Failed ${data.failed.length} param updates`);
      }
      await loadRadioStatus();
    } catch (e: any) {
      reportApiError(e, "Failed to apply radio profile");
    } finally {
      setBusy(false);
    }
  };

  const applyAndVerifyRadioProfile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/radio-sik/apply-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          serialPort: Number(serialPort),
          profile: radioProfile,
          verifyDelayMs: 700,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to apply+verify radio profile");
      setRadioVerify(data);
      if (data.verifiedOk) toast.success("Radio profile applied and verified");
      else toast.error(`Verification mismatches: ${data.mismatches?.length || 0}`);
      await loadRadioStatus();
    } catch (e: any) {
      reportApiError(e, "Failed to apply+verify radio profile");
    } finally {
      setBusy(false);
    }
  };

  const queryModem = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/radio-sik/modem-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: modemPort,
          command: modemCommand,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "SiK modem query failed");
      setModemResult(data);
      toast.success("SiK modem query complete");
    } catch (e: any) {
      reportApiError(e, "SiK modem query failed");
    } finally {
      setBusy(false);
    }
  };

  const loadModemProfiles = async () => {
    try {
      const res = await fetch("/api/mavlink/radio-sik/modem-profiles");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load modem profiles");
      const profiles = data.profiles || {};
      setModemProfiles(profiles);
      const first = Object.keys(profiles)[0];
      if (first && !profiles[modemProfileId]) setModemProfileId(first);
    } catch {
      // ignore
    }
  };

  const applyModemProfile = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/radio-sik/modem-apply-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          port: modemPort,
          profileId: modemProfileId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "SiK modem profile apply failed");
      setModemApplyResult(data);
      toast.success(`Applied modem profile: ${modemProfileId}`);
    } catch (e: any) {
      reportApiError(e, "SiK modem profile apply failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!liveEnabled) return;
    let active = true;
    const tick = async () => {
      try {
        await fetchLiveInspector();
      } catch {
        if (active) {
          // keep trying silently while live mode is enabled
        }
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 2200);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [liveEnabled, connectionString]);

  useEffect(() => {
    void loadModemProfiles();
  }, []);

  if (!canUse) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-2" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm">MAVLink tools require System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 space-y-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            MAVLink Inspector
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <FcConnectionBadge />
          <Button size="sm" variant="outline" onClick={fetchSnapshot} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1" /> Snapshot
          </Button>
          {snapshot && (
            <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(snapshot, null, 2)}</pre>
          )}
          <div className="rounded border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={liveEnabled ? "default" : "outline"} onClick={() => setLiveEnabled((v) => !v)}>
                {liveEnabled ? "Stop Live" : "Start Live"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void fetchLiveInspector()} disabled={busy}>
                Live Snapshot
              </Button>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={liveSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" hide />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#2563eb" dot={false} />
                  <Line type="monotone" dataKey="attitude" stroke="#16a34a" dot={false} />
                  <Line type="monotone" dataKey="gps" stroke="#ea580c" dot={false} />
                  <Line type="monotone" dataKey="sys" stroke="#7c3aed" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {Object.keys(liveRates).length > 0 && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(liveRates, null, 2)}</pre>
            )}
            {liveLatest && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(liveLatest, null, 2)}</pre>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Telemetry Radio (SiK)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Serial Port</Label>
              <Input value={serialPort} onChange={(e) => setSerialPort(e.target.value)} className="h-8 text-xs" placeholder="1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Profile</Label>
              <Input
                value={radioProfile}
                onChange={(e) => setRadioProfile((e.target.value as any) || "long_range")}
                className="h-8 text-xs"
                placeholder="long_range|low_latency"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" variant="outline" onClick={loadRadioStatus} disabled={busy}>Load</Button>
              <Button size="sm" onClick={applyRadioProfile} disabled={busy}>Apply</Button>
              <Button size="sm" variant="secondary" onClick={applyAndVerifyRadioProfile} disabled={busy}>Apply + Verify</Button>
            </div>
          </div>
          {radioStatus && (
            <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(radioStatus, null, 2)}</pre>
          )}
          {radioVerify && (
            <div className="text-xs rounded border p-2 bg-muted/30 space-y-1">
              <p>
                Verify result:{" "}
                <span className={radioVerify.verifiedOk ? "text-emerald-600" : "text-destructive"}>
                  {radioVerify.verifiedOk ? "OK" : "MISMATCH"}
                </span>
              </p>
              {!radioVerify.verifiedOk && (
                <pre className="text-xs overflow-auto">{JSON.stringify(radioVerify.mismatches || [], null, 2)}</pre>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Applies FC serial and stream-rate tuning for SiK telemetry links. Radio modem settings (net-id/ECC) remain on the modem side.
          </p>
          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs">Modem AT Query (optional external helper)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input value={modemPort} onChange={(e) => setModemPort(e.target.value)} className="h-8 text-xs font-mono" placeholder="/dev/ttyUSB0" />
              <Input value={modemCommand} onChange={(e) => setModemCommand(e.target.value)} className="h-8 text-xs font-mono" placeholder="ATI" />
              <Button size="sm" variant="outline" onClick={queryModem} disabled={busy}>Query</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input value={modemProfileId} onChange={(e) => setModemProfileId(e.target.value)} className="h-8 text-xs" placeholder="long_range" />
              <Button size="sm" variant="outline" onClick={() => void loadModemProfiles()} disabled={busy}>Profiles</Button>
              <Button size="sm" variant="secondary" onClick={applyModemProfile} disabled={busy}>Apply Profile</Button>
            </div>
            {modemProfiles[modemProfileId] && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(modemProfiles[modemProfileId], null, 2)}</pre>
            )}
            {modemResult && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(modemResult, null, 2)}</pre>
            )}
            {modemApplyResult && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto">{JSON.stringify(modemApplyResult, null, 2)}</pre>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-4 w-4" />
            Serial Passthrough
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input value={localPort} onChange={(e) => setLocalPort(e.target.value)} className="h-8 text-xs w-32" placeholder="5760" />
            <Button size="sm" onClick={startPassthrough} disabled={busy}>Start</Button>
            <Button size="sm" variant="outline" onClick={stopPassthrough} disabled={busy}>Stop</Button>
            <Button size="sm" variant="ghost" onClick={refreshPassthrough} disabled={busy}>Refresh</Button>
          </div>
          {passthroughState && (
            <div className="text-xs rounded border p-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <Badge variant={passthroughState.running ? "default" : "outline"}>
                  {passthroughState.running ? "running" : "stopped"}
                </Badge>
              </div>
              {passthroughState.message && <p className="mt-1 text-muted-foreground">{passthroughState.message}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" />
            Manual Control / Joystick
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => vehicleAction("arm")} disabled={busy}>Arm</Button>
            <Button size="sm" variant="outline" onClick={() => vehicleAction("disarm")} disabled={busy}>Disarm</Button>
          </div>
          <div className="flex gap-2">
            <Input value={mode} onChange={(e) => setMode(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" placeholder="GUIDED" />
            <Button size="sm" variant="secondary" onClick={() => vehicleAction("set_mode")} disabled={busy}>Set Mode</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">X (pitch)</Label>
              <Input value={x} onChange={(e) => setX(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Y (roll)</Label>
              <Input value={y} onChange={(e) => setY(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Z (throttle 0..1000)</Label>
              <Input value={z} onChange={(e) => setZ(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">R (yaw)</Label>
              <Input value={r} onChange={(e) => setR(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Input value={durationMs} onChange={(e) => setDurationMs(e.target.value)} className="h-8 text-xs w-32" placeholder="400" />
            <Button size="sm" onClick={sendManual} disabled={busy}>Send Manual Frame</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
