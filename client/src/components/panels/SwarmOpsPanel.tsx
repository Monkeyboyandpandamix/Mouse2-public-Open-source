import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { reportApiError } from "@/lib/apiErrors";
import { AlertTriangle, ChevronDown, ChevronRight, Lock, Plus, Trash2, Users2 } from "lucide-react";
import type { Drone } from "@shared/schema";

interface SwarmResult {
  connectionString: string;
  success: boolean;
  ack?: number | null;
  error?: string;
  delayMs?: number;
}

type SelectedDrone = {
  id: string;
  name: string;
  callsign: string;
  connectionString: string;
  status: string;
};

type FormationType = "line" | "column" | "wedge" | "grid";

const STATUS_COLOR: Record<string, string> = {
  online: "text-emerald-500",
  armed: "text-amber-500",
  flying: "text-blue-500",
  offline: "text-muted-foreground",
};

export function SwarmOpsPanel() {
  const { hasPermission } = usePermissions();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAdvancedConn, setShowAdvancedConn] = useState(false);
  const [extraConnections, setExtraConnections] = useState<string[]>([]);
  const [extraConnInput, setExtraConnInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("AUTO");
  const [syncAction, setSyncAction] = useState<"arm" | "disarm" | "set_mode" | "reboot">("set_mode");
  const [staggerMs, setStaggerMs] = useState("300");

  const [formation, setFormation] = useState<FormationType>("line");
  const [spacing, setSpacing] = useState("10");
  const [minSpacing, setMinSpacing] = useState("8");
  const [originLat, setOriginLat] = useState("");
  const [originLng, setOriginLng] = useState("");
  const [formationSlots, setFormationSlots] = useState<Array<{ idx: number; lat: number; lng: number; offsetNorthM: number; offsetEastM: number }>>([]);
  const [formationMissions, setFormationMissions] = useState<any[]>([]);
  const [results, setResults] = useState<SwarmResult[]>([]);

  const { data: drones = [] } = useQuery<Drone[]>({
    queryKey: ["/api/drones"],
    refetchInterval: 5000,
  });

  // Drones eligible for swarm operations: must have a connection string configured.
  const eligibleDrones: SelectedDrone[] = useMemo(
    () =>
      drones
        .filter((d) => Boolean(d.connectionString))
        .map((d) => ({
          id: d.id,
          name: d.name,
          callsign: d.callsign,
          connectionString: String(d.connectionString),
          status: String(d.status || "offline").toLowerCase(),
        })),
    [drones],
  );

  const selectedDrones = useMemo(
    () => eligibleDrones.filter((d) => selectedIds.has(d.id)),
    [eligibleDrones, selectedIds],
  );

  // The connection list sent to the backend: selected registered drones + any manual extras.
  const connections = useMemo(() => {
    const list: string[] = [];
    for (const d of selectedDrones) {
      if (!list.includes(d.connectionString)) list.push(d.connectionString);
    }
    for (const c of extraConnections) {
      if (!list.includes(c)) list.push(c);
    }
    return list;
  }, [selectedDrones, extraConnections]);

  // Total participants (registered + manual) used for formation planning.
  const participantCount = connections.length;

  const toggleSelected = (id: string) => {
    invalidateFormation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (onlineOnly: boolean) => {
    const ids = eligibleDrones
      .filter((d) => (onlineOnly ? ["online", "armed", "flying"].includes(d.status) : true))
      .map((d) => d.id);
    if (ids.length === 0) {
      toast.error(onlineOnly ? "No online drones with connection strings" : "No registered drones with connection strings");
      return;
    }
    invalidateFormation();
    setSelectedIds(new Set(ids));
    toast.success(`Selected ${ids.length} drone(s)`);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setFormationSlots([]);
    setFormationMissions([]);
  };

  const addExtraConnection = () => {
    const value = extraConnInput.trim();
    if (!value) return;
    if (extraConnections.includes(value)) {
      toast.error("Connection already in list");
      return;
    }
    invalidateFormation();
    setExtraConnections((prev) => [...prev, value]);
    setExtraConnInput("");
  };

  const requireConnections = (): boolean => {
    if (!connections.length) {
      toast.error("Select at least one drone (or add a manual connection)");
      return false;
    }
    return true;
  };

  // Validate formation slot spacing client-side before any FC dispatch.
  const slotSeparationOk = useMemo(() => {
    if (formationSlots.length < 2) return { ok: true, min: Infinity };
    const minM = Number(minSpacing) || 0;
    let observedMin = Infinity;
    for (let i = 0; i < formationSlots.length; i++) {
      for (let j = i + 1; j < formationSlots.length; j++) {
        const a = formationSlots[i];
        const b = formationSlots[j];
        const dN = a.offsetNorthM - b.offsetNorthM;
        const dE = a.offsetEastM - b.offsetEastM;
        const dist = Math.hypot(dN, dE);
        if (dist < observedMin) observedMin = dist;
      }
    }
    return { ok: observedMin >= minM, min: observedMin };
  }, [formationSlots, minSpacing]);

  const runAction = async (action: "arm" | "disarm" | "set_mode") => {
    if (!requireConnections()) return;
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
    if (!requireConnections()) return;
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
      reportApiError(e, "Sync action failed");
    } finally {
      setBusy(false);
    }
  };

  // Invalidate any previously-built formation when its inputs change, so the operator can't
  // accidentally pair stale slot positions with a different roster of drones.
  const invalidateFormation = () => {
    if (formationSlots.length > 0 || formationMissions.length > 0) {
      setFormationSlots([]);
      setFormationMissions([]);
    }
  };

  const buildFormationPlan = async () => {
    const lat = Number(originLat);
    const lng = Number(originLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Enter origin latitude/longitude");
      return;
    }
    if (participantCount < 1) {
      toast.error("Select at least one drone first");
      return;
    }
    const spacingM = Number(spacing);
    const minM = Number(minSpacing);
    if (Number.isFinite(spacingM) && Number.isFinite(minM) && spacingM < minM) {
      toast.error(`Spacing (${spacingM}m) is below minimum (${minM}m). Increase spacing for crash avoidance.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/swarm/formation-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formation,
          count: participantCount,
          spacingMeters: spacingM,
          originLat: lat,
          originLng: lng,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Formation planning failed");
      setFormationSlots(Array.isArray(data.slots) ? data.slots : []);
      toast.success(`Built ${data.formation} formation for ${participantCount} drone(s)`);
    } catch (e: any) {
      reportApiError(e, "Formation planning failed");
    } finally {
      setBusy(false);
    }
  };

  const generateFormationMissions = async () => {
    if (!formationSlots.length) {
      toast.error("Build a formation plan first");
      return;
    }
    if (formationSlots.length !== connections.length) {
      toast.error(
        `Formation has ${formationSlots.length} slots but ${connections.length} drone(s) selected — rebuild the plan.`,
      );
      return;
    }
    if (!slotSeparationOk.ok) {
      toast.error(
        `Closest slots are ${slotSeparationOk.min.toFixed(1)}m apart — below the ${minSpacing}m crash-avoidance minimum. Aborting.`,
      );
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
      reportApiError(e, "Formation mission generation failed");
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
    <div className="h-full p-4 overflow-auto">
      <Tabs defaultValue="quick" className="w-full">
        <TabsList className="mb-3">
          <TabsTrigger value="quick" data-testid="tab-swarm-quick">Quick Ops</TabsTrigger>
          <TabsTrigger value="plan" data-testid="tab-swarm-plan">Plan & Visualize</TabsTrigger>
        </TabsList>
        <TabsContent value="quick">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            Multi-Vehicle Ops
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* === Step 1: Pick from registered drones === */}
          <div className="rounded border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Select Registered Drones</Label>
              <span className="text-[11px] text-muted-foreground" data-testid="text-swarm-selected-count">
                {selectedDrones.length} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => selectAll(false)} disabled={busy} data-testid="button-swarm-select-all">
                Select All
              </Button>
              <Button size="sm" variant="outline" onClick={() => selectAll(true)} disabled={busy} data-testid="button-swarm-select-online">
                Select Online Only
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} disabled={busy || selectedIds.size === 0} data-testid="button-swarm-clear">
                Clear
              </Button>
            </div>
            <ScrollArea className="h-44 rounded border">
              <div className="divide-y">
                {eligibleDrones.length === 0 && (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    No registered drones with connection strings. Add drones in <strong>Drone Selection → Register</strong> and set their connection string.
                  </p>
                )}
                {eligibleDrones.map((d) => {
                  const isSel = selectedIds.has(d.id);
                  return (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => toggleSelected(d.id)}
                      disabled={busy}
                      data-testid={`button-swarm-toggle-${d.id}`}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-2 text-left transition-colors ${
                        isSel ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                          {d.name} <span className="text-muted-foreground">({d.callsign})</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate font-mono">{d.connectionString}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] capitalize ${STATUS_COLOR[d.status] || "text-muted-foreground"}`}>
                          {d.status}
                        </span>
                        <Badge variant={isSel ? "default" : "outline"} className="text-[10px]">
                          {isSel ? "Selected" : "Tap to select"}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* === Advanced: manual connection strings (collapsed) === */}
          <div className="rounded border">
            <button
              type="button"
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs"
              onClick={() => setShowAdvancedConn((v) => !v)}
              data-testid="button-swarm-advanced-toggle"
            >
              <span className="flex items-center gap-1 text-muted-foreground">
                {showAdvancedConn ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Advanced: add unregistered connection string
              </span>
              {extraConnections.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {extraConnections.length} extra
                </Badge>
              )}
            </button>
            {showAdvancedConn && (
              <div className="px-2 pb-2 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={extraConnInput}
                    onChange={(e) => setExtraConnInput(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder="serial:/dev/ttyACM0:57600 or udp:127.0.0.1:14550"
                    data-testid="input-swarm-manual-conn"
                  />
                  <Button size="sm" onClick={addExtraConnection} disabled={busy} data-testid="button-swarm-manual-add">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {extraConnections.length > 0 && (
                  <ScrollArea className="h-24 rounded border">
                    <div className="divide-y">
                      {extraConnections.map((conn) => (
                        <div key={conn} className="flex items-center justify-between px-2 py-1.5 text-xs">
                          <span className="font-mono truncate">{conn}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setExtraConnections((prev) => prev.filter((v) => v !== conn))}
                            disabled={busy}
                            data-testid={`button-swarm-manual-remove-${conn}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* === Step 2: Group commands === */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Group Commands ({connections.length} drone{connections.length === 1 ? "" : "s"})</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" onClick={() => runAction("arm")} disabled={busy || !connections.length} data-testid="button-swarm-arm-all">Arm All</Button>
              <Button size="sm" variant="outline" onClick={() => runAction("disarm")} disabled={busy || !connections.length} data-testid="button-swarm-disarm-all">Disarm All</Button>
              <Button size="sm" variant="secondary" onClick={() => runAction("set_mode")} disabled={busy || !connections.length} data-testid="button-swarm-mode-all">Set Mode All</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Mode</Label>
                <Input value={mode} onChange={(e) => setMode(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" data-testid="input-swarm-mode" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Stagger (ms)</Label>
                <Input value={staggerMs} onChange={(e) => setStaggerMs(e.target.value)} className="h-8 text-xs" data-testid="input-swarm-stagger" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={syncAction} onValueChange={(v) => setSyncAction(v as any)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-swarm-sync-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arm">arm</SelectItem>
                  <SelectItem value="disarm">disarm</SelectItem>
                  <SelectItem value="set_mode">set_mode</SelectItem>
                  <SelectItem value="reboot">reboot</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={runSyncAction} disabled={busy || !connections.length} className="col-span-2" data-testid="button-swarm-sync-run">
                Run Synchronized (staggered)
              </Button>
            </div>
          </div>

          <Separator />

          {/* === Step 3: Formation planning with crash avoidance === */}
          <div className="space-y-2 rounded border p-2">
            <Label className="text-xs font-semibold">Formation Planner</Label>
            <p className="text-[11px] text-muted-foreground">
              Positions {participantCount} drone{participantCount === 1 ? "" : "s"} around an origin point. Min spacing enforces crash avoidance.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">Formation</Label>
                <Select value={formation} onValueChange={(v) => setFormation(v as FormationType)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-swarm-formation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="line">Line</SelectItem>
                    <SelectItem value="column">Column</SelectItem>
                    <SelectItem value="wedge">Wedge</SelectItem>
                    <SelectItem value="grid">Grid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Spacing (m)</Label>
                <Input value={spacing} onChange={(e) => setSpacing(e.target.value)} className="h-8 text-xs" data-testid="input-swarm-spacing" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Min Spacing for Crash Avoidance (m)</Label>
                <Input value={minSpacing} onChange={(e) => setMinSpacing(e.target.value)} className="h-8 text-xs" data-testid="input-swarm-min-spacing" />
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="outline" onClick={buildFormationPlan} disabled={busy || participantCount === 0} className="w-full" data-testid="button-swarm-build-plan">
                  Build Plan
                </Button>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Origin Latitude</Label>
                <Input value={originLat} onChange={(e) => setOriginLat(e.target.value)} className="h-8 text-xs font-mono" placeholder="e.g. 36.0957" data-testid="input-swarm-origin-lat" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Origin Longitude</Label>
                <Input value={originLng} onChange={(e) => setOriginLng(e.target.value)} className="h-8 text-xs font-mono" placeholder="e.g. -79.4378" data-testid="input-swarm-origin-lng" />
              </div>
            </div>

            {formationSlots.length > 0 && (
              <div className="space-y-2">
                {!slotSeparationOk.ok && (
                  <div className="flex items-start gap-2 rounded border border-destructive/50 bg-destructive/10 p-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-[11px] text-destructive">
                      Crash-avoidance check failed: closest slots are {slotSeparationOk.min.toFixed(1)}m apart — below the {minSpacing}m minimum. Increase spacing or change formation.
                    </p>
                  </div>
                )}
                <div className="rounded border bg-muted/20">
                  <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] text-muted-foreground border-b">
                    <span className="col-span-1">#</span>
                    <span className="col-span-5">Drone</span>
                    <span className="col-span-3 text-right">North (m)</span>
                    <span className="col-span-3 text-right">East (m)</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y">
                    {formationSlots.map((slot, i) => {
                      const targetConn = connections[i];
                      const drone = eligibleDrones.find((d) => d.connectionString === targetConn);
                      const label = drone ? `${drone.name} (${drone.callsign})` : targetConn || `slot-${i + 1}`;
                      return (
                        <div key={slot.idx} className="grid grid-cols-12 gap-2 px-2 py-1 text-[11px]" data-testid={`row-swarm-slot-${slot.idx}`}>
                          <span className="col-span-1 font-mono">{slot.idx}</span>
                          <span className="col-span-5 truncate">{label}</span>
                          <span className="col-span-3 text-right font-mono">{slot.offsetNorthM.toFixed(1)}</span>
                          <span className="col-span-3 text-right font-mono">{slot.offsetEastM.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={generateFormationMissions}
                  disabled={busy || formationSlots.length === 0 || !slotSeparationOk.ok}
                  data-testid="button-swarm-generate-missions"
                  className="w-full"
                >
                  Generate Per-Vehicle Missions
                </Button>
                {formationMissions.length > 0 && (
                  <pre className="text-[10px] rounded border p-2 bg-muted/30 overflow-auto max-h-40">{JSON.stringify(formationMissions, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Action Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] rounded border">
            <div className="p-2 space-y-2">
              {results.length === 0 && (
                <p className="text-xs text-muted-foreground">No swarm actions run yet.</p>
              )}
              {results.map((r, i) => {
                const drone = eligibleDrones.find((d) => d.connectionString === r.connectionString);
                const label = drone ? `${drone.name} (${drone.callsign})` : r.connectionString;
                return (
                  <div key={`${r.connectionString}-${i}`} className="rounded border p-2 text-xs" data-testid={`row-swarm-result-${i}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{label}</p>
                        <p className="text-[10px] font-mono text-muted-foreground truncate">{r.connectionString}</p>
                      </div>
                      <Badge variant={r.success ? "default" : "destructive"}>{r.success ? "ok" : "failed"}</Badge>
                    </div>
                    {r.success ? (
                      <p className="text-muted-foreground mt-1">
                        ACK: {r.ack ?? "n/a"} {typeof r.delayMs === "number" ? `| delay ${r.delayMs}ms` : ""}
                      </p>
                    ) : (
                      <p className="text-destructive mt-1">{r.error || "Unknown error"}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
        </div>
        </TabsContent>
        <TabsContent value="plan">
          <FormationMapPreview slots={formationSlots} missions={formationMissions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Lightweight SVG map preview of the formation. Plots each slot relative to the
// formation centroid (north/east offsets in metres) and overlays each drone's
// waypoint mission path. No Leaflet dependency — keeps the planner self-contained.
function FormationMapPreview({
  slots,
  missions,
}: {
  slots: Array<{ idx: number; lat: number; lng: number; offsetNorthM: number; offsetEastM: number }>;
  missions: any[];
}) {
  if (slots.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Formation Plan Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Build a formation in <strong>Quick Ops → Formation Builder</strong> to see a visual preview here.
          </p>
        </CardContent>
      </Card>
    );
  }
  const allEasts = slots.map((s) => s.offsetEastM);
  const allNorths = slots.map((s) => s.offsetNorthM);
  const minE = Math.min(...allEasts, -5);
  const maxE = Math.max(...allEasts, 5);
  const minN = Math.min(...allNorths, -5);
  const maxN = Math.max(...allNorths, 5);
  const padE = (maxE - minE) * 0.15 || 5;
  const padN = (maxN - minN) * 0.15 || 5;
  const viewMinE = minE - padE;
  const viewMaxE = maxE + padE;
  const viewMinN = minN - padN;
  const viewMaxN = maxN + padN;
  const W = 600;
  const H = 360;
  const xOf = (e: number) => ((e - viewMinE) / (viewMaxE - viewMinE)) * W;
  const yOf = (n: number) => H - ((n - viewMinN) / (viewMaxN - viewMinN)) * H;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Formation Plan Preview</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            {slots.length} slot(s) · {missions.length} mission(s)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded border bg-slate-900 p-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" data-testid="svg-formation-preview">
            {/* Grid */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#grid)" />
            {/* Origin axes */}
            <line x1={xOf(0)} y1={0} x2={xOf(0)} y2={H} stroke="rgba(255,255,255,0.18)" />
            <line x1={0} y1={yOf(0)} x2={W} y2={yOf(0)} stroke="rgba(255,255,255,0.18)" />
            {/* Mission waypoint polylines (if any) */}
            {missions.map((m: any, mi: number) => {
              const waypoints = Array.isArray(m?.waypoints) ? m.waypoints : [];
              if (waypoints.length < 2) return null;
              const points = waypoints
                .map((w: any) => {
                  const e = Number(w?.offsetEastM ?? 0);
                  const n = Number(w?.offsetNorthM ?? 0);
                  return `${xOf(e)},${yOf(n)}`;
                })
                .join(" ");
              return (
                <polyline
                  key={`mission-${mi}`}
                  points={points}
                  fill="none"
                  stroke="hsl(195, 100%, 60%)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
              );
            })}
            {/* Slot markers */}
            {slots.map((s) => {
              const cx = xOf(s.offsetEastM);
              const cy = yOf(s.offsetNorthM);
              return (
                <g key={`slot-${s.idx}`} data-testid={`marker-slot-${s.idx}`}>
                  <circle cx={cx} cy={cy} r={9} fill="hsl(38, 100%, 55%)" stroke="white" strokeWidth={1.5} />
                  <text x={cx} y={cy + 3} fontSize={10} textAnchor="middle" fill="black" fontWeight="bold">
                    {s.idx + 1}
                  </text>
                  <text x={cx} y={cy - 14} fontSize={9} textAnchor="middle" fill="white">
                    N{s.offsetNorthM.toFixed(1)} E{s.offsetEastM.toFixed(1)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          {slots.map((s) => (
            <div key={`tile-${s.idx}`} className="rounded border p-1 bg-muted/30" data-testid={`tile-slot-${s.idx}`}>
              <div className="font-semibold">Slot {s.idx + 1}</div>
              <div className="text-muted-foreground">{s.lat.toFixed(6)}, {s.lng.toFixed(6)}</div>
              <div className="text-muted-foreground">N {s.offsetNorthM.toFixed(2)}m · E {s.offsetEastM.toFixed(2)}m</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
