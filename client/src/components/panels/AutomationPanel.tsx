import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Code, 
  Play, 
  Pause, 
  Trash2, 
  Plus, 
  Save,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Upload,
  Download,
  Lock
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppState } from "@/contexts/AppStateContext";
import { reportApiError } from "@/lib/apiErrors";
import { usePermissions } from "@/hooks/usePermissions";

interface AutomationScript {
  id: string;
  name: string;
  description: string;
  trigger: 'manual' | 'takeoff' | 'landing' | 'waypoint' | 'battery_low' | 'gps_lost' | 'disconnect';
  enabled: boolean;
  lastRun: string | null;
  code: string;
}

function isSupportedAutomationRecipe(code: string, trigger: AutomationScript["trigger"]): boolean {
  const normalizedCode = String(code || "");
  const normalizedTrigger = String(trigger || "").trim().toLowerCase();
  if (/takeoff\s*\(\s*([0-9]+(?:\.[0-9]+)?)/i.test(normalizedCode)) return true;
  if (/returnToBase|return to base|\brtl\b/i.test(normalizedCode)) return true;
  if (/\bland\b/i.test(normalizedCode)) return true;
  if (/\bdisarm\b/i.test(normalizedCode)) return true;
  if (/\barm\b/i.test(normalizedCode)) return true;
  return ["battery_low", "gps_lost", "disconnect", "landing", "takeoff"].includes(normalizedTrigger);
}

const defaultScripts: AutomationScript[] = [
  {
    id: "1",
    name: "Auto-RTL on Low Battery",
    description: "Automatically return to base when battery drops below 20%",
    trigger: "battery_low",
    enabled: true,
    lastRun: new Date(Date.now() - 3600000).toISOString(),
    code: `// Auto RTL on low battery
if (telemetry.battery < 20) {
  await drone.returnToBase();
  notify("Low battery - returning home");
}`
  },
  {
    id: "2",
    name: "Photo on Waypoint",
    description: "Capture photo when reaching any waypoint",
    trigger: "waypoint",
    enabled: true,
    lastRun: null,
    code: `// Capture photo at waypoint
await gimbal.setAngle(-90); // Nadir
await camera.capture();
log("Photo captured at waypoint " + waypoint.id);`
  },
  {
    id: "3",
    name: "GPS Denied Navigation",
    description: "Switch to dead reckoning when GPS signal is lost",
    trigger: "gps_lost",
    enabled: true,
    lastRun: null,
    code: `// GPS lost - switch to backup navigation
if (!gps.hasSignal) {
  navigation.enableDeadReckoning();
  navigation.useVisualOdometry(camera.feed);
  notify("GPS lost - using visual navigation");
}`
  }
];

export function AutomationPanel() {
  const { selectedDrone } = useAppState();
  const { hasPermission } = usePermissions();
  const canAutomate = hasPermission('automation_scripts');
  
  const [scripts, setScripts] = useState<AutomationScript[]>(() => {
    const saved = localStorage.getItem("mouse_automation_scripts");
    if (!saved) return defaultScripts;
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : defaultScripts;
    } catch {
      return defaultScripts;
    }
  });
  const [selectedScript, setSelectedScript] = useState<AutomationScript | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedScript, setEditedScript] = useState<AutomationScript | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const lastTriggerRunRef = useRef<Record<string, number>>({});

  useEffect(() => {
    localStorage.setItem("mouse_automation_scripts", JSON.stringify(scripts));
  }, [scripts]);

  const executeScriptNow = async (script: AutomationScript, reason: string) => {
    const connectionString = String(selectedDrone?.connectionString || "").trim();
    if (!isSupportedAutomationRecipe(script.code, script.trigger)) {
      toast.error("This recipe cannot run yet. Only safe backend-supported actions like arm, disarm, takeoff, land, and RTL are executable.");
      return;
    }

    try {
      toast.info(`Running recipe "${script.name}" (${reason})...`);
      const response = await fetch("/api/automation/scripts/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptId: script.id,
          scriptName: script.name,
          trigger: script.trigger,
          reason,
          code: script.code,
          connectionString,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.run) {
        throw new Error(data?.error || data?.run?.error || "Automation execution failed");
      }

      const nowIso = new Date().toISOString();
      if (data.success) {
        setScripts((prev) =>
          prev.map((s) => (s.id === script.id ? { ...s, lastRun: nowIso } : s)),
        );
        window.dispatchEvent(
          new CustomEvent("automation-script-run", {
            detail: {
              id: script.id,
              name: script.name,
              trigger: script.trigger,
              reason,
              runId: data.run.id,
              commandId: data.run.commandId,
            },
          }),
        );
        toast.success(`"${script.name}" completed`);
      } else {
        throw new Error(data?.run?.error || "Automation execution failed");
      }
    } catch (error) {
      reportApiError(error, "Automation execution failed");
    }
  };

  useEffect(() => {
    const shouldThrottle = (scriptId: string, windowMs: number) => {
      const now = Date.now();
      const last = lastTriggerRunRef.current[scriptId] || 0;
      if (now - last < windowMs) return true;
      lastTriggerRunRef.current[scriptId] = now;
      return false;
    };

    const runEnabledForTrigger = (trigger: AutomationScript["trigger"], reason: string, throttleMs = 5000) => {
      scripts
        .filter((s) => s.enabled && s.trigger === trigger)
        .forEach((script) => {
          if (shouldThrottle(script.id, throttleMs)) return;
          void executeScriptNow(script, reason);
        });
    };

    const onCommandAck = (e: CustomEvent<{ commandType?: string; command?: { type?: string } }>) => {
      const cmd = String(e.detail?.commandType || e.detail?.command?.type || "").trim().toLowerCase();
      if (cmd === "takeoff") runEnabledForTrigger("takeoff", "Takeoff event");
      if (cmd === "land") runEnabledForTrigger("landing", "Landing event");
    };
    const onNavGuidance = (e: CustomEvent<{ command?: string }>) => {
      if (e.detail?.command === "guided-waypoint") {
        runEnabledForTrigger("waypoint", "Waypoint guidance event");
      }
    };

    const onWaypointReached = () => {
      runEnabledForTrigger("waypoint", "Waypoint reached");
    };

    const onTelemetry = (e: CustomEvent<any>) => {
      const data = e.detail || {};
      const battery =
        typeof data.batteryPercent === "number"
          ? data.batteryPercent
          : typeof data.battery === "number"
            ? data.battery
            : null;
      if (battery != null && battery <= 20) {
        runEnabledForTrigger("battery_low", `Battery low (${Math.round(battery)}%)`, 15000);
      }

      const gpsLost =
        data.gpsStatus === "no_fix" ||
        data.gpsFixType === 0 ||
        data.gpsFixType === "no_fix";
      if (gpsLost) {
        runEnabledForTrigger("gps_lost", "GPS fix lost", 12000);
      }
    };

    const onDisconnect = () => {
      runEnabledForTrigger("disconnect", "Connection lost", 12000);
    };

    window.addEventListener("command-acked" as any, onCommandAck);
    window.addEventListener("ml-nav-guidance" as any, onNavGuidance);
    window.addEventListener("waypoint-reached" as any, onWaypointReached);
    window.addEventListener("telemetry-update" as any, onTelemetry);
    window.addEventListener("connection-lost" as any, onDisconnect);
    return () => {
      window.removeEventListener("command-acked" as any, onCommandAck);
      window.removeEventListener("ml-nav-guidance" as any, onNavGuidance);
      window.removeEventListener("waypoint-reached" as any, onWaypointReached);
      window.removeEventListener("telemetry-update" as any, onTelemetry);
      window.removeEventListener("connection-lost" as any, onDisconnect);
    };
  }, [scripts]);

  // Show permission denied if user doesn't have access
  if (!canAutomate) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="flex flex-col items-center gap-4 text-muted-foreground py-12">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access automation scripts.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleCreateNew = () => {
    const newScript: AutomationScript = {
      id: Date.now().toString(),
      name: "New Recipe",
      description: "Enter description",
      trigger: "manual",
      enabled: false,
      lastRun: null,
      code: `// Supported backend actions only
// Examples: arm, disarm, land, rtl, takeoff(20)
rtl`
    };
    setScripts(prev => [...prev, newScript]);
    setSelectedScript(newScript);
    setEditedScript(newScript);
    setIsEditing(true);
    toast.success("New script created");
  };

  const handleSaveScript = () => {
    if (!editedScript) return;
    if (!isSupportedAutomationRecipe(editedScript.code, editedScript.trigger)) {
      toast.error("This panel stores local automation recipes, not arbitrary executable scripts. Save only backend-supported actions.");
      return;
    }
    setScripts(prev => prev.map(s => s.id === editedScript.id ? editedScript : s));
    setSelectedScript(editedScript);
    setIsEditing(false);
    toast.success("Script saved");
  };

  const handleDeleteScript = (id: string) => {
    if (deleteConfirmId === id) {
      setScripts(prev => prev.filter(s => s.id !== id));
      if (selectedScript?.id === id) {
        setSelectedScript(null);
        setEditedScript(null);
      }
      setDeleteConfirmId(null);
      toast.success("Script deleted");
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const handleToggleScript = (id: string, enabled: boolean) => {
    setScripts(prev => prev.map(s => s.id === id ? { ...s, enabled } : s));
    toast.success(enabled ? "Script enabled" : "Script disabled");
  };

  const handleRunScript = (script: AutomationScript) => {
    void executeScriptNow(script, "Manual run");
  };

  const getTriggerBadge = (trigger: string) => {
    const colors: Record<string, string> = {
      manual: "bg-gray-500",
      takeoff: "bg-emerald-500",
      landing: "bg-amber-500",
      waypoint: "bg-primary",
      battery_low: "bg-red-500",
      gps_lost: "bg-purple-500",
      disconnect: "bg-orange-500"
    };
    return colors[trigger] || "bg-gray-500";
  };

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Script List */}
      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              Automation Recipes
            </h3>
            <Button size="sm" onClick={handleCreateNew} data-testid="button-new-script">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Local event recipes that map to a small safe backend action set
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {scripts.map(script => (
              <Card
                key={script.id}
                className={`cursor-pointer transition-colors ${
                  selectedScript?.id === script.id 
                    ? "border-primary bg-primary/10" 
                    : "hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedScript(script);
                  setEditedScript(script);
                  setIsEditing(false);
                }}
                data-testid={`card-script-${script.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{script.name}</span>
                        {script.enabled && (
                          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {script.description}
                      </p>
                    </div>
                    <Badge className={`text-[10px] ${getTriggerBadge(script.trigger)}`}>
                      {script.trigger.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Switch 
                      checked={script.enabled} 
                      onCheckedChange={(v) => handleToggleScript(script.id, v)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`switch-script-${script.id}`}
                    />
                    <div className="flex gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); handleRunScript(script); }}
                        data-testid={`button-run-script-${script.id}`}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant={deleteConfirmId === script.id ? "destructive" : "ghost"}
                        className={`h-6 w-6 ${deleteConfirmId === script.id ? '' : 'text-red-500'}`}
                        onClick={(e) => { e.stopPropagation(); handleDeleteScript(script.id); }}
                        title={deleteConfirmId === script.id ? "Click again to confirm delete" : "Delete script"}
                        data-testid={`button-delete-script-${script.id}`}
                      >
                        {deleteConfirmId === script.id ? (
                          <span className="text-[10px] font-bold">?</span>
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Script Editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedScript ? (
          <>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                {isEditing ? (
                  <Input 
                    value={editedScript?.name || ""}
                    onChange={(e) => setEditedScript(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="text-lg font-bold h-8"
                    data-testid="input-script-name"
                  />
                ) : (
                  <h2 className="text-lg font-bold">{selectedScript.name}</h2>
                )}
                <p className="text-sm text-muted-foreground">
                  {selectedScript.lastRun 
                    ? `Last run: ${new Date(selectedScript.lastRun).toLocaleString()}`
                    : "Never run"
                  }
                </p>
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveScript} data-testid="button-save-script">
                      <Save className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => handleRunScript(selectedScript)}>
                      <Play className="h-4 w-4 mr-2" />
                      Run Now
                    </Button>
                    <Button onClick={() => setIsEditing(true)} data-testid="button-edit-script">
                      Edit
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Trigger Event</Label>
                  <Select 
                    value={isEditing ? editedScript?.trigger : selectedScript.trigger}
                    onValueChange={(v) => setEditedScript(prev => prev ? { ...prev, trigger: v as any } : null)}
                    disabled={!isEditing}
                  >
                    <SelectTrigger data-testid="select-script-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Only</SelectItem>
                      <SelectItem value="takeoff">On Takeoff</SelectItem>
                      <SelectItem value="landing">On Landing</SelectItem>
                      <SelectItem value="waypoint">On Waypoint Reached</SelectItem>
                      <SelectItem value="battery_low">On Low Battery</SelectItem>
                      <SelectItem value="gps_lost">On GPS Lost</SelectItem>
                      <SelectItem value="disconnect">On GCS Disconnect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    value={isEditing ? editedScript?.description : selectedScript.description}
                    onChange={(e) => setEditedScript(prev => prev ? { ...prev, description: e.target.value } : null)}
                    disabled={!isEditing}
                    data-testid="input-script-description"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Recipe Logic</Label>
                <Textarea 
                  value={isEditing ? editedScript?.code : selectedScript.code}
                  onChange={(e) => setEditedScript(prev => prev ? { ...prev, code: e.target.value } : null)}
                  disabled={!isEditing}
                  className="font-mono text-xs min-h-[300px] bg-muted/30"
                  data-testid="textarea-script-code"
                />
              </div>

              <Card className="border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Supported Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <p><code className="text-primary">arm</code>, <code className="text-primary">disarm</code>, <code className="text-primary">land</code>, <code className="text-primary">rtl</code>, and <code className="text-primary">takeoff(20)</code> are supported.</p>
                  <p>Trigger-only recipes for <code className="text-primary">battery_low</code>, <code className="text-primary">gps_lost</code>, and <code className="text-primary">disconnect</code> currently map to safe RTL/landing actions on the backend.</p>
                  <p>Camera, gimbal, GPS-denied navigation, and arbitrary JavaScript execution are not executed by the backend from this panel.</p>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Code className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a recipe to view</p>
              <p className="text-sm">Or create a new local automation recipe</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
