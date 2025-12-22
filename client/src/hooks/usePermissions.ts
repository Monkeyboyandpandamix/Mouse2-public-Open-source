import { useState, useEffect, useCallback } from "react";

interface RolePermissions {
  [role: string]: string[];
}

interface User {
  id: string;
  username: string;
  fullName: string;
  role: string;
  enabled: boolean;
}

interface Session {
  user: User | null;
  isLoggedIn: boolean;
}

const defaultRolePermissions: RolePermissions = {
  admin: [
    "arm_disarm", "flight_control", "mission_planning", "camera_control",
    "view_telemetry", "view_map", "view_camera", "user_management",
    "system_settings", "delete_records", "delete_flight_data",
    "automation_scripts", "emergency_override", "object_tracking", "broadcast_audio",
    "manage_geofences", "access_flight_recorder", "run_terminal", "configure_gui_advanced"
  ],
  operator: [
    "arm_disarm", "flight_control", "mission_planning", "camera_control",
    "view_telemetry", "view_map", "view_camera", "automation_scripts",
    "object_tracking", "broadcast_audio", "manage_geofences", "access_flight_recorder"
  ],
  viewer: ["view_telemetry", "view_map", "view_camera"]
};

export function usePermissions() {
  const [session, setSession] = useState<Session>(() => {
    const saved = localStorage.getItem('mouse_gcs_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { user: null, isLoggedIn: false };
      }
    }
    return { user: null, isLoggedIn: false };
  });

  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(() => {
    const saved = localStorage.getItem('mouse_gcs_role_permissions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return defaultRolePermissions;
      }
    }
    return defaultRolePermissions;
  });

  useEffect(() => {
    const handleSessionChange = (e: CustomEvent<Session>) => {
      setSession(e.detail);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mouse_gcs_session' && e.newValue) {
        try {
          setSession(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === 'mouse_gcs_role_permissions' && e.newValue) {
        try {
          setRolePermissions(JSON.parse(e.newValue));
        } catch {}
      }
    };

    const handleLocalSessionChange = () => {
      const saved = localStorage.getItem('mouse_gcs_session');
      if (saved) {
        try {
          setSession(JSON.parse(saved));
        } catch {}
      }
    };

    window.addEventListener('session-change', handleSessionChange as EventListener);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('session-updated', handleLocalSessionChange);
    
    return () => {
      window.removeEventListener('session-change', handleSessionChange as EventListener);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('session-updated', handleLocalSessionChange);
    };
  }, []);

  const hasPermission = useCallback((permissionId: string): boolean => {
    if (!session.isLoggedIn || !session.user) {
      return false;
    }

    const userRole = session.user.role;
    const permissions = rolePermissions[userRole] || [];
    
    return permissions.includes(permissionId);
  }, [session, rolePermissions]);

  const hasAnyPermission = useCallback((permissionIds: string[]): boolean => {
    return permissionIds.some(id => hasPermission(id));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((permissionIds: string[]): boolean => {
    return permissionIds.every(id => hasPermission(id));
  }, [hasPermission]);

  const isAdmin = useCallback((): boolean => {
    return session.user?.role === 'admin';
  }, [session]);

  const isOperator = useCallback((): boolean => {
    return session.user?.role === 'operator';
  }, [session]);

  const isViewer = useCallback((): boolean => {
    return session.user?.role === 'viewer';
  }, [session]);

  const canControl = useCallback((): boolean => {
    return hasAnyPermission(['arm_disarm', 'flight_control']);
  }, [hasAnyPermission]);

  const getRole = useCallback((): string | null => {
    return session.user?.role || null;
  }, [session]);

  const getUserPermissions = useCallback((): string[] => {
    if (!session.user) return [];
    return rolePermissions[session.user.role] || [];
  }, [session, rolePermissions]);

  return {
    session,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    isOperator,
    isViewer,
    canControl,
    getRole,
    getUserPermissions,
    isLoggedIn: session.isLoggedIn
  };
}
