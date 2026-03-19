import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Clock3, ExternalLink, ListChecks } from "lucide-react";

type ParityStatus = "implemented" | "partial";

interface ParityItem {
  id: string;
  feature: string;
  status: ParityStatus;
  notes: string;
  tabId?: string;
}

const PARITY_ITEMS: ParityItem[] = [
  {
    id: "mission-commands",
    feature: "Mission command coverage (DO_/CONDITION_/custom/spline)",
    status: "implemented",
    notes: "Upload/download bridge and UI action editors are wired end-to-end.",
    tabId: "mission",
  },
  {
    id: "mission-depth",
    feature: "Mission planning utility depth vs Mission Planner",
    status: "implemented",
    notes: "Includes survey/grid/corridor generators plus mission restructuring utilities (insert RTL, reverse, altitude/frame bulk edits).",
    tabId: "mission",
  },
  {
    id: "inspector-live",
    feature: "MAVLink Inspector real-time stream",
    status: "implemented",
    notes: "Live snapshot/rate/history chart is available in MAVLink Tools.",
    tabId: "mavtools",
  },
  {
    id: "optional-hw",
    feature: "Optional hardware ecosystem workflows",
    status: "implemented",
    notes: "Expanded profile library covers DroneCAN, rangefinder variants, battery monitor variants, optical-flow, ADS-B, ESC telemetry.",
    tabId: "vehiclesetup",
  },
  {
    id: "dataflash",
    feature: "DataFlash tooling depth",
    status: "implemented",
    notes: "Adds replay-track export from BIN analysis with keyframes + GeoJSON along with list/download/analyze pipeline.",
    tabId: "logs",
  },
  {
    id: "sik",
    feature: "SiK modem workflow parity",
    status: "implemented",
    notes: "Adds modem AT query plus multi-command modem profile programming workflow from UI.",
    tabId: "mavtools",
  },
  {
    id: "firmware",
    feature: "Firmware workflow parity",
    status: "implemented",
    notes: "Native flash/recovery plus managed firmware catalog add/edit/delete/install workflow integrated in Settings.",
    tabId: "settings",
  },
  {
    id: "geotag",
    feature: "Geotag pipeline parity",
    status: "implemented",
    notes: "CAM/GPS and time-offset matching modes are supported; advanced MP geotag UX variants remain broader.",
    tabId: "logs",
  },
  {
    id: "swarm",
    feature: "Swarm/multi-vehicle maturity",
    status: "implemented",
    notes: "Includes fan-out actions, synchronized actions, formation planning, and per-vehicle formation mission generation.",
    tabId: "swarm",
  },
  {
    id: "plugins",
    feature: "Plugin/toolchain ecosystem depth",
    status: "implemented",
    notes: "Adds starter manifest/tool, runtime execution, SDK template creation, manifest validation, and package export.",
    tabId: "plugins",
  },
  {
    id: "airframe-switch",
    feature: "Airframe switching and reconfiguration",
    status: "implemented",
    notes: "Quad/Hexa/Octa profile apply + optional FC reboot flow are wired from UI to MAVLink.",
    tabId: "vehiclesetup",
  },
];

export function MissionPlannerParityPanel() {
  const openTab = (tabId?: string) => {
    if (!tabId) return;
    window.dispatchEvent(new CustomEvent("navigate-tab", { detail: { tabId } }));
  };

  return (
    <div className="h-full p-4 overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Mission Planner Parity Checklist
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Static capability checklist — not live runtime verification. Items reflect code coverage, not hardware validation.
          </p>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[72vh] rounded border">
            <div className="p-2 space-y-2">
              {PARITY_ITEMS.map((item) => (
                <div key={item.id} className="rounded border p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.feature}</p>
                    <Badge variant={item.status === "implemented" ? "default" : "secondary"} className="capitalize">
                      {item.status === "implemented" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock3 className="h-3 w-3 mr-1" />}
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.notes}</p>
                  {item.tabId && (
                    <Button size="sm" variant="outline" onClick={() => openTab(item.tabId)}>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open Related Panel
                    </Button>
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
