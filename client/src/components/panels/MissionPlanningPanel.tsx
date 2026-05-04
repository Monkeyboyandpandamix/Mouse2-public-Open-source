import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Play, MapPin, Navigation, Search, AlertTriangle, Clock, Bell, RotateCcw, Radar, Edit, X, Check, Lock, Hand, ArrowUp, Wrench } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MissionMap } from "@/components/map/MissionMap";
import { usePermissions } from "@/hooks/usePermissions";
import { useNoFlyZones } from "@/hooks/useNoFlyZones";
import { segmentIntersectsNoFlyZones } from "@/lib/noFlyZones";
import type { NoFlyZone } from "@/lib/noFlyZones";
import { FcConnectionBadge, useFcConnectionString } from "@/components/shared/FcConnectionBadge";
import { missionsApi, waypointsApi } from "@/lib/api";
import { reportApiError } from "@/lib/apiErrors";
import { useAppState } from "@/contexts/AppStateContext";

interface Mission {
  id: string;
  name: string;
  description: string | null;
  status: string;
  homeLatitude: number;
  homeLongitude: number;
  homeAltitude: number;
}

interface Waypoint {
  id: string;
  missionId: string;
  order: number;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number | null;
  action: string | null;
  actionParams: any;
  address: string | null;
}

const WAYPOINT_ACTIONS = [
  { value: "flythrough", label: "Fly Through", icon: Navigation, desc: "Pass through without stopping" },
  { value: "hover", label: "Hover", icon: Clock, desc: "Stop and hover at location" },
  { value: "alert", label: "Alert on Arrival", icon: Bell, desc: "Send notification when reached" },
  { value: "patrol", label: "Patrol Area", icon: Radar, desc: "Circle around this point" },
  { value: "spline_waypoint", label: "Spline Waypoint", icon: Navigation, desc: "Smooth curved segment waypoint" },
  { value: "do_set_servo", label: "DO Set Servo", icon: Hand, desc: "Set servo PWM (payload/gripper)" },
  { value: "do_change_speed", label: "DO Change Speed", icon: Navigation, desc: "Change mission speed" },
  { value: "do_set_cam_trig_dist", label: "DO Cam Trigger Dist", icon: Radar, desc: "Distance-based camera trigger" },
  { value: "do_mount_control", label: "DO Mount Control", icon: Navigation, desc: "Gimbal pitch/roll/yaw control" },
  { value: "do_set_home", label: "DO Set Home", icon: MapPin, desc: "Set new home location" },
  { value: "do_jump", label: "DO Jump", icon: RotateCcw, desc: "Jump to mission item index" },
  { value: "do_set_roi", label: "DO Set ROI", icon: MapPin, desc: "Point camera to ROI coordinates" },
  { value: "condition_delay", label: "Condition Delay", icon: Clock, desc: "Delay before continuing mission" },
  { value: "condition_yaw", label: "Condition Yaw", icon: RotateCcw, desc: "Yaw vehicle before continuing" },
  { value: "condition_distance", label: "Condition Distance", icon: Navigation, desc: "Trigger after travel distance" },
  { value: "condition_change_alt", label: "Condition Change Alt", icon: ArrowUp, desc: "Change altitude conditionally" },
  { value: "land", label: "Land", icon: ArrowUp, desc: "Land at waypoint location" },
  { value: "takeoff", label: "Takeoff", icon: ArrowUp, desc: "Takeoff command in mission" },
  { value: "loiter_turns", label: "Loiter Turns", icon: RotateCcw, desc: "Loiter with turn count/radius" },
  { value: "custom_command", label: "Custom MAV_CMD", icon: Wrench, desc: "Custom mission command id + params" },
  { value: "open_gripper", label: "Open Gripper", icon: Hand, desc: "Open gripper to release payload" },
  { value: "rtl", label: "Return to Launch", icon: RotateCcw, desc: "Return home after this point" },
];

