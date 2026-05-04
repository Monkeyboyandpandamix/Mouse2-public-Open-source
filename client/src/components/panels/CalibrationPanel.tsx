import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppState } from "@/contexts/AppStateContext";
import { FcConnectionBadge, useFcConnectionString } from "@/components/shared/FcConnectionBadge";
import { reportApiError } from "@/lib/apiErrors";
import { toast } from "sonner";
import { Compass, SlidersHorizontal, Radio, AlertTriangle, Lock, StopCircle, RefreshCw } from "lucide-react";

type CalMode = "compass" | "accel" | "radio" | "esc" | "gyro" | "baro" | "level";

interface CalState {
  status: "idle" | "running" | "completed" | "failed";
  lastRunAt: string | null;
  message?: string;
  ack?: number | null;
}

const CARD_META: Record<CalMode, { title: string; icon: any; safety: string[]; steps: string[] }> = {
  compass: {
    title: "Compass Calibration",
    icon: Compass,
    safety: ["Remove props", "Keep away from metal/magnets", "Power stable before start"],
    steps: ["Press Start", "Rotate airframe through all orientations", "Wait for completion feedback"],
  },
  accel: {
    title: "Accelerometer Calibration",
    icon: SlidersHorizontal,
    safety: ["Remove props", "Flat stable surface", "Do not move during sample capture"],
    steps: ["Press Start", "Place vehicle on requested faces (if prompted)", "Save and reboot if required"],
  },
  radio: {
    title: "Radio Calibration",
    icon: Radio,
    safety: ["Remove props", "TX on and linked", "Move sticks to full extents slowly"],
    steps: ["Press Start", "Move all channels end-to-end", "Center trims and confirm"],
  },
  esc: {
    title: "ESC Calibration",
    icon: AlertTriangle,
    safety: ["REMOVE PROPS", "Power vehicle from battery when instructed", "Keep throttle low before reboot"],
    steps: ["Press Start", "Vehicle enters ESC calibration on reboot", "Follow ESC tone sequence then power-cycle"],
  },
  gyro: {
    title: "Gyroscope Calibration",
    icon: SlidersHorizontal,
    safety: ["Remove props", "Vehicle must remain perfectly still", "Avoid vibration during capture"],
    steps: ["Press Start", "Keep airframe stationary", "Wait for completion acknowledgment"],
  },
  baro: {
    title: "Barometer Calibration",
    icon: AlertTriangle,
    safety: ["Remove props", "Avoid direct wind on barometer", "Stable ambient pressure recommended"],
    steps: ["Press Start", "Keep vehicle still", "Wait for calibration completion"],
  },
  level: {
    title: "Level Trim Calibration",
    icon: Compass,
    safety: ["Remove props", "Place vehicle on a verified level surface", "Do not move during operation"],
    steps: ["Press Start", "Keep vehicle level", "Confirm trim save"],
  },
};

export function CalibrationPanel() {
  const { hasPermission } = usePermissions();
  const { selectedDrone } = useAppState();
  const canUse = hasPermission("system_settings") || hasPermission("run_terminal");
  const connectionString = useFcConnectionString();
  void selectedDrone;
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Record<CalMode, CalState>>({
    compass: { status: "idle", lastRunAt: null },
    accel: { status: "idle", lastRunAt: null },
    radio: { status: "idle", lastRunAt: null },
    esc: { status: "idle", lastRunAt: null },
    gyro: { status: "idle", lastRunAt: null },
    baro: { status: "idle", lastRunAt: null },
    level: { status: "idle", lastRunAt: null },
  });

  const activeCount = useMemo(
    () => Object.values(state).filter((s) => s.status === "running").length,
    [state],
  );

  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/mavlink/calibration/status");
      const data = await res.json();
      if (!res.ok || !data.success) return;
      setState((prev) => (data.calibration && typeof data.calibration === "object" ? data.calibration : prev));
    } catch {
      // ignore polling failures
    }
  };

  useEffect(() => {
    void refreshStatus();
    const t = window.setInterval(() => void refreshStatus(), 2500);
    return () => window.clearInterval(t);
  }, []);


  const startCalibration = async (mode: CalMode) => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/calibration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString, mode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Failed to start ${mode}`);
      toast.success(`${CARD_META[mode].title} command sent`);
      await refreshStatus();
    } catch (e: any) {
      reportApiError(e, "Calibration failed");
    } finally {
      setBusy(false);
    }
  };

  const cancelCalibration = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/mavlink/calibration/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Cancel failed");
      toast.success("Calibration reset/cancel sent");
      await refreshStatus();
    } catch (e: any) {
      reportApiError(e, "Cancel failed");
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
          <p className="text-sm">Calibration requires System Settings or Terminal permissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full p-4 space-y-4 overflow-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Calibration Workflows</span>
            <Badge variant={activeCount > 0 ? "default" : "outline"}>{activeCount > 0 ? `${activeCount} active` : "Idle"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FcConnectionBadge />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refreshStatus} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" variant="destructive" onClick={cancelCalibration} disabled={busy}>
              <StopCircle className="h-4 w-4 mr-1" /> Cancel/Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(Object.keys(CARD_META) as CalMode[]).map((mode) => {
          const meta = CARD_META[mode];
          const Icon = meta.icon;
          const s = state[mode];
          return (
            <Card key={mode}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {meta.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge variant={s.status === "failed" ? "destructive" : s.status === "completed" ? "secondary" : "outline"}>
                    {s.status}
                  </Badge>
                </div>
                {s.lastRunAt && (
                  <p className="text-[11px] text-muted-foreground">Last run: {new Date(s.lastRunAt).toLocaleString()}</p>
                )}
                {s.message && <p className="text-[11px] text-muted-foreground">{s.message}</p>}
                <Separator />
                <div>
                  <p className="text-xs font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Safety</p>
                  <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
                    {meta.safety.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-1">Workflow</p>
                  <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-0.5">
                    {meta.steps.map((x) => <li key={x}>{x}</li>)}
                  </ol>
                </div>
                <Button className="w-full" size="sm" onClick={() => startCalibration(mode)} disabled={busy || s.status === "running"}>
                  Start {meta.title}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
