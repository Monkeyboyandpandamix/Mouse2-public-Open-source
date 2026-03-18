import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Drone } from "@shared/schema";
import {
  clearStoredSelectedDrone,
  clearStoredSession,
  readStoredSelectedDrone,
  readStoredSession,
  type ClientSession,
  writeStoredSelectedDrone,
  writeStoredSession,
} from "@/lib/clientState";

interface AppStateContextValue {
  session: ClientSession;
  isLoggedIn: boolean;
  selectedDrone: Drone | null;
  setSession: (session: ClientSession) => void;
  clearSession: () => void;
  selectDrone: (drone: Drone | null) => void;
  refreshSelectedDrone: (droneId: string) => Promise<Drone | null>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<ClientSession>(() => readStoredSession());
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(() => readStoredSelectedDrone<Drone>());

  const setSession = (nextSession: ClientSession) => {
    setSessionState(nextSession);
    writeStoredSession(nextSession);
  };

  const clearSession = () => {
    setSessionState({ user: null, isLoggedIn: false });
    clearStoredSession();
    setSelectedDrone(null);
    clearStoredSelectedDrone();
  };

  const selectDrone = (drone: Drone | null) => {
    setSelectedDrone(drone);
    if (drone) {
      writeStoredSelectedDrone(drone);
    } else {
      clearStoredSelectedDrone();
    }
  };

  const refreshSelectedDrone = async (droneId: string) => {
    const normalizedId = String(droneId || "").trim();
    if (!normalizedId) return null;
    const response = await fetch(`/api/drones/${encodeURIComponent(normalizedId)}`);
    if (!response.ok) {
      if (response.status === 404) {
        selectDrone(null);
        return null;
      }
      throw new Error(`Failed to refresh drone (${response.status})`);
    }
    const drone = (await response.json()) as Drone;
    selectDrone(drone);
    return drone;
  };

  useEffect(() => {
    const handleSessionChange = (event: Event) => {
      const detail = (event as CustomEvent<ClientSession>).detail;
      if (detail && typeof detail === "object") {
        setSessionState({
          user: detail.user ?? null,
          isLoggedIn: detail.isLoggedIn === true,
        });
      }
    };

    const handleDroneChange = (event: Event) => {
      const detail = (event as CustomEvent<Drone | null>).detail;
      setSelectedDrone(detail ?? null);
    };

    window.addEventListener("session-change", handleSessionChange);
    window.addEventListener("drone-selected", handleDroneChange);
    return () => {
      window.removeEventListener("session-change", handleSessionChange);
      window.removeEventListener("drone-selected", handleDroneChange);
    };
  }, []);

  const value = useMemo<AppStateContextValue>(() => ({
    session,
    isLoggedIn: session.isLoggedIn,
    selectedDrone,
    setSession,
    clearSession,
    selectDrone,
    refreshSelectedDrone,
  }), [selectedDrone, session]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}
