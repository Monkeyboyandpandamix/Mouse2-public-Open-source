import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Monitor,
  Cpu,
  Wifi,
  WifiOff,
  Mic,
  Camera,
  Speaker,
  Navigation,
  ArrowLeftRight,
} from "lucide-react";
import { type DeviceEnvironment } from "@/hooks/useDeviceContext";

interface DeviceContextBannerProps {
  environment: DeviceEnvironment;
  isOnboard: boolean;
  networkStatus: "connected" | "degraded" | "disconnected";
  latencyMs: number;
  connectedDroneName: string | null;
  peripheralMappings: {
    microphone: string;
    camera: string;
    speaker: string;
  };
  onToggleEnvironment?: () => void;
}

export function DeviceContextBanner({
  environment,
  isOnboard,
  networkStatus,
  latencyMs,
  connectedDroneName,
  peripheralMappings,
  onToggleEnvironment,
}: DeviceContextBannerProps) {
  const isController = environment === "ground_controller";

  const envColor = isController
    ? "bg-blue-600/90 border-blue-500"
    : "bg-emerald-600/90 border-emerald-500";

  const netIcon = networkStatus === "connected"
    ? <Wifi className="h-3 w-3" />
    : networkStatus === "degraded"
    ? <Wifi className="h-3 w-3 text-amber-300" />
    : <WifiOff className="h-3 w-3 text-red-300" />;

  const peripheralLabels = {
    drone_speaker: "Drone Speaker",
    local_preview: "Local Preview",
    drone_gimbal: "Drone Gimbal",
    local_webcam: "Local Webcam",
    drone_mic_listen: "Drone Mic",
    local_playback: "Local Playback",
  };

  const getMappingLabel = (val: string) =>
    (peripheralLabels as Record<string, string>)[val] ?? val;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 text-white text-[10px] border-b ${envColor}`}
      data-testid="device-context-banner"
    >
      <div className="flex items-center gap-1.5">
        {isController ? (
          <Monitor className="h-3.5 w-3.5" />
        ) : (
          <Cpu className="h-3.5 w-3.5" />
        )}
        <span className="font-semibold uppercase tracking-wide">
          {isController ? "Ground Controller" : "Drone Onboard"}
        </span>
      </div>

      {connectedDroneName && (
        <>
          <span className="opacity-50">|</span>
          <span className="opacity-80">{connectedDroneName}</span>
        </>
      )}

      <span className="opacity-50">|</span>
      <div className="flex items-center gap-1">
        {netIcon}
        <span className="opacity-80">
          {networkStatus === "connected" ? `${latencyMs}ms` : networkStatus}
        </span>
      </div>

      <div className="flex-1" />

      <div className="hidden sm:flex items-center gap-2 opacity-80">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5">
              <Mic className="h-3 w-3" />
              <span>{getMappingLabel(peripheralMappings.microphone)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Microphone routes to: {getMappingLabel(peripheralMappings.microphone)}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5">
              <Camera className="h-3 w-3" />
              <span>{getMappingLabel(peripheralMappings.camera)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Camera source: {getMappingLabel(peripheralMappings.camera)}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-0.5">
              <Speaker className="h-3 w-3" />
              <span>{getMappingLabel(peripheralMappings.speaker)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Speaker source: {getMappingLabel(peripheralMappings.speaker)}
          </TooltipContent>
        </Tooltip>
      </div>

      {!isOnboard && onToggleEnvironment && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-white/80 hover:text-white hover:bg-white/20"
              onClick={onToggleEnvironment}
              data-testid="toggle-device-env"
            >
              <ArrowLeftRight className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Switch device environment
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
