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
  Settings
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
];

const defaultRolePermissions: RolePermissions = {
  admin: allPermissions.map(p => p.id),
  operator: ["arm_disarm", "flight_control", "mission_planning", "camera_control", "view_telemetry", "view_map", "view_camera", "automation_scripts", "object_tracking", "broadcast_audio"],
  viewer: ["view_telemetry", "view_map", "view_camera"]
};

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
    return saved ? JSON.parse(saved) : defaultRolePermissions;
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

  useEffect(() => {
    localStorage.setItem('mouse_gcs_users', JSON.stringify(users));
    // Dispatch custom event for same-tab listeners (TopBar mention autocomplete)
    window.dispatchEvent(new CustomEvent('users-updated'));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('mouse_gcs_role_permissions', JSON.stringify(rolePermissions));
  }, [rolePermissions]);

  useEffect(() => {
    localStorage.setItem('mouse_gcs_session', JSON.stringify(session));
    window.dispatchEvent(new CustomEvent('session-change', { detail: session }));
  }, [session]);

  const [loginError, setLoginError] = useState<string | null>(null);
  
  const handleLogin = async () => {
    setLoginError(null);
    const user = users.find(u => u.username === loginForm.username);
    
    if (!user) {
      setLoginError("Invalid username or password");
      toast.error("Invalid username or password");
      return;
    }
    
    if (!user.enabled) {
      setLoginError("This account has been disabled");
      toast.error("This account has been disabled");
      return;
    }
    
    if (loginForm.password !== user.password) {
      setLoginError("Invalid username or password");
      toast.error("Invalid username or password");
      return;
    }
    
    // Create server-side session
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          role: user.role,
          name: user.fullName || user.username
        })
      });
      
      const result = await response.json();
      if (result.sessionToken) {
        // Store session token for WebSocket auth and API calls
        localStorage.setItem('mouse_gcs_session_token', result.sessionToken);
      }
    } catch (error) {
      console.error('Failed to create server session:', error);
      // Continue with local session even if server session fails
    }
    
    setSession({ user, isLoggedIn: true });
    setUsers(prev => prev.map(u => 
      u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u
    ));
    toast.success(`Welcome back, ${user.fullName || user.username}!`);
    setLoginForm({ username: "", password: "" });
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
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="operator">Operator</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
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
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
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
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="users" data-testid="tab-users">Session & Logout</TabsTrigger>
              <TabsTrigger value="permissions" data-testid="tab-permissions" disabled={!isAdmin}>
                Role Permissions {!isAdmin && "(Admin Only)"}
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

            <TabsContent value="permissions" className="space-y-6">
              {isAdmin && (
                <>
                  <Card className="border-2 border-amber-500/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-amber-500" />
                        Custom Role Permissions
                      </CardTitle>
                      <CardDescription>
                        Configure what each role can access. Changes apply immediately to all users with that role.
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  {['admin', 'operator', 'viewer'].map(role => {
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