export function MissionPlanningPanel() {
  const { selectedDrone } = useAppState();
  const { hasPermission } = usePermissions();
  const canPlanMissions = hasPermission('mission_planning');
  const canDeleteData = hasPermission('delete_flight_data');
  
  const queryClient = useQueryClient();
  const [selectedMission, setSelectedMission] = useState<string | null>(null);
  const [targetMethod, setTargetMethod] = useState<"map" | "address" | "coordinates">("map");
  const [addressInput, setAddressInput] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [coordLat, setCoordLat] = useState("");
  const [coordLon, setCoordLon] = useState("");
  const [coordAlt, setCoordAlt] = useState("50");
  const [altitudeFrame, setAltitudeFrame] = useState<"relative" | "terrain" | "amsl">("relative");
  const [terrainFollow, setTerrainFollow] = useState(false);
  const [selectedAction, setSelectedAction] = useState("flythrough");
  const [hoverTime, setHoverTime] = useState("5");
  const [patrolRadius, setPatrolRadius] = useState("20");
  const [servoChannel, setServoChannel] = useState("9");
  const [servoPwm, setServoPwm] = useState("1700");
  const [speedOverride, setSpeedOverride] = useState("5");
  const [conditionDelaySec, setConditionDelaySec] = useState("5");
  const [conditionYawDeg, setConditionYawDeg] = useState("90");
  const [conditionDistanceM, setConditionDistanceM] = useState("20");
  const [conditionAltM, setConditionAltM] = useState("20");
  const [roiLat, setRoiLat] = useState("");
  const [roiLng, setRoiLng] = useState("");
  const [camTrigDistanceM, setCamTrigDistanceM] = useState("20");
  const [mountPitchDeg, setMountPitchDeg] = useState("0");
  const [mountRollDeg, setMountRollDeg] = useState("0");
  const [mountYawDeg, setMountYawDeg] = useState("0");
  const [jumpTargetSeq, setJumpTargetSeq] = useState("1");
  const [jumpRepeat, setJumpRepeat] = useState("1");
  const [homeLat, setHomeLat] = useState("");
  const [homeLng, setHomeLng] = useState("");
  const [homeAlt, setHomeAlt] = useState("0");
  const [customCommand, setCustomCommand] = useState("16");
  const [customP1, setCustomP1] = useState("0");
  const [customP2, setCustomP2] = useState("0");
  const [customP3, setCustomP3] = useState("0");
  const [customP4, setCustomP4] = useState("0");
  const [customP5, setCustomP5] = useState("0");
  const [customP6, setCustomP6] = useState("0");
  const [customP7, setCustomP7] = useState("0");
  const [generatorType, setGeneratorType] = useState<"survey" | "grid" | "corridor">("survey");
  const [generatorWidth, setGeneratorWidth] = useState("180");
  const [generatorHeight, setGeneratorHeight] = useState("120");
  const [generatorLaneSpacing, setGeneratorLaneSpacing] = useState("30");
  const [generatorHeading, setGeneratorHeading] = useState("0");
  const [corridorWidth, setCorridorWidth] = useState("40");
  const [utilityAltDelta, setUtilityAltDelta] = useState("5");
  const [missionUtilityBusy, setMissionUtilityBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [missionToDelete, setMissionToDelete] = useState<Mission | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [editingWaypoint, setEditingWaypoint] = useState<Waypoint | null>(null);
  const [editWaypointData, setEditWaypointData] = useState({
    altitude: "",
    action: "flythrough",
    address: "",
    hoverTime: "5",
    patrolRadius: "20",
    servoChannel: "9",
    servoPwm: "1700",
    speedOverride: "5",
    conditionDelaySec: "5",
    conditionYawDeg: "90",
    conditionDistanceM: "20",
    conditionAltM: "20",
    roiLat: "",
    roiLng: "",
    camTrigDistanceM: "20",
    mountPitchDeg: "0",
    mountRollDeg: "0",
    mountYawDeg: "0",
    jumpTargetSeq: "1",
    jumpRepeat: "1",
    homeLat: "",
    homeLng: "",
    homeAlt: "0",
    customCommand: "16",
    customP1: "0",
    customP2: "0",
    customP3: "0",
    customP4: "0",
    customP5: "0",
    customP6: "0",
    customP7: "0",
    altitudeFrame: "relative",
    terrainFollow: false,
  });
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const fcConnectionString = useFcConnectionString();
  const [overrideNoFlyRestrictions, setOverrideNoFlyRestrictions] = useState(false);
  const [partTimeRestrictedZones, setPartTimeRestrictedZones] = useState<NoFlyZone[]>([]);
  const noFlyZones = useNoFlyZones();

  useEffect(() => {
    let active = true;

    const parsePartTimeRestrictions = async () => {
      try {
        const res = await fetch("/airspace/Part_Time_National_Security_UAS_Flight_Restrictions.geojson");
        if (!res.ok) return;
        const geojson = await res.json();
        if (!active) return;

        const now = new Date();
        const features = Array.isArray(geojson?.features) ? geojson.features : [];
        const zones: NoFlyZone[] = [];

        for (const feature of features) {
          const props = feature?.properties || {};
          const alertTime = props.ALERTTIME ? new Date(props.ALERTTIME) : null;
          const activeTime = props.ACTIVETIME ? new Date(props.ACTIVETIME) : alertTime;
          const endTime = props.ENDTIME ? new Date(props.ENDTIME) : null;
          const isActiveNow =
            (!activeTime || activeTime <= now) &&
            (!endTime || endTime >= now);

          if (!isActiveNow) continue;

          const id = String(props.FAA_ID || props.OBJECTID || `part-time-${zones.length + 1}`);
          const name = String(props.Facility || props.Base || "Part-Time Restriction");
          const geometry = feature?.geometry;

          if (geometry?.type === "Polygon" && Array.isArray(geometry.coordinates?.[0])) {
            const points = geometry.coordinates[0]
              .map((coord: any) => {
                if (!Array.isArray(coord) || coord.length < 2) return null;
                return { lat: Number(coord[1]), lng: Number(coord[0]) };
              })
              .filter((p): p is { lat: number; lng: number } => Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lng)));
            if (points.length >= 3) {
              zones.push({
                id,
                name: `${name} (Part-Time Active)`,
                type: "polygon",
                enabled: true,
                action: "warn",
                points,
              });
            }
          }
        }

        setPartTimeRestrictedZones(zones);
      } catch {
        if (active) setPartTimeRestrictedZones([]);
      }
    };

    void parsePartTimeRestrictions();
    const timer = setInterval(() => {
      void parsePartTimeRestrictions();
    }, 5 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleMissionUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ missionId?: string | number }>;
      if (customEvent.detail?.missionId) {
        setSelectedMission(String(customEvent.detail.missionId));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      if (customEvent.detail?.missionId) {
        queryClient.invalidateQueries({ queryKey: ["/api/missions", customEvent.detail.missionId, "waypoints"] });
      }
      if (selectedMission) {
        queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      }
      toast.info("Mission updated from optimizer");
    };
    
    window.addEventListener('mission-updated', handleMissionUpdated);
    return () => window.removeEventListener('mission-updated', handleMissionUpdated);
  }, [queryClient, selectedMission]);

  const { data: missions = [] } = useQuery<Mission[]>({
    queryKey: ["/api/missions"],
  });

  const { data: waypoints = [] } = useQuery<Waypoint[]>({
    queryKey: ["/api/missions", selectedMission, "waypoints"],
    enabled: !!selectedMission,
  });

  const selectedMissionData = missions.find(m => m.id === selectedMission);
  const orderedWaypoints = [...waypoints].sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0);
    return orderDiff !== 0 ? orderDiff : String(a.id).localeCompare(String(b.id));
  });
  const getNextWaypointOrder = () => orderedWaypoints.reduce((max, wp) => Math.max(max, wp.order || 0), 0) + 1;

  const createMission = useMutation<{ id: string }, Error, any>({
    mutationFn: async (mission: any) => missionsApi.create(mission) as Promise<{ id: string }>,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      if (data?.id) setSelectedMission(String(data.id));
      toast.success("Mission created");
    },
  });

  const deleteMission = useMutation({
    mutationFn: async (id: string) => missionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      setSelectedMission(null);
      setDeleteDialogOpen(false);
      toast.success("Mission deleted");
    },
  });

  const saveMission = useMutation({
    mutationFn: async (mission: Mission) =>
      missionsApi.update(mission.id, {
        name: mission.name,
        description: mission.description,
        homeLatitude: mission.homeLatitude,
        homeLongitude: mission.homeLongitude,
        homeAltitude: mission.homeAltitude,
        status: mission.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      if (selectedMission) {
        queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      }
      toast.success("Mission saved");
    },
    onError: () => {
      toast.error("Failed to save mission");
    },
  });

  const updateWaypoint = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => waypointsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
    },
  });

  const deleteWaypoint = useMutation({
    mutationFn: async (id: string) => waypointsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success("Waypoint removed");
    },
  });

  const createWaypointDirect = async (payload: any) => waypointsApi.create(payload);

  const patchWaypointDirect = async (id: string, data: any) => waypointsApi.update(id, data);

  const metersToLat = (meters: number) => meters / 111320;
  const metersToLng = (meters: number, atLat: number) => meters / (111320 * Math.cos((atLat * Math.PI) / 180));

  const rotateOffsetMeters = (eastMeters: number, northMeters: number, headingDeg: number) => {
    const rad = (headingDeg * Math.PI) / 180;
    const x = eastMeters * Math.cos(rad) - northMeters * Math.sin(rad);
    const y = eastMeters * Math.sin(rad) + northMeters * Math.cos(rad);
    return { east: x, north: y };
  };

  const appendGeneratedWaypoints = async (
    points: Array<{ lat: number; lng: number }>,
    action: string = "flythrough",
  ) => {
    if (!selectedMission || !points.length) return;
    const baseOrder = getNextWaypointOrder();
    const targetAltitude = parseFloat(coordAlt) || 50;
    for (let i = 0; i < points.length; i++) {
      await createWaypointDirect({
        missionId: selectedMission,
        order: baseOrder + i,
        latitude: points[i].lat,
        longitude: points[i].lng,
        altitude: targetAltitude,
        speed: 5,
        action,
        actionParams: {
          altitudeFrame,
          terrainFollow,
        },
        address: null,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
  };

  const generatePatternWaypoints = async () => {
    if (!selectedMission || !selectedMissionData) return;

    const width = Math.max(20, Number(generatorWidth) || 180);
    const height = Math.max(20, Number(generatorHeight) || 120);
    const spacing = Math.max(5, Number(generatorLaneSpacing) || 30);
    const heading = Number(generatorHeading) || 0;
    const home = { lat: selectedMissionData.homeLatitude, lng: selectedMissionData.homeLongitude };
    const output: Array<{ lat: number; lng: number }> = [];

    if (generatorType === "corridor") {
      if (orderedWaypoints.length < 2) {
        toast.error("Corridor generation requires at least 2 existing waypoints");
        return;
      }
      const half = Math.max(5, Number(corridorWidth) || 40) / 2;
      for (let i = 0; i < orderedWaypoints.length - 1; i++) {
        const a = { lat: orderedWaypoints[i].latitude, lng: orderedWaypoints[i].longitude };
        const b = { lat: orderedWaypoints[i + 1].latitude, lng: orderedWaypoints[i + 1].longitude };
        const dy = b.lat - a.lat;
        const dx = b.lng - a.lng;
        const mag = Math.hypot(dx, dy) || 1;
        const nx = -dy / mag;
        const ny = dx / mag;
        const dLat = metersToLat(half * ny);
        const dLng = metersToLng(half * nx, a.lat);
        output.push({ lat: a.lat + dLat, lng: a.lng + dLng });
        output.push({ lat: a.lat - dLat, lng: a.lng - dLng });
      }
      const last = orderedWaypoints[orderedWaypoints.length - 1];
      output.push({ lat: last.latitude, lng: last.longitude });
    } else {
      const lanes = Math.max(2, Math.ceil(width / spacing));
      const xStart = -width / 2;
      const yStart = -height / 2;
      for (let i = 0; i <= lanes; i++) {
        const x = xStart + i * spacing;
        const up = i % 2 === 0;
        const y1 = yStart;
        const y2 = yStart + height;
        const p1 = rotateOffsetMeters(x, up ? y1 : y2, heading);
        const p2 = rotateOffsetMeters(x, up ? y2 : y1, heading);
        output.push({
          lat: home.lat + metersToLat(p1.north),
          lng: home.lng + metersToLng(p1.east, home.lat),
        });
        output.push({
          lat: home.lat + metersToLat(p2.north),
          lng: home.lng + metersToLng(p2.east, home.lat),
        });
      }
      if (generatorType === "grid") {
        const crossHeading = heading + 90;
        for (let i = 0; i <= Math.max(2, Math.ceil(height / spacing)); i++) {
          const y = yStart + i * spacing;
          const left = -width / 2;
          const right = width / 2;
          const p1 = rotateOffsetMeters(left, y, crossHeading);
          const p2 = rotateOffsetMeters(right, y, crossHeading);
          output.push({
            lat: home.lat + metersToLat(p1.north),
            lng: home.lng + metersToLng(p1.east, home.lat),
          });
          output.push({
            lat: home.lat + metersToLat(p2.north),
            lng: home.lng + metersToLng(p2.east, home.lat),
          });
        }
      }
    }

    if (!output.length) {
      toast.error("Pattern generation produced no points");
      return;
    }
    await appendGeneratedWaypoints(output, "spline_waypoint");
    toast.success(`Generated ${output.length} ${generatorType} waypoint(s)`);
  };

  const addRtlAtEnd = async () => {
    if (!selectedMission || !selectedMissionData) return;
    if (!waypoints.length) {
      toast.error("Add at least one waypoint first");
      return;
    }
    setMissionUtilityBusy(true);
    try {
      const last = orderedWaypoints[orderedWaypoints.length - 1];
      await createWaypointDirect({
        missionId: selectedMission,
        order: getNextWaypointOrder(),
        latitude: last.latitude,
        longitude: last.longitude,
        altitude: last.altitude || 40,
        speed: last.speed || 5,
        action: "rtl",
        actionParams: { frame: "relative" },
        address: "Auto RTL",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success("RTL inserted at mission end");
    } catch (e: any) {
      toast.error(e.message || "Failed to insert RTL");
    } finally {
      setMissionUtilityBusy(false);
    }
  };

  const reverseWaypointOrder = async () => {
    if (!selectedMission || waypoints.length < 2) {
      toast.error("Need at least 2 waypoints");
      return;
    }
    setMissionUtilityBusy(true);
    try {
      const reversed = [...orderedWaypoints].reverse();
      for (let i = 0; i < reversed.length; i++) {
        await patchWaypointDirect(reversed[i].id, { order: i + 1 });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success("Mission waypoint order reversed");
    } catch (e: any) {
      toast.error(e.message || "Failed to reverse mission");
    } finally {
      setMissionUtilityBusy(false);
    }
  };

  const offsetMissionAltitude = async () => {
    if (!selectedMission || !waypoints.length) {
      toast.error("No waypoints in mission");
      return;
    }
    const delta = Number(utilityAltDelta || 0);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Enter non-zero altitude delta");
      return;
    }
    setMissionUtilityBusy(true);
    try {
      for (const wp of orderedWaypoints) {
        const nextAlt = Math.max(0, Number(wp.altitude || 0) + delta);
        await patchWaypointDirect(wp.id, { altitude: nextAlt });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success(`Adjusted all waypoint altitudes by ${delta}m`);
    } catch (e: any) {
      toast.error(e.message || "Failed to adjust altitudes");
    } finally {
      setMissionUtilityBusy(false);
    }
  };

  const setFrameForAll = async (frame: "relative" | "terrain" | "amsl") => {
    if (!selectedMission || !waypoints.length) {
      toast.error("No waypoints in mission");
      return;
    }
    setMissionUtilityBusy(true);
    try {
      for (const wp of orderedWaypoints) {
        const existing = wp.actionParams || {};
        await patchWaypointDirect(wp.id, {
          actionParams: {
            ...existing,
            frame,
            altitudeFrame: frame,
            terrainFollow: frame === "terrain",
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success(`Set altitude frame to ${frame.toUpperCase()} for all waypoints`);
    } catch (e: any) {
      toast.error(e.message || "Failed to set frame");
    } finally {
      setMissionUtilityBusy(false);
    }
  };

  const createWaypointsForDestination = useCallback(async (lat: number, lng: number, address?: string | null) => {
    if (!selectedMission || !selectedMissionData) return;

    const startPoint =
      orderedWaypoints.length > 0
        ? { lat: orderedWaypoints[orderedWaypoints.length - 1].latitude, lng: orderedWaypoints[orderedWaypoints.length - 1].longitude }
        : { lat: selectedMissionData.homeLatitude, lng: selectedMissionData.homeLongitude };
    const destination = { lat, lng };

    const targetAltitude = parseFloat(coordAlt) || 50;

    // Optimistic feedback so the click feels responsive.
    const pendingToastId = toast.loading("Adding waypoint…");

    // If the operator already authorized a no-fly override, skip the network roundtrip
    // entirely (the airspace check would only block, never approve, on success).
    let directPathCrossesRestricted = false;
    if (!overrideNoFlyRestrictions) {
      const minLat = Math.min(startPoint.lat, destination.lat) - 0.05;
      const maxLat = Math.max(startPoint.lat, destination.lat) + 0.05;
      const minLng = Math.min(startPoint.lng, destination.lng) - 0.05;
      const maxLng = Math.max(startPoint.lng, destination.lng) + 0.05;
      const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;

      // Fetch live + static restricted airspace in parallel (was sequential, ~2x faster).
      // Each fetch is bounded by a 1.5s timeout so a slow upstream can't stall the click.
      // We track failure separately from "no zones returned" so the safety-stop below still
      // fires when the live provider is genuinely unreachable AND no fallback data exists.
      const fetchWithTimeout = async (url: string, ms: number) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), ms);
        try {
          const r = await fetch(url, { signal: ctrl.signal });
          return { resp: r, failed: !r.ok };
        } catch {
          return { resp: null as Response | null, failed: true };
        } finally {
          clearTimeout(timer);
        }
      };
      const [liveResult, staticResult] = await Promise.all([
        fetchWithTimeout(`/api/airspace/restricted?bbox=${bbox}`, 1500),
        fetchWithTimeout(`/api/airspace/static-restricted?bbox=${bbox}`, 1500),
      ]);
      const liveData = liveResult.resp && liveResult.resp.ok ? await liveResult.resp.json().catch(() => null) : null;
      const liveZones = Array.isArray(liveData?.zones) ? liveData.zones : [];
      const staticData = staticResult.resp && staticResult.resp.ok ? await staticResult.resp.json().catch(() => null) : null;
      const staticZones = Array.isArray(staticData?.zones) ? staticData.zones : [];
      const effectiveZones = [...noFlyZones, ...partTimeRestrictedZones, ...staticZones, ...liveZones];

      // Safety stop: if the live restricted-airspace provider call failed and we have no
      // cached/static zones to evaluate against, abort routing rather than silently allow it.
      if (liveResult.failed && effectiveZones.length === 0) {
        toast.dismiss(pendingToastId);
        toast.error("Restricted-airspace provider unavailable. Routing aborted for safety.");
        return;
      }

      directPathCrossesRestricted = segmentIntersectsNoFlyZones(startPoint, destination, effectiveZones);
      if (directPathCrossesRestricted) {
        toast.dismiss(pendingToastId);
        toast.error("Route blocked by restricted/no-fly airspace. Enable 'Override Restrictions' to continue.");
        return;
      }
    }

    const pointsToCreate = [destination];
    const baseOrder = getNextWaypointOrder();

    for (let idx = 0; idx < pointsToCreate.length; idx++) {
      const point = pointsToCreate[idx];
      const isFinal = idx === pointsToCreate.length - 1;
      const actionParams: Record<string, any> =
        isFinal && selectedAction === "hover"
          ? { hoverTime: parseInt(hoverTime) }
          : isFinal && selectedAction === "patrol"
            ? { patrolRadius: parseInt(patrolRadius) }
            : isFinal && selectedAction === "alert"
              ? { message: "Waypoint reached" }
              : isFinal && selectedAction === "do_set_roi"
                ? { roiLat: parseFloat(roiLat), roiLng: parseFloat(roiLng) }
              : isFinal && selectedAction === "do_set_servo"
                ? { servoChannel: parseInt(servoChannel), servoPwm: parseInt(servoPwm) }
                : isFinal && selectedAction === "do_change_speed"
                  ? { speedMps: parseFloat(speedOverride) }
                  : isFinal && selectedAction === "do_set_cam_trig_dist"
                    ? { distanceM: parseFloat(camTrigDistanceM) }
                    : isFinal && selectedAction === "do_mount_control"
                      ? { pitchDeg: parseFloat(mountPitchDeg), rollDeg: parseFloat(mountRollDeg), yawDeg: parseFloat(mountYawDeg) }
                      : isFinal && selectedAction === "do_set_home"
                        ? { useCurrent: 0, homeLat: parseFloat(homeLat), homeLng: parseFloat(homeLng), homeAlt: parseFloat(homeAlt) }
                        : isFinal && selectedAction === "do_jump"
                          ? { targetSeq: parseInt(jumpTargetSeq), repeatCount: parseInt(jumpRepeat) }
                  : isFinal && selectedAction === "condition_delay"
                    ? { delaySec: parseInt(conditionDelaySec) }
                    : isFinal && selectedAction === "condition_yaw"
                      ? { yawDeg: parseFloat(conditionYawDeg) }
                      : isFinal && selectedAction === "condition_distance"
                        ? { distanceM: parseFloat(conditionDistanceM) }
                        : isFinal && selectedAction === "condition_change_alt"
                          ? { rateMps: 1, targetAltM: parseFloat(conditionAltM), frame: altitudeFrame }
                          : isFinal && selectedAction === "custom_command"
                            ? {
                                command: parseInt(customCommand),
                                param1: parseFloat(customP1),
                                param2: parseFloat(customP2),
                                param3: parseFloat(customP3),
                                param4: parseFloat(customP4),
                                param5: parseFloat(customP5),
                                param6: parseFloat(customP6),
                                param7: parseFloat(customP7),
                              }
              : {
                  altitudeFrame,
                  terrainFollow,
                };

      if (isFinal) {
        actionParams.altitudeFrame = altitudeFrame;
        actionParams.terrainFollow = terrainFollow;
      }

      await createWaypointDirect({
        missionId: selectedMission,
        order: baseOrder + idx,
        latitude: point.lat,
        longitude: point.lng,
        altitude: targetAltitude,
        speed: 5,
        action: isFinal ? selectedAction : "flythrough",
        actionParams,
        address: isFinal ? address || null : null,
      });
    }

    queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });

    if (overrideNoFlyRestrictions && directPathCrossesRestricted) {
      toast.warning("Route override active: direct path enters no-fly airspace.");
      return;
    }

    toast.success("Waypoint added");
  }, [
    selectedMission,
    selectedMissionData,
    orderedWaypoints,
    coordAlt,
    noFlyZones,
    partTimeRestrictedZones,
    overrideNoFlyRestrictions,
    selectedAction,
    hoverTime,
    patrolRadius,
      servoChannel,
      servoPwm,
      speedOverride,
      conditionDelaySec,
      conditionYawDeg,
      roiLat,
      roiLng,
      camTrigDistanceM,
      mountPitchDeg,
      mountRollDeg,
      mountYawDeg,
      jumpTargetSeq,
      jumpRepeat,
      homeLat,
      homeLng,
      homeAlt,
      conditionDistanceM,
      conditionAltM,
      customCommand,
      customP1,
      customP2,
      customP3,
      customP4,
      customP5,
      customP6,
      customP7,
      altitudeFrame,
      terrainFollow,
      queryClient,
  ]);

  const searchAddress = async () => {
    if (!addressInput.trim()) {
      toast.error("Please enter an address");
      return;
    }
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(addressInput)}`
      );
      const results = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error((results as any)?.error || "Address search failed");
      }
      
      if (results.length > 0) {
        setAddressSuggestions(results);
        toast.success(`Found ${results.length} location(s)`);
      } else {
        toast.error("No locations found for that address");
        setAddressSuggestions([]);
      }
    } catch (error) {
      toast.error("Failed to search address");
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddressResult = async (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    
    if (selectedMission) {
      try {
        await createWaypointsForDestination(lat, lon, result.display_name);
      } catch {
        toast.error("Failed to add waypoint");
      }
      setAddressInput("");
      setAddressSuggestions([]);
    }
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    if (!selectedMission) {
      toast.error("Select or create a mission first");
      return;
    }
    // Auto-switch to map mode when user clicks the map (better UX)
    if (targetMethod !== "map") {
      setTargetMethod("map");
    }
    try {
      await createWaypointsForDestination(lat, lng, null);
    } catch {
      toast.error("Failed to add waypoint");
    }
  }, [selectedMission, targetMethod, createWaypointsForDestination]);

  const handleAddWaypointFromCoords = async () => {
    const lat = parseFloat(coordLat);
    const lon = parseFloat(coordLon);
    
    if (isNaN(lat) || isNaN(lon)) {
      toast.error("Please enter valid coordinates");
      return;
    }
    
    if (selectedMission) {
      try {
        await createWaypointsForDestination(lat, lon, null);
      } catch {
        toast.error("Failed to add waypoint");
      }
      setCoordLat("");
      setCoordLon("");
    }
  };

  const startEditWaypoint = (wp: Waypoint) => {
    setEditingWaypoint(wp);
    const params = wp.actionParams || {};
    setEditWaypointData({
      altitude: String(wp.altitude),
      action: wp.action || "flythrough",
      address: wp.address || "",
      hoverTime: params.hoverTime ? String(params.hoverTime) : "5",
      patrolRadius: params.patrolRadius ? String(params.patrolRadius) : "20",
      servoChannel: params.servoChannel ? String(params.servoChannel) : "9",
      servoPwm: params.servoPwm ? String(params.servoPwm) : "1700",
      speedOverride: params.speedMps ? String(params.speedMps) : "5",
      conditionDelaySec: params.delaySec ? String(params.delaySec) : "5",
      conditionYawDeg: params.yawDeg ? String(params.yawDeg) : "90",
      conditionDistanceM: params.distanceM ? String(params.distanceM) : "20",
      conditionAltM: params.targetAltM ? String(params.targetAltM) : "20",
      roiLat: params.roiLat ? String(params.roiLat) : "",
      roiLng: params.roiLng ? String(params.roiLng) : "",
      camTrigDistanceM: params.distanceM ? String(params.distanceM) : "20",
      mountPitchDeg: params.pitchDeg ? String(params.pitchDeg) : "0",
      mountRollDeg: params.rollDeg ? String(params.rollDeg) : "0",
      mountYawDeg: params.yawDeg ? String(params.yawDeg) : "0",
      jumpTargetSeq: params.targetSeq ? String(params.targetSeq) : "1",
      jumpRepeat: params.repeatCount ? String(params.repeatCount) : "1",
      homeLat: params.homeLat ? String(params.homeLat) : "",
      homeLng: params.homeLng ? String(params.homeLng) : "",
      homeAlt: params.homeAlt ? String(params.homeAlt) : "0",
      customCommand: params.command ? String(params.command) : "16",
      customP1: params.param1 ? String(params.param1) : "0",
      customP2: params.param2 ? String(params.param2) : "0",
      customP3: params.param3 ? String(params.param3) : "0",
      customP4: params.param4 ? String(params.param4) : "0",
      customP5: params.param5 ? String(params.param5) : "0",
      customP6: params.param6 ? String(params.param6) : "0",
      customP7: params.param7 ? String(params.param7) : "0",
      altitudeFrame: params.altitudeFrame || "relative",
      terrainFollow: Boolean(params.terrainFollow),
    });
  };

  const saveEditWaypoint = () => {
    if (!editingWaypoint) return;
    
    const actionParams: Record<string, any> = editWaypointData.action === 'hover' 
      ? { hoverTime: parseInt(editWaypointData.hoverTime) }
      : editWaypointData.action === 'patrol' 
        ? { patrolRadius: parseInt(editWaypointData.patrolRadius) }
        : editWaypointData.action === 'alert' 
          ? { message: 'Waypoint reached' } 
          : editWaypointData.action === 'do_set_servo'
            ? { servoChannel: parseInt(editWaypointData.servoChannel), servoPwm: parseInt(editWaypointData.servoPwm) }
            : editWaypointData.action === 'do_change_speed'
              ? { speedMps: parseFloat(editWaypointData.speedOverride) }
              : editWaypointData.action === 'do_set_roi'
                ? { roiLat: parseFloat(editWaypointData.roiLat), roiLng: parseFloat(editWaypointData.roiLng) }
              : editWaypointData.action === 'do_set_cam_trig_dist'
                ? { distanceM: parseFloat(editWaypointData.camTrigDistanceM) }
              : editWaypointData.action === 'do_mount_control'
                ? { pitchDeg: parseFloat(editWaypointData.mountPitchDeg), rollDeg: parseFloat(editWaypointData.mountRollDeg), yawDeg: parseFloat(editWaypointData.mountYawDeg) }
              : editWaypointData.action === 'do_set_home'
                ? { useCurrent: 0, homeLat: parseFloat(editWaypointData.homeLat), homeLng: parseFloat(editWaypointData.homeLng), homeAlt: parseFloat(editWaypointData.homeAlt) }
              : editWaypointData.action === 'do_jump'
                ? { targetSeq: parseInt(editWaypointData.jumpTargetSeq), repeatCount: parseInt(editWaypointData.jumpRepeat) }
              : editWaypointData.action === 'condition_delay'
                ? { delaySec: parseInt(editWaypointData.conditionDelaySec) }
                : editWaypointData.action === 'condition_yaw'
                  ? { yawDeg: parseFloat(editWaypointData.conditionYawDeg) }
                : editWaypointData.action === 'condition_distance'
                  ? { distanceM: parseFloat(editWaypointData.conditionDistanceM) }
                : editWaypointData.action === 'condition_change_alt'
                  ? { rateMps: 1, targetAltM: parseFloat(editWaypointData.conditionAltM), frame: editWaypointData.altitudeFrame }
                : editWaypointData.action === 'custom_command'
                  ? {
                      command: parseInt(editWaypointData.customCommand),
                      param1: parseFloat(editWaypointData.customP1),
                      param2: parseFloat(editWaypointData.customP2),
                      param3: parseFloat(editWaypointData.customP3),
                      param4: parseFloat(editWaypointData.customP4),
                      param5: parseFloat(editWaypointData.customP5),
                      param6: parseFloat(editWaypointData.customP6),
                      param7: parseFloat(editWaypointData.customP7),
                    }
          : {};
    actionParams.altitudeFrame = editWaypointData.altitudeFrame;
    actionParams.terrainFollow = editWaypointData.terrainFollow;
    
    updateWaypoint.mutate(
      {
        id: editingWaypoint.id,
        data: {
          altitude: parseFloat(editWaypointData.altitude) || editingWaypoint.altitude,
          action: editWaypointData.action,
          address: editWaypointData.address || null,
          actionParams
        }
      },
      {
        onSuccess: () => {
          setEditingWaypoint(null);
          toast.success("Waypoint updated");
        },
        onError: () => {
          toast.error("Failed to update waypoint");
        }
      }
    );
  };

  const cancelEditWaypoint = () => {
    setEditingWaypoint(null);
  };

  const executeMission = async () => {
    if (!selectedMissionData || waypoints.length === 0) {
      toast.error("No waypoints to execute");
      return;
    }

    setIsExecuting(true);
    try {
      const data = await missionsApi.execute(selectedMissionData.id, {
        connectionString: fcConnectionString,
        armBeforeStart: false,
        routePolicy: {
          overrideNoFlyRestrictions,
        },
      });
      if (!data?.success || !data?.run?.id) {
        throw new Error(data?.run?.error || "Mission execution failed");
      }
      setActiveRunId(data.run.id);
      toast.success(`Executing mission: ${selectedMissionData.name}`, {
        description: `${waypoints.length} waypoints uploaded and AUTO mode acknowledged.`,
      });
    } catch (error) {
      setIsExecuting(false);
      setActiveRunId(null);
      reportApiError(error, "Mission execution failed");
    }
  };

  const stopMission = async () => {
    if (!activeRunId) {
      toast.error("No active mission run to stop");
      return;
    }
    try {
      const data = await missionsApi.stopRun(activeRunId);
      if (!data?.success) throw new Error("Failed to stop mission");
      setIsExecuting(false);
      setActiveRunId(null);
      toast.info("Mission stop acknowledged");
    } catch (error) {
      reportApiError(error, "Failed to stop mission");
    }
  };

  useEffect(() => {
    if (!activeRunId) return;
    let pollFailures = 0;
    const timer = window.setInterval(async () => {
      try {
        const data = await missionsApi.getRun(activeRunId);
        if (!data?.run) {
          pollFailures += 1;
          if (pollFailures >= 3) {
            toast.error("Mission status polling failed repeatedly");
          }
          if (pollFailures >= 6) {
            setIsExecuting(false);
            setActiveRunId(null);
            toast.error("Mission monitoring lost after repeated failures. Check mission state and reconnect.");
          }
          return;
        }
        pollFailures = 0;
        const status = String(data.run.status || "");
        if (status === "failed" || status === "stopped" || status === "completed") {
          setIsExecuting(false);
          setActiveRunId(null);
          if (status === "failed") {
            toast.error(data.run.error || "Mission execution failed");
          } else if (status === "completed") {
            toast.success("Mission completed");
          } else {
            toast.info("Mission stopped");
          }
        }
      } catch {
        pollFailures += 1;
        if (pollFailures >= 3) {
          toast.error("Mission status polling failed repeatedly");
        }
        if (pollFailures >= 6) {
          setIsExecuting(false);
          setActiveRunId(null);
          toast.error("Mission monitoring lost after repeated failures. Check mission state and reconnect.");
        }
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeRunId]);

  const handleSaveMission = () => {
    if (!selectedMissionData) {
      toast.error("No mission selected");
      return;
    }
    saveMission.mutate(selectedMissionData);
  };

  const uploadMissionToFc = async () => {
    if (!selectedMission || !waypoints.length) {
      toast.error("No mission waypoints to upload");
      return;
    }
    setSyncBusy(true);
    try {
      const payload = {
        connectionString: fcConnectionString,
        waypoints: orderedWaypoints.map((wp) => ({
          order: wp.order,
          lat: wp.latitude,
          lng: wp.longitude,
          altitude: wp.altitude,
          action: wp.action || "flythrough",
          actionParams: wp.actionParams || {},
        })),
      };
      const res = await fetch("/api/mavlink/mission/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Mission upload failed");
      toast.success(`Mission uploaded to FC (${data.uploadedItems || 0} items)`);
    } catch (e) {
      reportApiError(e, "Mission upload failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const downloadMissionFromFc = async () => {
    if (!selectedMission) {
      toast.error("Select a mission first");
      return;
    }
    setSyncBusy(true);
    try {
      const res = await fetch(`/api/mavlink/mission/download?connectionString=${encodeURIComponent(fcConnectionString)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Mission download failed");
      const list = Array.isArray(data.waypoints) ? data.waypoints : [];
      if (!list.length) {
        toast.error("No waypoints found on FC");
        return;
      }

      // Replace local mission waypoints with downloaded sequence
      for (const wp of orderedWaypoints) {
        await fetch(`/api/waypoints/${wp.id}`, { method: "DELETE" });
      }
      for (let i = 0; i < list.length; i++) {
        const wp = list[i];
        await fetch("/api/waypoints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            missionId: selectedMission,
            order: i + 1,
            latitude: Number(wp.lat),
            longitude: Number(wp.lng),
            altitude: Number(wp.altitude || 50),
            speed: 5,
            action: String(wp.action || "flythrough"),
            actionParams: wp.actionParams || {},
            address: null,
          }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/missions", selectedMission, "waypoints"] });
      toast.success(`Downloaded ${list.length} waypoints from FC`);
    } catch (e: any) {
      reportApiError(e, "Mission download failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const uploadRallyFromHome = async () => {
    if (!selectedMissionData) {
      toast.error("Select a mission first");
      return;
    }
    setSyncBusy(true);
    try {
      const points = [
        {
          lat: selectedMissionData.homeLatitude,
          lng: selectedMissionData.homeLongitude,
          altitude: Math.max(20, Number(selectedMissionData.homeAltitude || 50)),
          breakAlt: Math.max(20, Number(selectedMissionData.homeAltitude || 50)),
          flags: 0,
        },
      ];
      const res = await fetch("/api/mavlink/rally/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionString: fcConnectionString, points }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Rally upload failed");
      toast.success(`Uploaded ${data.uploadedRallyPoints || 0} rally point(s)`);
    } catch (e: any) {
      reportApiError(e, "Rally upload failed");
    } finally {
      setSyncBusy(false);
    }
  };

  const downloadRallyToMissionHome = async () => {
    if (!selectedMissionData) {
      toast.error("Select a mission first");
      return;
    }
    setSyncBusy(true);
    try {
      const res = await fetch(`/api/mavlink/rally/download?connectionString=${encodeURIComponent(fcConnectionString)}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Rally download failed");
      const points = Array.isArray(data.points) ? data.points : [];
      if (!points.length) {
        toast.error("No rally points on FC");
        return;
      }
      const first = points[0];
      saveMission.mutate({
        ...selectedMissionData,
        homeLatitude: Number(first.lat),
        homeLongitude: Number(first.lng),
        homeAltitude: Number(first.altitude || selectedMissionData.homeAltitude || 0),
      });
      toast.success("Mission home updated from FC rally point");
    } catch (e: any) {
      reportApiError(e, "Rally download failed");
    } finally {
      setSyncBusy(false);
    }
  };

  // Show permission denied if user doesn't have access
  if (!canPlanMissions) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="flex flex-col items-center gap-4 text-muted-foreground py-12">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access mission planning.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex">
      {/* Mission List Sidebar */}
      <div className="w-72 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <h3 className="font-bold font-sans text-sm mb-2">Flight Missions</h3>
          <Button className="w-full" size="sm" onClick={() => {
            // Use current location or default to Burlington, NC
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  createMission.mutate({
                    name: `Mission ${missions.length + 1}`,
                    description: "New mission",
                    homeLatitude: pos.coords.latitude,
                    homeLongitude: pos.coords.longitude,
                    homeAltitude: 0,
                  });
                },
                () => {
                  createMission.mutate({
                    name: `Mission ${missions.length + 1}`,
                    description: "New mission",
                    homeLatitude: 36.0957,
                    homeLongitude: -79.4378,
                    homeAltitude: 0,
                  });
                }
              );
            } else {
              createMission.mutate({
                name: `Mission ${missions.length + 1}`,
                description: "New mission",
                homeLatitude: 36.0957,
                homeLongitude: -79.4378,
                homeAltitude: 0,
              });
            }
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Mission
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className={`p-2 rounded cursor-pointer transition-colors border ${
                  selectedMission === mission.id 
                    ? "border-primary bg-primary/10" 
                    : "border-transparent hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedMission(mission.id);
                  // Notify MapInterface of mission selection
                  window.dispatchEvent(new CustomEvent('mission-selected', { detail: { missionId: mission.id } }));
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono truncate">{mission.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{mission.description}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMissionToDelete(mission);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMission ? (
          <>
            {/* Header */}
            <div className="p-3 border-b border-border bg-card/80 backdrop-blur shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold font-sans">{selectedMissionData?.name}</h2>
                  <p className="text-xs text-muted-foreground">{waypoints.length} waypoints</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveMission}
                    disabled={saveMission.isPending}
                    data-testid="button-save-mission"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {saveMission.isPending ? "Saving..." : "Save"}
                  </Button>
                  {isExecuting ? (
                    <Button 
                      size="sm" 
                      variant="destructive" 
                      onClick={stopMission}
                      data-testid="button-stop-mission"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Stop
                    </Button>
                  ) : (
                    <Button 
                      size="sm" 
                      onClick={executeMission}
                      disabled={waypoints.length === 0}
                      data-testid="button-execute-mission"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Execute
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <FcConnectionBadge />
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={syncBusy} onClick={downloadMissionFromFc}>
                  Download Mission
                </Button>
                <Button size="sm" className="h-8 text-xs" disabled={syncBusy} onClick={uploadMissionToFc}>
                  Upload Mission
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={syncBusy} onClick={downloadRallyToMissionHome}>
                  Rally -&gt; Home
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={syncBusy} onClick={uploadRallyFromHome}>
                  Home -&gt; Rally
                </Button>
              </div>
            </div>

            {/* Map and Controls */}
            <div className="flex-1 flex overflow-hidden">
              {/* Map Section */}
              <div className="flex-1 relative">
                <MissionMap
                  waypoints={orderedWaypoints}
                  homePosition={selectedMissionData ? [selectedMissionData.homeLatitude, selectedMissionData.homeLongitude] : undefined}
                  onMapClick={handleMapClick}
                  clickEnabled={true}
                  showClickHint={targetMethod === "map"}
                />
              </div>

              {/* Right Panel - Waypoint Controls */}
              <div className="w-80 border-l border-border bg-card/50 flex flex-col overflow-y-auto overflow-x-hidden">
                <div className="p-3 border-b border-border shrink-0">
                  <h4 className="font-bold text-sm mb-2">Add Waypoint</h4>
                  
                  <Tabs value={targetMethod} onValueChange={(v) => setTargetMethod(v as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-8">
                      <TabsTrigger value="map" className="text-xs">Map</TabsTrigger>
                      <TabsTrigger value="address" className="text-xs">Address</TabsTrigger>
                      <TabsTrigger value="coordinates" className="text-xs">Coords</TabsTrigger>
                    </TabsList>

                    <TabsContent value="address" className="mt-2 space-y-2">
                      <div className="flex gap-1">
                        <Input
                          placeholder="Enter address..."
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          className="flex-1 h-8 text-xs"
                          onKeyDown={(e) => e.key === 'Enter' && searchAddress()}
                        />
                        <Button size="sm" className="h-8" onClick={searchAddress} disabled={isSearching}>
                          <Search className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {addressSuggestions.length > 0 && (
                        <div className="bg-muted rounded border border-border max-h-32 overflow-y-auto">
                          {addressSuggestions.map((result, idx) => (
                            <div
                              key={idx}
                              className="p-2 hover:bg-primary/10 cursor-pointer text-xs border-b border-border last:border-0"
                              onClick={() => selectAddressResult(result)}
                            >
                              <div className="truncate">{result.display_name}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="coordinates" className="mt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Latitude"
                          value={coordLat}
                          onChange={(e) => setCoordLat(e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="Longitude"
                          value={coordLon}
                          onChange={(e) => setCoordLon(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button className="w-full h-8 text-xs" onClick={handleAddWaypointFromCoords}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add Waypoint
                      </Button>
                    </TabsContent>

                    <TabsContent value="map" className="mt-2">
                      <p className="text-xs text-muted-foreground text-center py-2">
                        Click anywhere on the map to add a waypoint
                      </p>
                    </TabsContent>
                  </Tabs>

                  <Separator className="my-3" />

                  <div className="space-y-2 rounded-md border border-border p-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Override No-Fly Zone</Label>
                      <Switch
                        checked={overrideNoFlyRestrictions}
                        onCheckedChange={setOverrideNoFlyRestrictions}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Destination planning blocks restricted/no-fly routes by default. Enable override to allow direct routing through restricted airspace.
                    </p>
                    {partTimeRestrictedZones.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Part-time restrictions active now: {partTimeRestrictedZones.length}
                      </Badge>
                    )}
                    {overrideNoFlyRestrictions && (
                      <Badge variant="destructive" className="text-[10px]">
                        Override active: route may pass through no-fly zones
                      </Badge>
                    )}
                  </div>

                  <Separator className="my-3" />

                  {/* Waypoint Settings */}
                  <div className="space-y-2">
                    <Label className="text-xs">Altitude (m)</Label>
                    <Input
                      type="number"
                      value={coordAlt}
                      onChange={(e) => setCoordAlt(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="space-y-2">
                      <Label className="text-xs">Altitude Frame</Label>
                      <Select value={altitudeFrame} onValueChange={(v: "relative" | "terrain" | "amsl") => setAltitudeFrame(v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relative">Relative (AGL)</SelectItem>
                          <SelectItem value="terrain">Terrain Follow</SelectItem>
                          <SelectItem value="amsl">AMSL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-between rounded-md border border-border p-2">
                      <Label className="text-xs">Terrain Follow</Label>
                      <Switch checked={terrainFollow} onCheckedChange={setTerrainFollow} />
                    </div>
                  </div>

                  <div className="space-y-2 mt-2">
                    <Label className="text-xs">Action at Waypoint</Label>
                    <Select value={selectedAction} onValueChange={setSelectedAction}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WAYPOINT_ACTIONS.map(action => (
                          <SelectItem key={action.value} value={action.value}>
                            <span className="flex items-center gap-2">
                              <action.icon className="h-3 w-3" />
                              {action.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedAction === 'hover' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Hover Time (seconds)</Label>
                      <Input
                        type="number"
                        value={hoverTime}
                        onChange={(e) => setHoverTime(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'patrol' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Patrol Radius (m)</Label>
                      <Input
                        type="number"
                        value={patrolRadius}
                        onChange={(e) => setPatrolRadius(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'do_set_servo' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Servo Channel</Label>
                        <Input
                          type="number"
                          value={servoChannel}
                          onChange={(e) => setServoChannel(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">PWM</Label>
                        <Input
                          type="number"
                          value={servoPwm}
                          onChange={(e) => setServoPwm(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {selectedAction === 'do_change_speed' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Speed Override (m/s)</Label>
                      <Input
                        type="number"
                        value={speedOverride}
                        onChange={(e) => setSpeedOverride(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'do_set_cam_trig_dist' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Trigger Distance (m)</Label>
                      <Input value={camTrigDistanceM} onChange={(e) => setCamTrigDistanceM(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  {selectedAction === 'do_mount_control' && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <Input placeholder="Pitch" value={mountPitchDeg} onChange={(e) => setMountPitchDeg(e.target.value)} className="h-8 text-xs" />
                      <Input placeholder="Roll" value={mountRollDeg} onChange={(e) => setMountRollDeg(e.target.value)} className="h-8 text-xs" />
                      <Input placeholder="Yaw" value={mountYawDeg} onChange={(e) => setMountYawDeg(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  {selectedAction === 'do_set_home' && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <Input placeholder="Home Lat" value={homeLat} onChange={(e) => setHomeLat(e.target.value)} className="h-8 text-xs" />
                      <Input placeholder="Home Lng" value={homeLng} onChange={(e) => setHomeLng(e.target.value)} className="h-8 text-xs" />
                      <Input placeholder="Home Alt" value={homeAlt} onChange={(e) => setHomeAlt(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  {selectedAction === 'do_jump' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Input placeholder="Target Seq" value={jumpTargetSeq} onChange={(e) => setJumpTargetSeq(e.target.value)} className="h-8 text-xs" />
                      <Input placeholder="Repeat Count" value={jumpRepeat} onChange={(e) => setJumpRepeat(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  {selectedAction === 'do_set_roi' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Input
                        placeholder="ROI Lat"
                        value={roiLat}
                        onChange={(e) => setRoiLat(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="ROI Lng"
                        value={roiLng}
                        onChange={(e) => setRoiLng(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'condition_delay' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Delay (seconds)</Label>
                      <Input
                        type="number"
                        value={conditionDelaySec}
                        onChange={(e) => setConditionDelaySec(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'condition_yaw' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Yaw (deg)</Label>
                      <Input
                        type="number"
                        value={conditionYawDeg}
                        onChange={(e) => setConditionYawDeg(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}

                  {selectedAction === 'condition_distance' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Distance (m)</Label>
                      <Input value={conditionDistanceM} onChange={(e) => setConditionDistanceM(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  {selectedAction === 'condition_change_alt' && (
                    <div className="space-y-2 mt-2">
                      <Label className="text-xs">Target Altitude (m)</Label>
                      <Input value={conditionAltM} onChange={(e) => setConditionAltM(e.target.value)} className="h-8 text-xs" />
                    </div>
                  )}

                  {selectedAction === 'custom_command' && (
                    <div className="space-y-2 mt-2">
                      <Input placeholder="MAV_CMD id" value={customCommand} onChange={(e) => setCustomCommand(e.target.value)} className="h-8 text-xs" />
                      <div className="grid grid-cols-4 gap-2">
                        <Input placeholder="p1" value={customP1} onChange={(e) => setCustomP1(e.target.value)} className="h-8 text-xs" />
                        <Input placeholder="p2" value={customP2} onChange={(e) => setCustomP2(e.target.value)} className="h-8 text-xs" />
                        <Input placeholder="p3" value={customP3} onChange={(e) => setCustomP3(e.target.value)} className="h-8 text-xs" />
                        <Input placeholder="p4" value={customP4} onChange={(e) => setCustomP4(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Input placeholder="p5" value={customP5} onChange={(e) => setCustomP5(e.target.value)} className="h-8 text-xs" />
                        <Input placeholder="p6" value={customP6} onChange={(e) => setCustomP6(e.target.value)} className="h-8 text-xs" />
                        <Input placeholder="p7" value={customP7} onChange={(e) => setCustomP7(e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                  )}

                  <Separator className="my-3" />

                  <div className="space-y-2 rounded-md border border-border p-2">
                    <Label className="text-xs">Advanced Mission Generator</Label>
                    <Select value={generatorType} onValueChange={(v: "survey" | "grid" | "corridor") => setGeneratorType(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="survey">Survey (Lawnmower)</SelectItem>
                        <SelectItem value="grid">Grid (Crosshatch)</SelectItem>
                        <SelectItem value="corridor">Corridor</SelectItem>
                      </SelectContent>
                    </Select>
                    {generatorType !== "corridor" ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Width m" value={generatorWidth} onChange={(e) => setGeneratorWidth(e.target.value)} className="h-8 text-xs" />
                          <Input placeholder="Height m" value={generatorHeight} onChange={(e) => setGeneratorHeight(e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Lane spacing m" value={generatorLaneSpacing} onChange={(e) => setGeneratorLaneSpacing(e.target.value)} className="h-8 text-xs" />
                          <Input placeholder="Heading deg" value={generatorHeading} onChange={(e) => setGeneratorHeading(e.target.value)} className="h-8 text-xs" />
                        </div>
                      </>
                    ) : (
                      <Input placeholder="Corridor width m" value={corridorWidth} onChange={(e) => setCorridorWidth(e.target.value)} className="h-8 text-xs" />
                    )}
                    <Button size="sm" className="w-full h-8 text-xs" onClick={() => void generatePatternWaypoints()}>
                      Generate {generatorType}
                    </Button>
                  </div>

                  <div className="space-y-2 rounded-md border border-border p-2">
                    <Label className="text-xs">Mission Editing Utilities</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void addRtlAtEnd()} disabled={missionUtilityBusy}>
                        Insert RTL End
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void reverseWaypointOrder()} disabled={missionUtilityBusy}>
                        Reverse Order
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input value={utilityAltDelta} onChange={(e) => setUtilityAltDelta(e.target.value)} className="h-8 text-xs" placeholder="+/- altitude m" />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void offsetMissionAltitude()} disabled={missionUtilityBusy}>
                        Apply Alt Delta
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void setFrameForAll(terrainFollow ? "terrain" : altitudeFrame)} disabled={missionUtilityBusy}>
                        Frame to All
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Quick map/planner utilities for mission restructuring similar to right-click mission tools.
                    </p>
                  </div>
                </div>

                {/* Waypoint List */}
                <div className="flex-1">
                  <div className="p-2 space-y-2">
                    <h4 className="font-bold text-xs text-muted-foreground uppercase px-1">Waypoints</h4>
                    
                    {orderedWaypoints.map((wp, idx) => {
                      const actionInfo = WAYPOINT_ACTIONS.find(a => a.value === wp.action) || WAYPOINT_ACTIONS[0];
                      const isEditing = editingWaypoint?.id === wp.id;
                      
                      return (
                        <Card key={wp.id} className={`border-l-4 ${isEditing ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-primary'}`}>
                          <CardContent className="p-2">
                            {isEditing ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white font-bold text-xs shrink-0">
                                    {idx + 1}
                                  </div>
                                  <span className="text-xs font-bold">Editing Waypoint</span>
                                </div>
                                
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Address/Name</Label>
                                  <Input
                                    value={editWaypointData.address}
                                    onChange={(e) => setEditWaypointData(prev => ({ ...prev, address: e.target.value }))}
                                    placeholder="Optional address label"
                                    className="h-7 text-xs"
                                    data-testid="input-edit-waypoint-address"
                                  />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Altitude (m)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.altitude}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, altitude: e.target.value }))}
                                      className="h-7 text-xs"
                                      data-testid="input-edit-waypoint-altitude"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Action</Label>
                                    <Select 
                                      value={editWaypointData.action} 
                                      onValueChange={(v) => setEditWaypointData(prev => ({ ...prev, action: v }))}
                                    >
                                      <SelectTrigger className="h-7 text-xs" data-testid="select-edit-waypoint-action">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {WAYPOINT_ACTIONS.map(action => (
                                          <SelectItem key={action.value} value={action.value}>
                                            <span className="flex items-center gap-1">
                                              <action.icon className="h-3 w-3" />
                                              {action.label}
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Altitude Frame</Label>
                                    <Select
                                      value={editWaypointData.altitudeFrame}
                                      onValueChange={(v) => setEditWaypointData(prev => ({ ...prev, altitudeFrame: v }))}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="relative">Relative</SelectItem>
                                        <SelectItem value="terrain">Terrain</SelectItem>
                                        <SelectItem value="amsl">AMSL</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-end justify-between rounded border border-border px-2 py-1">
                                    <Label className="text-[10px]">Terrain Follow</Label>
                                    <Switch
                                      checked={editWaypointData.terrainFollow}
                                      onCheckedChange={(v) => setEditWaypointData(prev => ({ ...prev, terrainFollow: v }))}
                                    />
                                  </div>
                                </div>
                                
                                {editWaypointData.action === 'hover' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Hover Time (sec)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.hoverTime}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, hoverTime: e.target.value }))}
                                      className="h-7 text-xs"
                                      data-testid="input-edit-hover-time"
                                    />
                                  </div>
                                )}
                                
                                {editWaypointData.action === 'patrol' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Patrol Radius (m)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.patrolRadius}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, patrolRadius: e.target.value }))}
                                      className="h-7 text-xs"
                                      data-testid="input-edit-patrol-radius"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'do_set_servo' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <Label className="text-[10px]">Servo Channel</Label>
                                      <Input
                                        type="number"
                                        value={editWaypointData.servoChannel}
                                        onChange={(e) => setEditWaypointData(prev => ({ ...prev, servoChannel: e.target.value }))}
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[10px]">PWM</Label>
                                      <Input
                                        type="number"
                                        value={editWaypointData.servoPwm}
                                        onChange={(e) => setEditWaypointData(prev => ({ ...prev, servoPwm: e.target.value }))}
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                  </div>
                                )}

                                {editWaypointData.action === 'do_change_speed' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Speed Override (m/s)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.speedOverride}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, speedOverride: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'do_set_roi' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input
                                      value={editWaypointData.roiLat}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, roiLat: e.target.value }))}
                                      placeholder="ROI Lat"
                                      className="h-7 text-xs"
                                    />
                                    <Input
                                      value={editWaypointData.roiLng}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, roiLng: e.target.value }))}
                                      placeholder="ROI Lng"
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'do_set_cam_trig_dist' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Trigger Distance (m)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.camTrigDistanceM}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, camTrigDistanceM: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'do_mount_control' && (
                                  <div className="grid grid-cols-3 gap-2">
                                    <Input value={editWaypointData.mountPitchDeg} onChange={(e) => setEditWaypointData(prev => ({ ...prev, mountPitchDeg: e.target.value }))} placeholder="Pitch" className="h-7 text-xs" />
                                    <Input value={editWaypointData.mountRollDeg} onChange={(e) => setEditWaypointData(prev => ({ ...prev, mountRollDeg: e.target.value }))} placeholder="Roll" className="h-7 text-xs" />
                                    <Input value={editWaypointData.mountYawDeg} onChange={(e) => setEditWaypointData(prev => ({ ...prev, mountYawDeg: e.target.value }))} placeholder="Yaw" className="h-7 text-xs" />
                                  </div>
                                )}

                                {editWaypointData.action === 'do_set_home' && (
                                  <div className="grid grid-cols-3 gap-2">
                                    <Input value={editWaypointData.homeLat} onChange={(e) => setEditWaypointData(prev => ({ ...prev, homeLat: e.target.value }))} placeholder="Home Lat" className="h-7 text-xs" />
                                    <Input value={editWaypointData.homeLng} onChange={(e) => setEditWaypointData(prev => ({ ...prev, homeLng: e.target.value }))} placeholder="Home Lng" className="h-7 text-xs" />
                                    <Input value={editWaypointData.homeAlt} onChange={(e) => setEditWaypointData(prev => ({ ...prev, homeAlt: e.target.value }))} placeholder="Home Alt" className="h-7 text-xs" />
                                  </div>
                                )}

                                {editWaypointData.action === 'do_jump' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Input value={editWaypointData.jumpTargetSeq} onChange={(e) => setEditWaypointData(prev => ({ ...prev, jumpTargetSeq: e.target.value }))} placeholder="Target Seq" className="h-7 text-xs" />
                                    <Input value={editWaypointData.jumpRepeat} onChange={(e) => setEditWaypointData(prev => ({ ...prev, jumpRepeat: e.target.value }))} placeholder="Repeat" className="h-7 text-xs" />
                                  </div>
                                )}

                                {editWaypointData.action === 'condition_delay' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Delay (sec)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.conditionDelaySec}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, conditionDelaySec: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'condition_yaw' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Yaw (deg)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.conditionYawDeg}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, conditionYawDeg: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'condition_distance' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Distance (m)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.conditionDistanceM}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, conditionDistanceM: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'condition_change_alt' && (
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Target Altitude (m)</Label>
                                    <Input
                                      type="number"
                                      value={editWaypointData.conditionAltM}
                                      onChange={(e) => setEditWaypointData(prev => ({ ...prev, conditionAltM: e.target.value }))}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                )}

                                {editWaypointData.action === 'custom_command' && (
                                  <div className="space-y-1">
                                    <Input value={editWaypointData.customCommand} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customCommand: e.target.value }))} placeholder="MAV_CMD" className="h-7 text-xs" />
                                    <div className="grid grid-cols-4 gap-2">
                                      <Input value={editWaypointData.customP1} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP1: e.target.value }))} placeholder="p1" className="h-7 text-xs" />
                                      <Input value={editWaypointData.customP2} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP2: e.target.value }))} placeholder="p2" className="h-7 text-xs" />
                                      <Input value={editWaypointData.customP3} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP3: e.target.value }))} placeholder="p3" className="h-7 text-xs" />
                                      <Input value={editWaypointData.customP4} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP4: e.target.value }))} placeholder="p4" className="h-7 text-xs" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <Input value={editWaypointData.customP5} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP5: e.target.value }))} placeholder="p5" className="h-7 text-xs" />
                                      <Input value={editWaypointData.customP6} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP6: e.target.value }))} placeholder="p6" className="h-7 text-xs" />
                                      <Input value={editWaypointData.customP7} onChange={(e) => setEditWaypointData(prev => ({ ...prev, customP7: e.target.value }))} placeholder="p7" className="h-7 text-xs" />
                                    </div>
                                  </div>
                                )}
                                
                                <div className="flex gap-1 pt-1">
                                  <Button 
                                    size="sm" 
                                    className="flex-1 h-7 text-xs" 
                                    onClick={saveEditWaypoint}
                                    data-testid="button-save-waypoint"
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    Save
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-xs" 
                                    onClick={cancelEditWaypoint}
                                    data-testid="button-cancel-edit-waypoint"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground font-bold text-xs shrink-0">
                                  {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="text-xs font-mono">
                                    {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                                  </div>
                                  {wp.address && (
                                    <div className="text-[10px] text-muted-foreground truncate">
                                      {wp.address}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="text-[10px] h-4">
                                      <actionInfo.icon className="h-2 w-2 mr-1" />
                                      {actionInfo.label}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">{wp.altitude}m</span>
                                    {wp.actionParams?.altitudeFrame && (
                                      <Badge variant="secondary" className="text-[10px] h-4">
                                        {String(wp.actionParams.altitudeFrame).toUpperCase()}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6"
                                    onClick={() => startEditWaypoint(wp)}
                                    data-testid={`button-edit-waypoint-${wp.id}`}
                                  >
                                    <Edit className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6"
                                    onClick={() => deleteWaypoint.mutate(wp.id)}
                                    data-testid={`button-delete-waypoint-${wp.id}`}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}

                    {waypoints.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">No waypoints yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Navigation className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Select a mission or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Mission
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{missionToDelete?.name}"? This will permanently remove all waypoints.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => missionToDelete && deleteMission.mutate(missionToDelete.id)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
