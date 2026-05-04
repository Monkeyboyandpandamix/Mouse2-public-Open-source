import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertTriangle, Crosshair, RotateCcw, Save, X } from "lucide-react";
import {
  DEFAULT_GAMEPAD_MAPPING,
  GAMEPAD_ACTIONS,
  GAMEPAD_MAPPING_STORAGE_KEY,
  isCriticalAction,
  normalizeMapping,
  type GamepadActionId,
  type GamepadBinding,
  type GamepadMapping,
} from "@shared/gamepadMapping";

interface GamepadMappingDialogProps {
  open: boolean;
  onClose: () => void;
}

const groupLabels: Record<string, string> = {
  critical: "Critical safety controls",
  flight: "Flight commands",
  payload: "Payload / camera",
  axis: "Continuous axes (sticks / triggers)",
};

const formatBinding = (b: GamepadBinding): string => {
  if (b.kind === "button") return `Button ${b.index}`;
  const sign = (b.scale ?? 1) < 0 ? " (inverted)" : "";
  return `Axis ${b.index}${sign}`;
};

export function GamepadMappingDialog({ open, onClose }: GamepadMappingDialogProps) {
  const [mapping, setMapping] = useState<GamepadMapping>(DEFAULT_GAMEPAD_MAPPING);
  const [capturing, setCapturing] = useState<GamepadActionId | null>(null);
  const [livePreview, setLivePreview] = useState<{
    name: string | null;
    buttons: boolean[];
    axes: number[];
  }>({ name: null, buttons: [], axes: [] });
  const captureBaselineRef = useRef<{ buttons: boolean[]; axes: number[] } | null>(null);

  // Load existing mapping when dialog opens.
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(GAMEPAD_MAPPING_STORAGE_KEY);
      setMapping(normalizeMapping(raw ? JSON.parse(raw) : null));
    } catch {
      setMapping(DEFAULT_GAMEPAD_MAPPING);
    }
    setCapturing(null);
  }, [open]);

  // Live polling for the connected gamepad: updates the preview row AND
  // implements "press to assign" when capturing.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = Array.from(pads).find(Boolean) as Gamepad | undefined;
      if (gp) {
        const buttons = gp.buttons.map((b) => Boolean(b?.pressed));
        const axes = gp.axes.map((v) => Number(v) || 0);
        setLivePreview({ name: gp.id, buttons, axes });

        // Capture mode: detect the first significant change vs baseline.
        if (capturing) {
          if (!captureBaselineRef.current) {
            captureBaselineRef.current = { buttons, axes };
          } else {
            const meta = GAMEPAD_ACTIONS.find((a) => a.id === capturing)!;
            const wantsAxis = meta.group === "axis";
            // Buttons first.
            if (!wantsAxis) {
              const idx = buttons.findIndex((p, i) => p && !captureBaselineRef.current!.buttons[i]);
              if (idx >= 0) {
                setMapping((m) => ({ ...m, [capturing]: { kind: "button", index: idx } }));
                captureBaselineRef.current = null;
                setCapturing(null);
              }
            } else {
              const idx = axes.findIndex(
                (v, i) => Math.abs(v - (captureBaselineRef.current!.axes[i] ?? 0)) > 0.5,
              );
              if (idx >= 0) {
                const sign = axes[idx] - (captureBaselineRef.current!.axes[idx] ?? 0) < 0 ? -1 : 1;
                setMapping((m) => ({
                  ...m,
                  [capturing]: { kind: "axis", index: idx, scale: sign },
                }));
                captureBaselineRef.current = null;
                setCapturing(null);
              }
            }
          }
        }
      } else {
        setLivePreview({ name: null, buttons: [], axes: [] });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, capturing]);

  const grouped = useMemo(() => {
    const out: Record<string, typeof GAMEPAD_ACTIONS[number][]> = {};
    for (const meta of GAMEPAD_ACTIONS) {
      (out[meta.group] ||= []).push(meta);
    }
    return out;
  }, []);

  const startCapture = (id: GamepadActionId) => {
    if (!livePreview.name) {
      toast.error("Connect a gamepad first (USB or Bluetooth) and press any button to wake it.");
      return;
    }
    captureBaselineRef.current = null;
    setCapturing(id);
  };

  const resetOne = (id: GamepadActionId) => {
    setMapping((m) => ({ ...m, [id]: { ...DEFAULT_GAMEPAD_MAPPING[id] } }));
  };

  const resetAll = () => {
    setMapping({ ...DEFAULT_GAMEPAD_MAPPING });
    toast.success("All bindings reset to defaults");
  };

  const save = () => {
    try {
      localStorage.setItem(GAMEPAD_MAPPING_STORAGE_KEY, JSON.stringify(mapping));
      window.dispatchEvent(new CustomEvent("gamepad-mapping-changed", { detail: mapping }));
      toast.success("Gamepad mapping saved");
      onClose();
    } catch (e) {
      toast.error("Failed to save mapping");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col" data-testid="dialog-gamepad-mapping">
        <DialogHeader>
          <DialogTitle>Configure Gamepad / Joystick</DialogTitle>
          <DialogDescription>
            Assign each action to any button or axis on your USB or Bluetooth controller.
            Critical safety actions can be re-assigned but never deleted.
          </DialogDescription>
        </DialogHeader>

        {/* Live status row */}
        <div className="flex items-center justify-between rounded-md border p-3 text-sm">
          <div className="flex items-center gap-2">
            <Crosshair className={livePreview.name ? "h-4 w-4 text-emerald-500" : "h-4 w-4 text-muted-foreground"} />
            <span className="font-mono text-xs" data-testid="text-gamepad-detected">
              {livePreview.name || "No gamepad detected — connect via USB or pair via Bluetooth, then press any button."}
            </span>
          </div>
          {capturing && (
            <Badge variant="destructive" className="gap-1">
              <span className="animate-pulse">●</span> Press a {GAMEPAD_ACTIONS.find((a) => a.id === capturing)?.group === "axis" ? "stick / trigger" : "button"} on your controller…
              <button onClick={() => { setCapturing(null); captureBaselineRef.current = null; }} className="ml-2">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4">
            {Object.entries(grouped).map(([group, items]) => (
              <Card key={group}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {group === "critical" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    {groupLabels[group] || group}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((meta) => {
                    const binding = mapping[meta.id];
                    const isLive =
                      binding.kind === "button"
                        ? Boolean(livePreview.buttons[binding.index])
                        : Math.abs(livePreview.axes[binding.index] ?? 0) > 0.15;
                    return (
                      <div
                        key={meta.id}
                        className="grid grid-cols-12 items-center gap-2 rounded-md border p-2"
                        data-testid={`row-mapping-${meta.id}`}
                      >
                        <div className="col-span-5">
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium">{meta.label}</Label>
                            {isCriticalAction(meta.id) && (
                              <Badge variant="outline" className="border-amber-500 text-amber-500 text-[9px]">
                                CRITICAL
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">{meta.description}</p>
                        </div>
                        <div className="col-span-3">
                          <Badge variant={isLive ? "default" : "secondary"} className="font-mono text-xs">
                            {formatBinding(binding)}
                          </Badge>
                        </div>
                        <div className="col-span-4 flex justify-end gap-1">
                          {binding.kind === "axis" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setMapping((m) => ({
                                  ...m,
                                  [meta.id]: { ...binding, scale: -(binding.scale ?? 1) },
                                }))
                              }
                              title="Invert axis"
                              data-testid={`button-invert-${meta.id}`}
                            >
                              ±
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={capturing === meta.id ? "destructive" : "outline"}
                            onClick={() => startCapture(meta.id)}
                            data-testid={`button-assign-${meta.id}`}
                          >
                            {capturing === meta.id ? "Cancel" : "Assign"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resetOne(meta.id)}
                            title="Reset to default"
                            data-testid={`button-reset-${meta.id}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={resetAll} data-testid="button-reset-all-mappings">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset all to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-mapping">
              Cancel
            </Button>
            <Button onClick={save} data-testid="button-save-mapping">
              <Save className="h-4 w-4 mr-2" />
              Save mapping
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
