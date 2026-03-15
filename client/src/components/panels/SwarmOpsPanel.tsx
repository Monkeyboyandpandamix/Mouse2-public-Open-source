import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Lock, Plus, Trash2, Users2 } from "lucide-react";

interface SwarmResult {
  connectionString: string;
  success: boolean;
  ack?: number | null;
  error?: string;
  delayMs?: number;
}

export function SwarmOpsPanel() {
  const { hasPermission } = usePermissions();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const [connectionInput, setConnectionInput] = useState("");
  const [connections, setConnections] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("AUTO");
  const [syncAction, setSyncAction] = useState<"arm" | "disarm" | "set_mode" | "reboot">("set_mode");
  const [staggerMs, setStaggerMs] = useState("300");
  const [formation, setFormation] = useState("line");
  const [count, setCount] = useState("4");
  const [spacing, setSpacing] = useState("10");
  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [formationSlots, setFormationSlots] = useState<Array<{ idx: number; lat: number; lng: number; offsetNorthM: number; offsetEastM: number }>>([]);
  const [formationMissions, setFormationMissions] = useState<any[]>([]);
  const [results, setResults] = useState<SwarmResult[]>([]);

  const addConnection = () => {
    const value = connectionInput.trim();
    if (!value) return;
    if (connections.includes(value)) {
      toast.error("Connection already in list");
      return;
    }
    setConnections((prev) => [...prev, value]);
    setConnectionInput("");
  };

  const runAction = async (action: "arm" | "disarm" | "set_mode") => {
    if (!connections.length) {
      toast.error("Add at least one connection");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/swarm/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionStrings: connections,
          action,
          mode: action === "set_mode" ? mode : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Swarm action failed");
      const list = Array.isArray(data.results) ? data.results : [];
      setResults(list);
      toast.success(`Swarm ${action} complete (${data.successCount}/${data.total})`);
    } catch (e: any) {
      toast.error(e.message || "Swarm action failed");
    } finally {
      setBusy(false);
    }
  };

  const runSyncAction = async () => {
    if (!connections.length) {
      toast.error("Add at least one connection");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/swarm/sync-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionStrings: connections,
          action: syncAction,
          mode: syncAction === "set_mode" ? mode : undefined,
          staggerMs: Number(staggerMs),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Sync action failed");
      const list = Array.isArray(data.results) ? data.results : [];
      setResults(list);
      toast.success(`Sync ${syncAction} complete`);
    } catch (e: any) {
      toast.error(e.message || "Sync action failed");
    } finally {
      setBusy(false);
    }
  };

  const buildFormationPlan = async () => {
    const lat = Number(originLat);
    const lng = Number(originLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Enter origin latitude/longitude");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/swarm/formation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formation,
          count: Number(count),
          spacingMeters: Number(spacing),
          originLat: lat,
          originLng: lng,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Formation planning failed");
      setFormationSlots(Array.isArray(data.slots) ? data.slots : []);
      toast.success(`Built ${data.formation} formation plan`);
    } catch (e: any) {
      toast.error(e.message || "Formation planning failed");
    } finally {
      setBusy(false);
    }
  };

  const generateFormationMissions = async () => {
    if (!formationSlots.length) {
      toast.error("Build a formation plan first");
      return;
    }
    setBusy(true);
    try {
      const slots = formationSlots.map((slot, i) => ({
        ...slot,
        connectionString: connections[i] || "",
        vehicle: connections[i] || `vehicle-${i + 1}`,
      }));
      const res = await fetch("/api/mavlink/swarm/formation-mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots,
          altitude: 40,
          holdSec: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Formation mission generation failed");
      setFormationMissions(Array.isArray(data.missions) ? data.missions : []);
      toast.success(`Generated ${data.count} formation missions`);
    } catch (e: any) {
      toast.error(e.message || "Formation mission generation failed");
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
          <p className="text-sm">Swarm operations require System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            Multi-Vehicle Ops
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={connectionInput}
              onChange={(e) => setConnectionInput(e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="serial:/dev/ttyACM0:57600 or udp:127.0.0.1:14550"
            />
            <Button size="sm" onClick={addConnection} disabled={busy}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="h-52 rounded border">
            <div className="divide-y">
              {connections.map((conn) => (
                <div key={conn} className="flex items-center justify-between px-2 py-2 text-xs">
                  <span className="font-mono truncate">{conn}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setConnections((prev) => prev.filter((v) => v !== conn))}
                    disabled={busy}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" onClick={() => runAction("arm")} disabled={busy}>Arm All</Button>
            <Button size="sm" variant="outline" onClick={() => runAction("disarm")} disabled={busy}>Disarm All</Button>
            <Button size="sm" variant="secondary" onClick={() => runAction("set_mode")} disabled={busy}>Set Mode All</Button>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mode for Set Mode All</Label>
            <Input value={mode} onChange={(e) => setMode(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" />
          </div>

          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs">Synchronized Action (staggered)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input value={syncAction} onChange={(e) => setSyncAction((e.target.value as any) || "set_mode")} className="h-8 text-xs" placeholder="arm|disarm|set_mode|reboot" />
              <Input value={staggerMs} onChange={(e) => setStaggerMs(e.target.value)} className="h-8 text-xs" placeholder="300" />
              <Button size="sm" onClick={runSyncAction} disabled={busy}>Run Sync</Button>
            </div>
          </div>

          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs">Formation Planner</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input value={formation} onChange={(e) => setFormation(e.target.value)} className="h-8 text-xs" placeholder="line|column|wedge|grid" />
              <Input value={count} onChange={(e) => setCount(e.target.value)} className="h-8 text-xs" placeholder="count" />
              <Input value={spacing} onChange={(e) => setSpacing(e.target.value)} className="h-8 text-xs" placeholder="spacing meters" />
              <Button size="sm" variant="outline" onClick={buildFormationPlan} disabled={busy}>Build Plan</Button>
              <Input value={originLat} onChange={(e) => setOriginLat(e.target.value)} className="h-8 text-xs font-mono" placeholder="origin lat" />
              <Input value={originLng} onChange={(e) => setOriginLng(e.target.value)} className="h-8 text-xs font-mono" placeholder="origin lng" />
            </div>
            <Button size="sm" variant="secondary" onClick={generateFormationMissions} disabled={busy || formationSlots.length === 0}>
              Generate Per-Vehicle Missions
            </Button>
            {formationSlots.length > 0 && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto max-h-40">{JSON.stringify(formationSlots, null, 2)}</pre>
            )}
            {formationMissions.length > 0 && (
              <pre className="text-xs rounded border p-2 bg-muted/30 overflow-auto max-h-40">{JSON.stringify(formationMissions, null, 2)}</pre>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Action Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-72 rounded border">
            <div className="p-2 space-y-2">
              {results.length === 0 && <p className="text-xs text-muted-foreground">No swarm actions run yet.</p>}
              {results.map((r) => (
                <div key={`${r.connectionString}-${r.ack}-${r.success}`} className="rounded border p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono truncate">{r.connectionString}</span>
                    <Badge variant={r.success ? "default" : "destructive"}>{r.success ? "ok" : "failed"}</Badge>
                  </div>
                  {r.success ? (
                    <p className="text-muted-foreground mt-1">ACK: {r.ack ?? "n/a"} {typeof r.delayMs === "number" ? `| delay ${r.delayMs}ms` : ""}</p>
                  ) : (
                    <p className="text-destructive mt-1">{r.error || "unknown error"}</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
