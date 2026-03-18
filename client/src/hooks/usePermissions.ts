import { useCallback } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import { ROLE_PERMISSIONS } from "@shared/permissions";

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

export function usePermissions() {
  const { session } = useAppState();

  const rolePermissions: RolePermissions = ROLE_PERMISSIONS;

  const hasPermission = useCallback((permissionId: string): boolean => {
    if (!session.isLoggedIn || !session.user) {
      return false;
    }

    const permissions = session.user.permissions || rolePermissions[session.user.role] || [];
    
    return permissions.includes(permissionId);
  }, [session, rolePermissions]);

  const hasAnyPermission = useCallback((permissionIds: string[]): boolean => {
    return permissionIds.some(id => hasPermission(id));
  }, [hasPermission]);

  const hasAllPermissions = useCallback((permissionIds: string[]): boolean => {
    return permissionIds.every(id => hasPermission(id));
  }, [hasPermission]);

  const isAdmin = useCallback((): boolean => {
    if (!session.isLoggedIn || !session.user) return false;
    return session.user?.role === 'admin';
  }, [session]);

  const isOperator = useCallback((): boolean => {
    if (!session.isLoggedIn || !session.user) return false;
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
    return session.user.permissions || rolePermissions[session.user.role] || [];
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
