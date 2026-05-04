import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppState } from "@/contexts/AppStateContext";
import { FcConnectionBadge, useFcConnectionString } from "@/components/shared/FcConnectionBadge";
import { toast } from "sonner";
import { Lock, Satellite, RefreshCw, Save, Trash2, RotateCw, Download, Upload } from "lucide-react";

interface RtkProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  mountpoint: string;
  username: string;
  password: string;
}

export function RtkNtripPanel() {
  const { hasPermission } = usePermissions();
  const { selectedDrone } = useAppState();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const connectionString = useFcConnectionString();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("2101");
  const [mountpoint, setMountpoint] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profiles, setProfiles] = useState<RtkProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [state, setState] = useState<any>(null);
  const [gpsInjectState, setGpsInjectState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  void selectedDrone;

  const loadProfiles = async () => {
    const res = await fetch("/api/mavlink/rtk/profiles");
    const data = await res.json();
    if (res.ok && data.success) setProfiles(data.profiles || []);
  };

  const refreshStatus = async () => {
    const res = await fetch("/api/mavlink/rtk/status");
    const data = await res.json();
    if (res.ok && data.success) setState(data.state);
  };

  const refreshGpsInjectStatus = async () => {
    const res = await fetch("/api/mavlink/gps-inject/status");
    const data = await res.json();
    if (res.ok && data.success) setGpsInjectState(data.state);
  };

  const start = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/rtk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          host,
          port: Number(port),
          mountpoint,
          username,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to start RTK");
      setState(data.state);
      toast.success("RTK/NTRIP started");
    } catch (e: any) {
      toast.error(e.message || "Failed to start RTK");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/rtk/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to stop RTK");
      setState(data.state);
      toast.success("RTK/NTRIP stopped");
    } catch (e: any) {
      toast.error(e.message || "Failed to stop RTK");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!profileName.trim() || !host.trim() || !mountpoint.trim()) {
      toast.error("Name, host, and mountpoint are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/rtk/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProfileId || undefined,
          name: profileName.trim(),
          host,
          port: Number(port),
          mountpoint,
          username,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save profile");
      toast.success("RTK profile saved");
      await loadProfiles();
      setSelectedProfileId(data.profile?.id || "");
    } catch (e: any) {
      toast.error(e.message || "Failed to save profile");
    } finally {
      setBusy(false);
    }
  };

  const deleteProfile = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/mavlink/rtk/profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete profile");
      toast.success("Profile deleted");
      if (selectedProfileId === id) setSelectedProfileId("");
      await loadProfiles();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete profile");
    } finally {
      setBusy(false);
    }
  };

  const hydrateFromProfile = (profile: RtkProfile) => {
    setSelectedProfileId(profile.id);
    setProfileName(profile.name);
    setHost(profile.host);
    setPort(String(profile.port || 2101));
    setMountpoint(profile.mountpoint);
    setUsername(profile.username || "");
    setPassword(profile.password || "");
  };

  const quickReconnect = async () => {
    if (!selectedProfileId) {
      toast.error("Select a saved profile first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/rtk/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionString,
          profileId: selectedProfileId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Quick reconnect failed");
      setState(data.state);
      toast.success("RTK/NTRIP reconnected from saved profile");
    } catch (e: any) {
      toast.error(e.message || "Quick reconnect failed");
    } finally {
      setBusy(false);
    }
  };

  const startGpsInject = async () => {
    setBusy(true);
    try {
      const payload: any = { connectionString };
      if (selectedProfileId) payload.profileId = selectedProfileId;
      else {
        payload.host = host;
        payload.port = Number(port);
        payload.mountpoint = mountpoint;
        payload.username = username;
        payload.password = password;
      }
      const res = await fetch("/api/mavlink/gps-inject/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to start GPS inject");
      setGpsInjectState(data.state);
      toast.success("GPS inject started");
    } catch (e: any) {
      toast.error(e.message || "Failed to start GPS inject");
    } finally {
      setBusy(false);
    }
  };

  const stopGpsInject = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/gps-inject/stop", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to stop GPS inject");
      setGpsInjectState(data.state);
      toast.success("GPS inject stopped");
    } catch (e: any) {
      toast.error(e.message || "Failed to stop GPS inject");
    } finally {
      setBusy(false);
    }
  };

  const exportProfiles = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/rtk/profiles/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export profiles");
      }
      const text = await res.text();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rtk-profiles-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Profiles exported");
    } catch (e: any) {
      toast.error(e.message || "Failed to export profiles");
    } finally {
      setBusy(false);
    }
  };

  const importProfiles = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const profiles = Array.isArray(parsed) ? parsed : parsed?.profiles;
      if (!Array.isArray(profiles) || !profiles.length) {
        throw new Error("Invalid profile file");
      }
      const res = await fetch("/api/mavlink/rtk/profiles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Import failed");
      toast.success(`Imported ${data.imported} profiles`);
      if (data.skipped > 0) toast.error(`Skipped ${data.skipped} invalid entries`);
      await loadProfiles();
    } catch (e: any) {
      toast.error(e.message || "Failed to import profiles");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadProfiles();
    void refreshStatus();
    void refreshGpsInjectStatus();
  }, []);

  if (!canUse) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Lock className="h-10 w-10 mx-auto mb-2" />
          <p className="font-semibold">Access Restricted</p>
          <p className="text-sm">RTK/NTRIP setup requires System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 space-y-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Satellite className="h-4 w-4" />
            RTK / NTRIP Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded border p-2 space-y-2">
            <Label className="text-xs">Saved Caster Profiles</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportProfiles} disabled={busy}>
                <Download className="h-3 w-3 mr-1" /> Export
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => importRef.current?.click()} disabled={busy}>
                <Upload className="h-3 w-3 mr-1" /> Import
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importProfiles(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div className="space-y-1 max-h-36 overflow-auto">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={selectedProfileId === profile.id ? "default" : "outline"}
                    className="h-7 text-xs flex-1 justify-start"
                    onClick={() => hydrateFromProfile(profile)}
                  >
                    {profile.name} ({profile.host}/{profile.mountpoint})
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteProfile(profile.id)} disabled={busy}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} className="h-8 text-xs" placeholder="Profile name (e.g., Base Caster A)" />
          <FcConnectionBadge />
          <div className="grid grid-cols-2 gap-2">
            <Input value={host} onChange={(e) => setHost(e.target.value)} className="h-8 text-xs" placeholder="Caster host" />
            <Input value={port} onChange={(e) => setPort(e.target.value)} className="h-8 text-xs" placeholder="2101" />
          </div>
          <Input value={mountpoint} onChange={(e) => setMountpoint(e.target.value)} className="h-8 text-xs" placeholder="Mountpoint" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-8 text-xs" placeholder="Username" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-8 text-xs" placeholder="Password" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={start} disabled={busy}>Start</Button>
            <Button size="sm" variant="outline" onClick={stop} disabled={busy}>Stop</Button>
            <Button size="sm" variant="ghost" onClick={refreshStatus} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={saveProfile} disabled={busy}>
              <Save className="h-4 w-4 mr-1" /> Save Profile
            </Button>
            <Button size="sm" variant="outline" onClick={quickReconnect} disabled={busy}>
              <RotateCw className="h-4 w-4 mr-1" /> Quick Reconnect
            </Button>
          </div>
          <div className="rounded border p-2 space-y-2">
            <Label className="text-xs">GPS Inject Workflow</Label>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={startGpsInject} disabled={busy}>Start Inject</Button>
              <Button size="sm" variant="outline" onClick={stopGpsInject} disabled={busy}>Stop Inject</Button>
              <Button size="sm" variant="ghost" onClick={refreshGpsInjectStatus} disabled={busy}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh
              </Button>
            </div>
            {gpsInjectState && (
              <div className="text-xs rounded border p-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <Badge variant={gpsInjectState.running ? "default" : "outline"}>
                    {gpsInjectState.running ? "running" : "stopped"}
                  </Badge>
                </div>
                {gpsInjectState.message && <p className="mt-1 text-muted-foreground">{gpsInjectState.message}</p>}
              </div>
            )}
          </div>
          {state && (
            <div className="text-xs rounded border p-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <Badge variant={state.running ? "default" : "outline"}>{state.running ? "running" : "stopped"}</Badge>
              </div>
              {state.message && <p className="mt-1 text-muted-foreground">{state.message}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
