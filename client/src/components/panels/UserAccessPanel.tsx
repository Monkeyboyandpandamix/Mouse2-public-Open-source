import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Shield, 
  ShieldCheck, 
  ShieldAlert,
  Key,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Edit,
  Save,
  RefreshCw,
  Settings,
  UsersRound,
  Plus,
  X
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface Permission {
  id: string;
  name: string;
  description: string;
}

interface RolePermissions {
  [role: string]: string[];
}

interface User {
  id: string;
  username: string;
  fullName: string;
  password: string;
  role: 'admin' | 'operator' | 'viewer';
  createdAt: string;
  lastLogin: string | null;
  enabled: boolean;
}

interface CurrentSession {
  user: User | null;
  isLoggedIn: boolean;
}

interface UserGroup {
  id: string;
  name: string;
  memberIds: string[];
  defaultRole?: string; // Default role for group members
  createdAt: string;
  createdBy: string;
}

const allPermissions: Permission[] = [
  { id: "arm_disarm", name: "Arm/Disarm Drone", description: "Control drone arming state" },
  { id: "flight_control", name: "Flight Control", description: "Takeoff, land, RTL commands" },
  { id: "mission_planning", name: "Mission Planning", description: "Create and edit missions" },
  { id: "camera_control", name: "Camera & Gimbal", description: "Control camera and gimbal" },
  { id: "view_telemetry", name: "View Telemetry", description: "See real-time drone data" },
  { id: "view_map", name: "View Map", description: "Access map display" },
  { id: "view_camera", name: "View Camera Feed", description: "Watch video streams" },
  { id: "user_management", name: "User Management", description: "Add, edit, delete users" },
  { id: "system_settings", name: "System Settings", description: "Modify system configuration" },
  { id: "delete_records", name: "Delete Records", description: "Delete flight logs and data" },
  { id: "delete_flight_data", name: "Delete Flight Data", description: "Remove waypoints and missions" },
  { id: "automation_scripts", name: "Automation Scripts", description: "Create and run scripts" },
  { id: "emergency_override", name: "Emergency Override", description: "Override emergency actions" },
  { id: "object_tracking", name: "Object Tracking", description: "Use tracking features" },
  { id: "broadcast_audio", name: "Broadcast Audio", description: "Use speaker system" },
  { id: "manage_geofences", name: "Manage Geofences", description: "Create and edit geofence zones" },
  { id: "access_flight_recorder", name: "Flight Recorder", description: "Access flight logs and logbook" },
  { id: "run_terminal", name: "Terminal Commands", description: "Execute terminal commands" },
  { id: "configure_gui_advanced", name: "GUI Configuration", description: "Customize interface layout" },
];

const defaultRolePermissions: RolePermissions = {
  admin: allPermissions.map(p => p.id),
  operator: [
    "arm_disarm", "flight_control", "mission_planning", "camera_control",
    "view_telemetry", "view_map", "view_camera", "automation_scripts",
    "object_tracking", "broadcast_audio", "manage_geofences", "access_flight_recorder",
    "system_settings", "run_terminal", "configure_gui_advanced"
  ],
  viewer: ["view_telemetry", "view_map", "view_camera"]
};

function mergeRolePermissions(saved: RolePermissions): RolePermissions {
  const merged: RolePermissions = { ...saved };
  for (const role of Object.keys(defaultRolePermissions)) {
    merged[role] = Array.from(new Set([...(saved[role] || []), ...defaultRolePermissions[role]]));
  }
  return merged;
}

const defaultUsers: User[] = [
  {
    id: "1",
    username: "admin",
    fullName: "System Administrator",
    password: "admin123",
    role: "admin",
    createdAt: "2024-01-01T00:00:00Z",
    lastLogin: new Date().toISOString(),
    enabled: true
  },
  {
    id: "2",
    username: "operator1",
    fullName: "Flight Operator",
    password: "operator123",
    role: "operator",
    createdAt: "2024-01-10T00:00:00Z",
    lastLogin: new Date(Date.now() - 86400000).toISOString(),
    enabled: true
  },
  {
    id: "3",
    username: "viewer1",
    fullName: "Mission Observer",
    password: "viewer123",
    role: "viewer",
    createdAt: "2024-01-15T00:00:00Z",
    lastLogin: null,
    enabled: true
  }
];

