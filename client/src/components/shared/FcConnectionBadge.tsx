import { Badge } from "@/components/ui/badge";
import { Cable, Settings as SettingsIcon } from "lucide-react";
import { useAppState } from "@/contexts/AppStateContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FcConnectionBadgeProps {
  className?: string;
  fallback?: string;
  showLabel?: boolean;
  compact?: boolean;
}

/**
 * Universal read-only display of the FC connection string.
 * Pulls from the currently-selected drone's `connectionString` (set during
 * drone registration). Editing is centralized in the Drone Selection / Settings panel.
 */
export function FcConnectionBadge({
  className = "",
  fallback = "serial:/dev/ttyACM0:57600",
  showLabel = true,
  compact = false,
}: FcConnectionBadgeProps) {
  const { selectedDrone } = useAppState();
  const raw = ((selectedDrone?.connectionString as string | undefined) || "").trim();
  const isConfigured = raw.length > 0;
  const value = isConfigured ? raw : fallback;
  const droneLabel = selectedDrone?.name ? `${selectedDrone.name}` : "(no drone selected)";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isConfigured ? "outline" : "secondary"}
            className={`gap-1 font-mono text-[10px] cursor-help ${className}`}
            data-testid="badge-fc-connection"
          >
            <Cable className="h-3 w-3" />
            {showLabel && !compact && (
              <span className="text-muted-foreground">{isConfigured ? "FC:" : "FC (default):"}</span>
            )}
            <span className="truncate max-w-[260px]">{value}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-semibold">Flight Controller Connection</div>
            <div className="text-xs">{droneLabel}</div>
            <div className="text-xs font-mono break-all">{value}</div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
              <SettingsIcon className="h-3 w-3" /> Edit in Drone Selection panel
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Hook that returns the resolved FC connection string from the selected drone.
 * Returns an empty string when no drone is selected or its connection is unset —
 * callers (e.g. fence/mission sync) should treat empty as "not configured" and refuse
 * destructive operations rather than silently using a default device path.
 *
 * For purely display-oriented uses, pass a fallback explicitly.
 */
export function useFcConnectionString(fallback = ""): string {
  const { selectedDrone } = useAppState();
  return ((selectedDrone?.connectionString as string | undefined) || "").trim() || fallback;
}
