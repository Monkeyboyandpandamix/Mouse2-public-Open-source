import { useEffect, useState } from "react";
import type { NoFlyZone } from "@/lib/noFlyZones";

export function useNoFlyZones() {
  const [localZones, setLocalZones] = useState<NoFlyZone[]>([]);
  const [liveZones, setLiveZones] = useState<NoFlyZone[]>([]);

  useEffect(() => {
    const load = () => {
      const saved = localStorage.getItem("mouse_geofence_zones");
      if (!saved) {
        setLocalZones([]);
        return;
      }
      try {
        const parsed = JSON.parse(saved);
        setLocalZones(Array.isArray(parsed) ? parsed : []);
      } catch {
        setLocalZones([]);
      }
    };

    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mouse_geofence_zones") load();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("geofence-updated", load as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("geofence-updated", load as EventListener);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchLiveZones = async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/airspace/restricted?lat=${lat}&lng=${lng}&radiusMeters=35000`);
        if (!res.ok) {
          if (active) setLiveZones([]);
          return;
        }
        const data = await res.json();
        if (!active) return;
        if (data?.configured === false) {
          setLiveZones([]);
          return;
        }
        setLiveZones(Array.isArray(data?.zones) ? data.zones : []);
      } catch {
        if (active) setLiveZones([]);
      }
    };

    const update = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void fetchLiveZones(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          void fetchLiveZones(36.0957, -79.4378);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 },
      );
    };

    update();
    const interval = setInterval(update, 180000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return [...localZones, ...liveZones].filter((zone) => zone?.enabled);
}
