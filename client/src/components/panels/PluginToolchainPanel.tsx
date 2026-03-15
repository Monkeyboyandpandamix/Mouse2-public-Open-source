import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Lock, Puzzle, Play, RefreshCw } from "lucide-react";

interface PluginTool {
  id: string;
  name?: string;
  command?: string;
}

interface PluginItem {
  id: string;
  name: string;
  version: string;
  description: string;
  tools: PluginTool[];
  enabled: boolean;
}

export function PluginToolchainPanel() {
  const { hasPermission } = usePermissions();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedPluginId, setSelectedPluginId] = useState("");
  const [selectedToolId, setSelectedToolId] = useState("");
  const [args, setArgs] = useState("");
  const [output, setOutput] = useState("");
  const [newPluginId, setNewPluginId] = useState("");
  const [newPluginName, setNewPluginName] = useState("");
  const [sdkResult, setSdkResult] = useState("");

  const loadPlugins = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/plugins");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load plugins");
      const list = Array.isArray(data.plugins) ? data.plugins : [];
      setPlugins(list);
      if (list.length > 0 && !selectedPluginId) setSelectedPluginId(list[0].id);
    } catch (e: any) {
      toast.error(e.message || "Failed to load plugins");
    } finally {
      setBusy(false);
    }
  };

  const selectedPlugin = plugins.find((p) => p.id === selectedPluginId) || null;

  const setEnabled = async (pluginId: string, enabled: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update plugin");
      toast.success(`Plugin ${enabled ? "enabled" : "disabled"}`);
      await loadPlugins();
    } catch (e: any) {
      toast.error(e.message || "Failed to update plugin");
    } finally {
      setBusy(false);
    }
  };

  const runTool = async () => {
    if (!selectedPlugin || !selectedToolId) {
      toast.error("Select a plugin and tool");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/plugins/${encodeURIComponent(selectedPlugin.id)}/run-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: selectedToolId, args }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tool run failed");
      const text = [`exit: ${data.code}`, data.stdout || "", data.stderr ? `\n[stderr]\n${data.stderr}` : ""].join("\n");
      setOutput(text);
      if (data.success) toast.success("Tool executed");
      else toast.error("Tool failed");
    } catch (e: any) {
      toast.error(e.message || "Tool run failed");
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = async () => {
    if (!newPluginId.trim()) {
      toast.error("Plugin id is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/plugins/sdk/create-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newPluginId.trim(),
          name: newPluginName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create plugin template");
      toast.success(`Plugin template created: ${data.id}`);
      setNewPluginId("");
      setNewPluginName("");
      await loadPlugins();
    } catch (e: any) {
      toast.error(e.message || "Failed to create plugin template");
    } finally {
      setBusy(false);
    }
  };

  const validatePlugin = async () => {
    if (!selectedPluginId) {
      toast.error("Select a plugin");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/plugins/sdk/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedPluginId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Plugin validation failed");
      setSdkResult(JSON.stringify(data, null, 2));
      if (data.success) toast.success("Plugin manifest is valid");
      else toast.error("Plugin manifest has errors");
    } catch (e: any) {
      toast.error(e.message || "Plugin validation failed");
    } finally {
      setBusy(false);
    }
  };

  const packagePlugin = async () => {
    if (!selectedPluginId) {
      toast.error("Select a plugin");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/plugins/sdk/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedPluginId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Plugin packaging failed");
      setSdkResult(JSON.stringify(data, null, 2));
      toast.success("Plugin package created");
    } catch (e: any) {
      toast.error(e.message || "Plugin packaging failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadPlugins();
  }, []);

  useEffect(() => {
    if (!selectedPlugin) return;
    const firstTool = Array.isArray(selectedPlugin.tools) && selectedPlugin.tools.length > 0 ? String(selectedPlugin.tools[0].id) : "";
    setSelectedToolId(firstTool);
  }, [selectedPluginId, selectedPlugin?.tools?.length]);

  if (!canUse) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-2" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm">Plugin tooling requires System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Puzzle className="h-4 w-4" />
            Plugin & Toolchain
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" onClick={loadPlugins} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh Plugins
          </Button>
          <div className="rounded border p-2 space-y-2">
            <Label className="text-xs">Create Starter Plugin</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input value={newPluginId} onChange={(e) => setNewPluginId(e.target.value)} className="h-8 text-xs font-mono" placeholder="my_plugin" />
              <Input value={newPluginName} onChange={(e) => setNewPluginName(e.target.value)} className="h-8 text-xs" placeholder="My Plugin" />
            </div>
            <Button size="sm" variant="secondary" onClick={createTemplate} disabled={busy}>
              Create Template
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={validatePlugin} disabled={busy || !selectedPluginId}>
                Validate
              </Button>
              <Button size="sm" variant="outline" onClick={packagePlugin} disabled={busy || !selectedPluginId}>
                Package
              </Button>
            </div>
          </div>
          <ScrollArea className="h-72 rounded border">
            <div className="divide-y">
              {plugins.map((p) => (
                <div key={p.id} className="p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <button className="text-left flex-1" onClick={() => setSelectedPluginId(p.id)}>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </button>
                    <Badge variant={p.enabled ? "default" : "outline"}>{p.enabled ? "enabled" : "disabled"}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEnabled(p.id, true)} disabled={busy}>
                      Enable
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEnabled(p.id, false)} disabled={busy}>
                      Disable
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Run Plugin Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Tool</Label>
          <div className="flex flex-wrap gap-2">
            {(selectedPlugin?.tools || []).map((t) => (
              <Button
                key={String(t.id)}
                size="sm"
                variant={selectedToolId === String(t.id) ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setSelectedToolId(String(t.id))}
              >
                {t.name || t.id}
              </Button>
            ))}
          </div>
          <Input value={args} onChange={(e) => setArgs(e.target.value)} className="h-8 text-xs font-mono" placeholder="Optional args" />
          <Button onClick={runTool} disabled={busy || !selectedPlugin || !selectedToolId}>
            <Play className="h-4 w-4 mr-1" /> Run Tool
          </Button>
          <pre className="text-xs rounded border p-2 bg-muted/30 h-56 overflow-auto">{output || "No output yet."}</pre>
          <pre className="text-xs rounded border p-2 bg-muted/30 h-32 overflow-auto">{sdkResult || "SDK output appears here."}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