export function UserAccessPanel() {
  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('mouse_gcs_users');
    return saved ? JSON.parse(saved) : defaultUsers;
  });
  
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(() => {
    const saved = localStorage.getItem('mouse_gcs_role_permissions');
    if (!saved) return defaultRolePermissions;
    try {
      const parsed = JSON.parse(saved);
      const merged = mergeRolePermissions(parsed);
      localStorage.setItem('mouse_gcs_role_permissions', JSON.stringify(merged));
      return merged;
    } catch {
      return defaultRolePermissions;
    }
  });

  const [session, setSession] = useState<CurrentSession>(() => {
    const saved = localStorage.getItem('mouse_gcs_session');
    if (saved) {
      return JSON.parse(saved);
    }
    return { user: null, isLoggedIn: false };
  });
  
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ username: "", fullName: "", password: "", confirmPassword: "", role: "operator" as const });
  const [editForm, setEditForm] = useState({ username: "", newPassword: "", confirmPassword: "" });
  const [activeTab, setActiveTab] = useState("users");
  
  // Group management state
  const [groups, setGroups] = useState<UserGroup[]>(() => {
    const saved = localStorage.getItem('mouse_gcs_groups');
    return saved ? JSON.parse(saved) : [];
  });
  const [showNewGroupDialog, setShowNewGroupDialog] = useState(false);
  const [showEditGroupDialog, setShowEditGroupDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [editGroupName, setEditGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [selectedGroupRole, setSelectedGroupRole] = useState<string>("viewer");
  
  // Custom roles state - allows creating additional roles beyond admin/operator/viewer
  const [customRoles, setCustomRoles] = useState<string[]>(() => {
    const saved = localStorage.getItem('mouse_gcs_custom_roles');
    return saved ? JSON.parse(saved) : [];
  });
  const [newRoleName, setNewRoleName] = useState("");
  const [editingRoleName, setEditingRoleName] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("");
  
  // All available roles (built-in + custom)
  const allRoles = ['admin', 'operator', 'viewer', ...customRoles];

  useEffect(() => {
    localStorage.setItem('mouse_gcs_users', JSON.stringify(users));
    // Dispatch custom event for same-tab listeners (TopBar mention autocomplete)
    window.dispatchEvent(new CustomEvent('users-updated'));
    // Also update groups to remove deleted users
    setGroups(prev => prev.map(g => ({
      ...g,
      memberIds: g.memberIds.filter(id => users.some(u => u.id === id))
    })));
  }, [users]);
  
  useEffect(() => {
    localStorage.setItem('mouse_gcs_groups', JSON.stringify(groups));
    // Dispatch custom event for TopBar group autocomplete
    window.dispatchEvent(new CustomEvent('groups-updated'));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('mouse_gcs_role_permissions', JSON.stringify(rolePermissions));
  }, [rolePermissions]);
  
  useEffect(() => {
    localStorage.setItem('mouse_gcs_custom_roles', JSON.stringify(customRoles));
    // Initialize permissions for new custom roles
    customRoles.forEach(role => {
      if (!rolePermissions[role]) {
        setRolePermissions(prev => ({
          ...prev,
          [role]: ['view_telemetry', 'view_map', 'view_camera'] // Default to viewer-like permissions
        }));
      }
    });
  }, [customRoles]);

  useEffect(() => {
    localStorage.setItem('mouse_gcs_session', JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('session-change', { detail: session }));
    window.dispatchEvent(new CustomEvent('session-updated', { detail: session }));
  }, [session]);

  // Cross-tab synchronization via storage event
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'mouse_gcs_custom_roles' && e.newValue) {
        try {
          const newRoles = JSON.parse(e.newValue);
          setCustomRoles(newRoles);
        } catch {}
      }
      if (e.key === 'mouse_gcs_groups' && e.newValue) {
        try {
          const newGroups = JSON.parse(e.newValue);
          setGroups(newGroups);
        } catch {}
      }
      if (e.key === 'mouse_gcs_role_permissions' && e.newValue) {
        try {
          const newPermissions = JSON.parse(e.newValue);
          setRolePermissions(newPermissions);
        } catch {}
      }
      if (e.key === 'mouse_gcs_users' && e.newValue) {
        try {
          const newUsers = JSON.parse(e.newValue);
          setUsers(newUsers);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const [loginError, setLoginError] = useState<string | null>(null);
  
  const handleLogin = async () => {
    setLoginError(null);
    const username = loginForm.username.trim();
    const password = loginForm.password;
    if (!username || !password) {
      setLoginError("Username and password are required");
      toast.error("Username and password are required");
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.sessionToken || !result?.user) {
        throw new Error(result?.error || "Invalid username or password");
      }

      localStorage.setItem('mouse_gcs_session_token', result.sessionToken);

      const existingLocalUser = users.find((u) => u.username === result.user.username);
      const authenticatedUser: User = {
        id: result.user.id,
        username: result.user.username,
        fullName: result.user.fullName || result.user.username,
        password: existingLocalUser?.password || "",
        role: (["admin", "operator", "viewer"].includes(String(result.user.role)) ? result.user.role : "viewer") as User["role"],
        createdAt: existingLocalUser?.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        enabled: result.user.enabled !== false,
      };
      setSession({ user: authenticatedUser, isLoggedIn: true });
      setUsers(prev => prev.map(u =>
        u.username === authenticatedUser.username ? { ...u, lastLogin: new Date().toISOString() } : u
      ));
      toast.success(`Welcome back, ${authenticatedUser.fullName || authenticatedUser.username}!`);
      setLoginForm({ username: "", password: "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid username or password";
      setLoginError(message);
      toast.error(message);
    }
  };

  const handleLogout = async () => {
    // Invalidate server-side session
    const sessionToken = localStorage.getItem('mouse_gcs_session_token');
    if (sessionToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'X-Session-Token': sessionToken }
        });
      } catch (error) {
        console.error('Failed to invalidate server session:', error);
      }
    }
    
    setSession({ user: null, isLoggedIn: false });
    localStorage.removeItem('mouse_gcs_session');
    localStorage.removeItem('mouse_gcs_session_token');
    window.dispatchEvent(new CustomEvent('session-change', { detail: { user: null, isLoggedIn: false } }));
    window.dispatchEvent(new CustomEvent('session-updated', { detail: { user: null, isLoggedIn: false } }));
    toast.info("Logged out successfully");
  };

  const handleCreateUser = () => {
    if (newUser.password !== newUser.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newUser.username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (newUser.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (users.some(u => u.username === newUser.username)) {
      toast.error("Username already exists");
      return;
    }

    const user: User = {
      id: Date.now().toString(),
      username: newUser.username,
      fullName: newUser.fullName || newUser.username,
      password: newUser.password,
      role: newUser.role,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      enabled: true
    };
    setUsers(prev => [...prev, user]);
    setShowNewUserDialog(false);
    setNewUser({ username: "", fullName: "", password: "", confirmPassword: "", role: "operator" });
    toast.success("User created successfully");
  };

  const handleDeleteUser = (id: string) => {
    if (session.user?.id === id) {
      toast.error("Cannot delete your own account");
      return;
    }
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success("User deleted");
  };

  const handleToggleUser = (id: string, enabled: boolean) => {
    if (session.user?.id === id && !enabled) {
      toast.error("Cannot disable your own account");
      return;
    }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, enabled } : u));
    toast.success(enabled ? "User enabled" : "User disabled");
  };

  const handleChangeRole = (id: string, role: 'admin' | 'operator' | 'viewer') => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
    if (session.user?.id === id) {
      setSession(prev => prev.user ? { ...prev, user: { ...prev.user, role } } : prev);
    }
    toast.success("Role updated");
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setEditForm({ username: user.username, newPassword: "", confirmPassword: "" });
    setShowEditUserDialog(true);
  };

  const handleSaveUserEdit = () => {
    if (!selectedUser) return;

    if (editForm.username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    if (users.some(u => u.username === editForm.username && u.id !== selectedUser.id)) {
      toast.error("Username already exists");
      return;
    }
    if (editForm.newPassword && editForm.newPassword !== editForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (editForm.newPassword && editForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setUsers(prev => prev.map(u => {
      if (u.id === selectedUser.id) {
        return {
          ...u,
          username: editForm.username,
          password: editForm.newPassword || u.password
        };
      }
      return u;
    }));

    if (session.user?.id === selectedUser.id) {
      setSession(prev => prev.user ? { 
        ...prev, 
        user: { ...prev.user, username: editForm.username, password: editForm.newPassword || prev.user.password } 
      } : prev);
    }

    setShowEditUserDialog(false);
    setSelectedUser(null);
    toast.success("User updated successfully");
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setEditForm({ username: user.username, newPassword: "", confirmPassword: "" });
    setShowResetPasswordDialog(true);
  };

  const handleSavePasswordReset = () => {
    if (!selectedUser) return;

    if (editForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (editForm.newPassword !== editForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setUsers(prev => prev.map(u => {
      if (u.id === selectedUser.id) {
        return { ...u, password: editForm.newPassword };
      }
      return u;
    }));

    setShowResetPasswordDialog(false);
    setSelectedUser(null);
    toast.success("Password reset successfully");
  };

  const handleTogglePermission = (role: string, permissionId: string) => {
    setRolePermissions(prev => {
      const current = prev[role] || [];
      if (current.includes(permissionId)) {
        return { ...prev, [role]: current.filter(p => p !== permissionId) };
      } else {
        return { ...prev, [role]: [...current, permissionId] };
      }
    });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return { color: "bg-red-500", icon: ShieldAlert };
      case 'operator': return { color: "bg-primary", icon: ShieldCheck };
      case 'viewer': return { color: "bg-gray-500", icon: Shield };
      default: return { color: "bg-gray-500", icon: Shield };
    }
  };

  // Group management handlers
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    if (groups.some(g => g.name.toLowerCase() === newGroupName.toLowerCase())) {
      toast.error("A group with this name already exists");
      return;
    }
    
    const newGroup: UserGroup = {
      id: `group_${Date.now()}`,
      name: newGroupName.trim(),
      memberIds: selectedGroupMembers,
      defaultRole: selectedGroupRole,
      createdAt: new Date().toISOString(),
      createdBy: session.user?.id || 'unknown'
    };
    
    setGroups(prev => [...prev, newGroup]);
    setShowNewGroupDialog(false);
    setNewGroupName("");
    setSelectedGroupMembers([]);
    setSelectedGroupRole("viewer");
    toast.success(`Group "${newGroup.name}" created`);
  };
  
  const handleEditGroup = (group: UserGroup) => {
    setSelectedGroup(group);
    setEditGroupName(group.name);
    setSelectedGroupMembers([...group.memberIds]);
    setSelectedGroupRole(group.defaultRole || "viewer");
    setShowEditGroupDialog(true);
  };
  
  const handleSaveGroupEdit = () => {
    if (!selectedGroup) return;
    
    if (!editGroupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    if (groups.some(g => g.name.toLowerCase() === editGroupName.toLowerCase() && g.id !== selectedGroup.id)) {
      toast.error("A group with this name already exists");
      return;
    }
    
    setGroups(prev => prev.map(g => 
      g.id === selectedGroup.id 
        ? { ...g, name: editGroupName.trim(), memberIds: selectedGroupMembers, defaultRole: selectedGroupRole }
        : g
    ));
    
    setShowEditGroupDialog(false);
    setSelectedGroup(null);
    toast.success("Group updated");
  };
  
  // Custom role management handlers
  const handleAddCustomRole = () => {
    const roleName = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!roleName) {
      toast.error("Role name is required");
      return;
    }
    if (allRoles.includes(roleName)) {
      toast.error("This role already exists");
      return;
    }
    setCustomRoles(prev => [...prev, roleName]);
    setNewRoleName("");
    toast.success(`Role "${roleName}" created`);
  };
  
  const handleRenameRole = (oldName: string) => {
    const newName = editRoleValue.trim().toLowerCase().replace(/\s+/g, '_');
    if (!newName) {
      toast.error("Role name is required");
      return;
    }
    if (allRoles.includes(newName) && newName !== oldName) {
      toast.error("This role already exists");
      return;
    }
    
    // Update the role name
    setCustomRoles(prev => prev.map(r => r === oldName ? newName : r));
    
    // Update role permissions
    setRolePermissions(prev => {
      const newPerms = { ...prev };
      if (prev[oldName]) {
        newPerms[newName] = prev[oldName];
        delete newPerms[oldName];
      }
      return newPerms;
    });
    
    // Update users with this role
    setUsers(prev => prev.map(u => 
      u.role === oldName ? { ...u, role: newName as 'admin' | 'operator' | 'viewer' } : u
    ));
    
    // Update groups with this default role
    setGroups(prev => prev.map(g => 
      g.defaultRole === oldName ? { ...g, defaultRole: newName } : g
    ));
    
    setEditingRoleName(null);
    setEditRoleValue("");
    toast.success(`Role renamed to "${newName}"`);
  };
  
  const handleDeleteRole = (roleName: string) => {
    // Check if any users have this role
    const usersWithRole = users.filter(u => u.role === roleName);
    if (usersWithRole.length > 0) {
      toast.error(`Cannot delete: ${usersWithRole.length} user(s) have this role. Change their role first.`);
      return;
    }
    
    setCustomRoles(prev => prev.filter(r => r !== roleName));
    setRolePermissions(prev => {
      const newPerms = { ...prev };
      delete newPerms[roleName];
      return newPerms;
    });
    
    // Update groups with this default role to viewer
    setGroups(prev => prev.map(g => 
      g.defaultRole === roleName ? { ...g, defaultRole: 'viewer' } : g
    ));
    
    toast.success(`Role "${roleName}" deleted`);
  };
  
  const handleDeleteGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
    toast.success("Group deleted");
  };
  
  const toggleGroupMember = (userId: string) => {
    setSelectedGroupMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const isAdmin = session.user?.role === 'admin';

  if (!session.isLoggedIn) {
    return (
      <div className="h-full flex items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md border-2 border-primary/50">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">M.O.U.S.E GCS Login</CardTitle>
            <CardDescription>Enter your credentials to access the ground control station</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username"
                value={loginForm.username}
                onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Enter username"
                data-testid="input-login-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input 
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  data-testid="input-login-password"
                />
                <Button 
                  type="button"
                  variant="ghost" 
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {loginError && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-destructive text-sm text-center">
                {loginError}
              </div>
            )}
            <Button className="w-full" onClick={handleLogin} data-testid="button-login">
              <Key className="h-4 w-4 mr-2" />
              Login
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Default: admin/admin123, operator1/operator123, viewer1/viewer123
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <div className="w-80 border-r border-border bg-card/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </h3>
            {isAdmin && (
              <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-user">
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>Add a new user to the system</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input 
                        value={newUser.username}
                        onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="Enter username (min 3 chars)"
                        data-testid="input-new-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input 
                        value={newUser.fullName}
                        onChange={(e) => setNewUser(prev => ({ ...prev, fullName: e.target.value }))}
                        placeholder="Enter full name (e.g. John Smith)"
                        data-testid="input-new-fullname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input 
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password (min 6 chars)"
                        data-testid="input-new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Confirm Password</Label>
                      <Input 
                        type="password"
                        value={newUser.confirmPassword}
                        onChange={(e) => setNewUser(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm password"
                        data-testid="input-confirm-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select 
                        value={newUser.role}
                        onValueChange={(v) => setNewUser(prev => ({ ...prev, role: v as any }))}
                      >
                        <SelectTrigger data-testid="select-new-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allRoles.map(role => (
                            <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowNewUserDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateUser} data-testid="button-create-user">
                      Create User
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Logged in as: <span className="text-primary font-medium">{session.user?.fullName || session.user?.username}</span>
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {users.map(user => {
              const { color, icon: RoleIcon } = getRoleBadge(user.role);
              return (
                <Card
                  key={user.id}
                  className={`transition-colors ${
                    user.id === session.user?.id
                      ? "border-primary bg-primary/10" 
                      : user.enabled ? "hover:bg-muted/50" : "opacity-50"
                  }`}
                  data-testid={`card-user-${user.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
                          <RoleIcon className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{user.fullName || user.username}</span>
                            {user.id === session.user?.id && (
                              <Badge variant="outline" className="text-[10px]">You</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            @{user.username} · {user.lastLogin 
                              ? `Last: ${new Date(user.lastLogin).toLocaleDateString()}`
                              : "Never logged in"
                            }
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6"
                            onClick={() => handleEditUser(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6"
                            onClick={() => handleResetPassword(user)}
                            data-testid={`button-reset-password-${user.id}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          {user.id !== session.user?.id && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6 text-red-500"
                              onClick={() => handleDeleteUser(user.id)}
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {isAdmin && (
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                        <Select 
                          value={user.role}
                          onValueChange={(v) => handleChangeRole(user.id, v as any)}
                        >
                          <SelectTrigger className="h-7 text-xs w-24" data-testid={`select-role-${user.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allRoles.map(r => (
                              <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Enabled</span>
                          <Switch 
                            checked={user.enabled}
                            onCheckedChange={(v) => handleToggleUser(user.id, v)}
                            disabled={user.id === session.user?.id}
                            data-testid={`switch-user-${user.id}`}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="users" data-testid="tab-users">Session & Logout</TabsTrigger>
              <TabsTrigger value="groups" data-testid="tab-groups" disabled={!isAdmin}>
                Groups {!isAdmin && "(Admin Only)"}
              </TabsTrigger>
              <TabsTrigger value="permissions" data-testid="tab-permissions" disabled={!isAdmin}>
                Permissions {!isAdmin && "(Admin Only)"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-6">
              <Card className="border-2 border-primary/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Current Session
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">Username</p>
                      <p className="font-bold text-lg">{session.user?.username}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">Role</p>
                      <p className="font-bold text-lg capitalize">{session.user?.role}</p>
                    </div>
                  </div>
                  <Button variant="destructive" className="w-full" onClick={handleLogout} data-testid="button-logout">
                    <LogOut className="h-4 w-4 mr-2" />
                    Log Out
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Your Permissions</CardTitle>
                  <CardDescription>Access based on your current role</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {allPermissions.map(permission => {
                      const hasPermission = session.user?.role ? 
                        rolePermissions[session.user.role]?.includes(permission.id) : false;
                      return (
                        <div 
                          key={permission.id}
                          className={`p-3 rounded-lg border ${hasPermission ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/30 border-border opacity-50'}`}
                        >
                          <div className="flex items-center gap-2">
                            {hasPermission ? 
                              <CheckCircle className="h-4 w-4 text-emerald-500" /> : 
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            }
                            <span className="text-sm font-medium">{permission.name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground ml-6">{permission.description}</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="groups" className="space-y-6">
              {isAdmin && (
                <>
                  <Card className="border-2 border-blue-500/50">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <UsersRound className="h-5 w-5 text-blue-500" />
                            User Groups
                          </CardTitle>
                          <CardDescription>
                            Create groups to message multiple users at once. Use @groupname in chat.
                          </CardDescription>
                        </div>
                        <Dialog open={showNewGroupDialog} onOpenChange={setShowNewGroupDialog}>
                          <DialogTrigger asChild>
                            <Button size="sm" data-testid="button-new-group">
                              <Plus className="h-4 w-4 mr-1" />
                              New Group
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create New Group</DialogTitle>
                              <DialogDescription>
                                Create a group to message multiple users. Select members below.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label>Group Name</Label>
                                <Input
                                  placeholder="e.g., Pilots, Ground Crew, Night Shift"
                                  value={newGroupName}
                                  onChange={(e) => setNewGroupName(e.target.value)}
                                  data-testid="input-new-group-name"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Default Role</Label>
                                <Select value={selectedGroupRole} onValueChange={setSelectedGroupRole}>
                                  <SelectTrigger data-testid="select-group-role">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allRoles.map(role => (
                                      <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Default role for group members</p>
                              </div>
                              <div className="space-y-2">
                                <Label>Members ({selectedGroupMembers.length} selected)</Label>
                                <ScrollArea className="h-32 border rounded-md p-2">
                                  {users.filter(u => u.enabled).map(user => (
                                    <div 
                                      key={user.id} 
                                      className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted rounded cursor-pointer"
                                      onClick={() => toggleGroupMember(user.id)}
                                      data-testid={`checkbox-group-member-${user.id}`}
                                    >
                                      <Checkbox 
                                        checked={selectedGroupMembers.includes(user.id)}
                                        onCheckedChange={() => toggleGroupMember(user.id)}
                                      />
                                      <span className="text-sm flex-1">{user.fullName || user.username}</span>
                                      <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                                    </div>
                                  ))}
                                </ScrollArea>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => {
                                setShowNewGroupDialog(false);
                                setNewGroupName("");
                                setSelectedGroupMembers([]);
                                setSelectedGroupRole("viewer");
                              }}>Cancel</Button>
                              <Button onClick={handleCreateGroup} data-testid="button-create-group">
                                Create Group
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                  </Card>

                  {groups.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        <UsersRound className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No groups created yet.</p>
                        <p className="text-sm">Create a group to message multiple users at once.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    groups.map(group => (
                      <Card key={group.id}>
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <UsersRound className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">@{group.name}</span>
                                <Badge variant="secondary" className="text-[10px]">
                                  {group.memberIds.length} member{group.memberIds.length !== 1 ? 's' : ''}
                                </Badge>
                                {group.defaultRole && (
                                  <Badge variant="outline" className="text-[10px] capitalize">
                                    Role: {group.defaultRole}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {group.memberIds.map(memberId => {
                                  const member = users.find(u => u.id === memberId);
                                  return member ? (
                                    <Badge key={memberId} variant="outline" className="text-[10px]">
                                      {member.fullName || member.username}
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => handleEditGroup(group)}
                                data-testid={`button-edit-group-${group.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteGroup(group.id)}
                                data-testid={`button-delete-group-${group.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </>
              )}
            </TabsContent>

            {/* Edit Group Dialog */}
            <Dialog open={showEditGroupDialog} onOpenChange={setShowEditGroupDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Group</DialogTitle>
                  <DialogDescription>
                    Update the group name and members.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Group Name</Label>
                    <Input
                      placeholder="Group name"
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      data-testid="input-edit-group-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Role</Label>
                    <Select value={selectedGroupRole} onValueChange={setSelectedGroupRole}>
                      <SelectTrigger data-testid="select-edit-group-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {allRoles.map(role => (
                          <SelectItem key={role} value={role} className="capitalize">{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Members ({selectedGroupMembers.length} selected)</Label>
                    <ScrollArea className="h-32 border rounded-md p-2">
                      {users.filter(u => u.enabled).map(user => (
                        <div 
                          key={user.id} 
                          className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted rounded cursor-pointer"
                          onClick={() => toggleGroupMember(user.id)}
                          data-testid={`checkbox-edit-group-member-${user.id}`}
                        >
                          <Checkbox 
                            checked={selectedGroupMembers.includes(user.id)}
                            onCheckedChange={() => toggleGroupMember(user.id)}
                          />
                          <span className="text-sm flex-1">{user.fullName || user.username}</span>
                          <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setShowEditGroupDialog(false);
                    setSelectedGroup(null);
                  }}>Cancel</Button>
                  <Button onClick={handleSaveGroupEdit} data-testid="button-save-group">
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <TabsContent value="permissions" className="space-y-6">
              {isAdmin && (
                <>
                  {/* Create Custom Role Section */}
                  <Card className="border-2 border-green-500/50">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-green-500" />
                            Create Custom Role
                          </CardTitle>
                          <CardDescription>
                            Add new roles beyond Admin, Operator, and Viewer. Custom roles can be assigned to users and groups.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter role name (e.g., pilot, observer, mechanic)"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomRole()}
                          className="flex-1"
                          data-testid="input-new-role-name"
                        />
                        <Button onClick={handleAddCustomRole} data-testid="button-add-role">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Role
                        </Button>
                      </div>
                      {customRoles.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <Label className="text-sm text-muted-foreground">Custom Roles:</Label>
                          <div className="flex flex-wrap gap-2">
                            {customRoles.map(role => (
                              <div key={role} className="flex items-center gap-1 bg-muted rounded-md px-2 py-1">
                                {editingRoleName === role ? (
                                  <>
                                    <Input
                                      value={editRoleValue}
                                      onChange={(e) => setEditRoleValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleRenameRole(role);
                                        if (e.key === 'Escape') {
                                          setEditingRoleName(null);
                                          setEditRoleValue("");
                                        }
                                      }}
                                      className="h-6 w-24 text-xs"
                                      autoFocus
                                      data-testid={`input-rename-role-${role}`}
                                    />
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-5 w-5"
                                      onClick={() => handleRenameRole(role)}
                                    >
                                      <CheckCircle className="h-3 w-3 text-green-500" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-5 w-5"
                                      onClick={() => {
                                        setEditingRoleName(null);
                                        setEditRoleValue("");
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-sm capitalize">{role}</span>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-5 w-5"
                                      onClick={() => {
                                        setEditingRoleName(role);
                                        setEditRoleValue(role);
                                      }}
                                      data-testid={`button-edit-role-${role}`}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-5 w-5 text-destructive"
                                      onClick={() => handleDeleteRole(role)}
                                      data-testid={`button-delete-role-${role}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-amber-500/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-amber-500" />
                        Role Permissions
                      </CardTitle>
                      <CardDescription>
                        Configure what each role can access. Changes apply immediately to all users with that role.
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  {allRoles.map(role => {
                    const { color, icon: RoleIcon } = getRoleBadge(role);
                    return (
                      <Card key={role}>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 capitalize">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${color}`}>
                              <RoleIcon className="h-3 w-3 text-white" />
                            </div>
                            {role} Role
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-3">
                            {allPermissions.map(permission => {
                              const checked = rolePermissions[role]?.includes(permission.id) ?? false;
                              const isDisabled = role === 'admin' && ['user_management', 'system_settings'].includes(permission.id);
                              return (
                                <div 
                                  key={permission.id}
                                  className={`flex items-start space-x-3 p-2 rounded ${checked ? 'bg-primary/5' : ''}`}
                                >
                                  <Checkbox
                                    id={`${role}-${permission.id}`}
                                    checked={checked}
                                    onCheckedChange={() => handleTogglePermission(role, permission.id)}
                                    disabled={isDisabled}
                                    data-testid={`checkbox-${role}-${permission.id}`}
                                  />
                                  <div className="grid gap-0.5 leading-none">
                                    <label
                                      htmlFor={`${role}-${permission.id}`}
                                      className={`text-sm font-medium cursor-pointer ${isDisabled ? 'opacity-50' : ''}`}
                                    >
                                      {permission.name}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                      {permission.description}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user credentials for {selectedUser?.username}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input 
                value={editForm.username}
                onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Enter new username"
                data-testid="input-edit-username"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password (leave blank to keep current)</Label>
              <Input 
                type="password"
                value={editForm.newPassword}
                onChange={(e) => setEditForm(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Enter new password"
                data-testid="input-edit-password"
              />
            </div>
            {editForm.newPassword && (
              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input 
                  type="password"
                  value={editForm.confirmPassword}
                  onChange={(e) => setEditForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                  data-testid="input-edit-confirm-password"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditUserDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUserEdit} data-testid="button-save-user-edit">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for {selectedUser?.username}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input 
                type="password"
                value={editForm.newPassword}
                onChange={(e) => setEditForm(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Enter new password (min 6 chars)"
                data-testid="input-reset-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input 
                type="password"
                value={editForm.confirmPassword}
                onChange={(e) => setEditForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                data-testid="input-reset-confirm-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePasswordReset} data-testid="button-confirm-reset-password">
              <Key className="h-4 w-4 mr-2" />
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
