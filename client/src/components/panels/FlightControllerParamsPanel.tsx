import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppState } from "@/contexts/AppStateContext";
import { Download, Upload, RefreshCw, Save, Search, Lock, Layers } from "lucide-react";
import { ARDUPILOT_CATEGORIES, ARDUPILOT_META_BY_NAME, ARDUPILOT_PARAM_PRESETS } from "@/lib/ardupilotParams";

interface ParamItem {
  name: string;
  value: number;
}

export function FlightControllerParamsPanel() {
  const { hasPermission } = usePermissions();
  const { selectedDrone } = useAppState();
  const canEdit = hasPermission("system_settings") || hasPermission("run_terminal");

  const [connectionString, setConnectionString] = useState("serial:/dev/ttyACM0:57600");
  const [params, setParams] = useState<ParamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [presetId, setPresetId] = useState(ARDUPILOT_PARAM_PRESETS[0]?.id || "");
  const [selected, setSelected] = useState<ParamItem | null>(null);
  const [editValue, setEditValue] = useState("");
  const [bulkInput, setBulkInput] = useState("[");
  const [compareInput, setCompareInput] = useState("[");
  const [compareResult, setCompareResult] = useState<any | null>(null);

  useEffect(() => {
    const next = String(selectedDrone?.connectionString || "").trim();
    if (next) setConnectionString(next);
  }, [selectedDrone?.connectionString]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return params.filter((p) => {
      const nameMatch = !q || p.name.includes(q);
      const meta = ARDUPILOT_META_BY_NAME[p.name];
      const categoryMatch = category === "all" || meta?.category === category;
      return nameMatch && categoryMatch;
    });
  }, [params, query, category]);

  const loadParams = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mavlink/params?connectionString=${encodeURIComponent(connectionString)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load params");
      setParams(data.params || []);
      toast.success(`Loaded ${data.count || 0} params`);
    } catch (e: any) {
      toast.error(e.message || "Failed to load parameters");
    } finally {
      setLoading(false);
    }
  };

  const saveParam = async () => {
    if (!selected) return;
    const value = Number(editValue);
    if (!Number.isFinite(value)) {
      toast.error("Value must be numeric");
      return;
    }
    const meta = ARDUPILOT_META_BY_NAME[selected.name];
    if (meta?.min !== undefined && value < meta.min) {
      toast.error(`Value below allowed range (${meta.min}..${meta.max ?? "∞"})`);
      return;
    }
    if (meta?.max !== undefined && value > meta.max) {
      toast.error(`Value above allowed range (${meta.min ?? "-∞"}..${meta.max})`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/mavlink/params/${encodeURIComponent(selected.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, value }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Set failed");
      setParams((prev) => prev.map((p) => (p.name === selected.name ? { ...p, value: data.value } : p)));
      setSelected({ ...selected, value: data.value });
      toast.success(`${selected.name} updated`);
    } catch (e: any) {
      toast.error(e.message || "Failed to set parameter");
    } finally {
      setLoading(false);
    }
  };

  const exportParams = async () => {
    try {
      const res = await fetch(`/api/mavlink/params/export?connectionString=${encodeURIComponent(connectionString)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fc-params-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Parameters exported");
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    }
  };

  const importParams = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(bulkInput);
    } catch {
      toast.error("Invalid JSON in import payload");
      return;
    }
    const arr = Array.isArray(parsed) ? parsed : parsed.params;
    if (!Array.isArray(arr) || !arr.length) {
      toast.error("Provide array of {name,value}");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/mavlink/params/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, params: arr }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Import failed");
      toast.success(`Applied ${data.applied?.length || 0}, failed ${data.failed?.length || 0}`);
      await loadParams();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = async () => {
    const preset = ARDUPILOT_PARAM_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      toast.error("Select a preset");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/mavlink/params/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          params: preset.values,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Preset apply failed");
      toast.success(`Preset applied: ${preset.name}`);
      await loadParams();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply preset");
    } finally {
      setLoading(false);
    }
  };

  const compareParams = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(compareInput);
    } catch {
      toast.error("Invalid JSON in compare payload");
      return;
    }
    const arr = Array.isArray(parsed) ? parsed : parsed.params;
    if (!Array.isArray(arr) || !arr.length) {
      toast.error("Provide array/object of parameters to compare");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/mavlink/params/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, params: arr, tolerance: 0.001 }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Compare failed");
      setCompareResult(data);
      if (data.mismatchCount === 0 && data.missingOnFcCount === 0) toast.success("Parameter sets match");
      else toast.error(`Compare found ${data.mismatchCount} mismatches and ${data.missingOnFcCount} missing on FC`);
    } catch (e: any) {
      toast.error(e.message || "Compare failed");
    } finally {
      setLoading(false);
    }
  };

  if (!canEdit) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-2" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm">Requires System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 min-h-0 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Flight Controller Parameters</span>
            <Badge variant="outline">ArduPilot / MAVLink2</Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Input value={connectionString} onChange={(e) => setConnectionString(e.target.value)} placeholder="serial:/dev/ttyACM0:57600 or udp:127.0.0.1:14550" />
            <Button onClick={loadParams} disabled={loading} data-testid="button-load-params">
              <RefreshCw className="h-4 w-4 mr-1" /> Load
            </Button>
            <Button variant="outline" onClick={exportParams} data-testid="button-export-params">
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search parameter" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {ARDUPILOT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                {ARDUPILOT_PARAM_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={applyPreset} disabled={loading} data-testid="button-apply-preset">
              <Layers className="h-4 w-4 mr-1" /> Apply Preset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 min-h-0 flex-1">
          <ScrollArea className="h-[52vh] border rounded">
            <div className="divide-y">
              {filtered.map((p) => (
                <button
                  key={p.name}
                  className={`w-full text-left px-3 py-2 hover:bg-accent ${selected?.name === p.name ? "bg-accent" : ""}`}
                  onClick={() => {
                    setSelected(p);
                    setEditValue(String(p.value));
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{p.name}</span>
                    <span className="text-sm">
                      {p.value}
                      {ARDUPILOT_META_BY_NAME[p.name]?.unit ? ` ${ARDUPILOT_META_BY_NAME[p.name].unit}` : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Edit / Import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Selected</p>
            <Input value={selected?.name || ""} readOnly placeholder="Pick a parameter" />
          </div>
          {selected && ARDUPILOT_META_BY_NAME[selected.name] && (
            <div className="text-xs rounded border p-2 bg-muted/40 space-y-1">
              <p>
                <span className="text-muted-foreground">Category:</span> {ARDUPILOT_META_BY_NAME[selected.name].category}
              </p>
              {(ARDUPILOT_META_BY_NAME[selected.name].min !== undefined || ARDUPILOT_META_BY_NAME[selected.name].max !== undefined) && (
                <p>
                  <span className="text-muted-foreground">Range:</span>{" "}
                  {ARDUPILOT_META_BY_NAME[selected.name].min ?? "-∞"} .. {ARDUPILOT_META_BY_NAME[selected.name].max ?? "∞"}
                </p>
              )}
              {ARDUPILOT_META_BY_NAME[selected.name].unit && (
                <p>
                  <span className="text-muted-foreground">Unit:</span> {ARDUPILOT_META_BY_NAME[selected.name].unit}
                </p>
              )}
              {ARDUPILOT_META_BY_NAME[selected.name].notes && (
                <p className="text-muted-foreground">{ARDUPILOT_META_BY_NAME[selected.name].notes}</p>
              )}
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Value</p>
            <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="Numeric value" />
          </div>
          <Button className="w-full" onClick={saveParam} disabled={!selected || loading} data-testid="button-save-param">
            <Save className="h-4 w-4 mr-1" /> Save Parameter
          </Button>
          <div className="pt-2 border-t" />
          <p className="text-xs text-muted-foreground">Bulk import JSON array:</p>
          <Textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} rows={10} />
          <Button variant="secondary" className="w-full" onClick={importParams} disabled={loading} data-testid="button-import-params">
            <Upload className="h-4 w-4 mr-1" /> Import Parameters
          </Button>
          <div className="pt-2 border-t" />
          <p className="text-xs text-muted-foreground">Compare FC against parameter file JSON:</p>
          <Textarea value={compareInput} onChange={(e) => setCompareInput(e.target.value)} rows={8} />
          <Button variant="outline" className="w-full" onClick={compareParams} disabled={loading}>
            Compare with FC
          </Button>
          {compareResult && (
            <div className="text-xs rounded border p-2 bg-muted/40 space-y-1">
              <p>Matched: {compareResult.matchedCount}</p>
              <p>Mismatched: {compareResult.mismatchCount}</p>
              <p>Missing on FC: {compareResult.missingOnFcCount}</p>
              {Array.isArray(compareResult.mismatched) && compareResult.mismatched.length > 0 && (
                <pre className="max-h-40 overflow-auto">{JSON.stringify(compareResult.mismatched.slice(0, 40), null, 2)}</pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
