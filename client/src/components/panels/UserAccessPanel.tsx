import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  Clock,
  Settings
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  createdAt: string;
  lastLogin: string | null;
  enabled: boolean;
}

interface CurrentSession {
  user: User | null;
  isLoggedIn: boolean;
}

const defaultUsers: User[] = [
  {
    id: "1",
    username: "admin",
    role: "admin",
    createdAt: "2024-01-01T00:00:00Z",
    lastLogin: new Date().toISOString(),
    enabled: true
  },
  {
    id: "2",
    username: "operator1",
    role: "operator",
    createdAt: "2024-01-10T00:00:00Z",
    lastLogin: new Date(Date.now() - 86400000).toISOString(),
    enabled: true
  },
  {
    id: "3",
    username: "viewer1",
    role: "viewer",
    createdAt: "2024-01-15T00:00:00Z",
    lastLogin: null,
    enabled: true
  }
];

export function UserAccessPanel() {
  const [users, setUsers] = useState<User[]>(defaultUsers);
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
  const [newUser, setNewUser] = useState({ username: "", password: "", confirmPassword: "", role: "operator" as const });

  useEffect(() => {
    localStorage.setItem('mouse_gcs_session', JSON.stringify(session));
    // Dispatch event for TopBar to update
    window.dispatchEvent(new CustomEvent('session-change', { detail: session }));
  }, [session]);

  const handleLogin = () => {
    const user = users.find(u => u.username === loginForm.username && u.enabled);
    if (user && loginForm.password === "demo123") { // Demo password
      setSession({ user, isLoggedIn: true });
      setUsers(prev => prev.map(u => 
        u.id === user.id ? { ...u, lastLogin: new Date().toISOString() } : u
      ));
      toast.success(`Welcome back, ${user.username}!`);
      setLoginForm({ username: "", password: "" });
    } else {
      toast.error("Invalid credentials or account disabled");
    }
  };

  const handleLogout = () => {
    setSession({ user: null, isLoggedIn: false });
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
    if (users.some(u => u.username === newUser.username)) {
      toast.error("Username already exists");
      return;
    }

    const user: User = {
      id: Date.now().toString(),
      username: newUser.username,
      role: newUser.role,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      enabled: true
    };
    setUsers(prev => [...prev, user]);
    setShowNewUserDialog(false);
    setNewUser({ username: "", password: "", confirmPassword: "", role: "operator" });
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
    toast.success("Role updated");
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

  // Login screen if not logged in
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
            <Button className="w-full" onClick={handleLogin} data-testid="button-login">
              <Key className="h-4 w-4 mr-2" />
              Login
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-4">
              Demo: Use username "admin" or "operator1" with password "demo123"
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* User List */}
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
                        placeholder="Enter username"
                        data-testid="input-new-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input 
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password"
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
                          <SelectItem value="admin">Admin (Full Access)</SelectItem>
                          <SelectItem value="operator">Operator (Flight Control)</SelectItem>
                          <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
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
            Logged in as: <span className="text-primary font-medium">{session.user?.username}</span>
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
                            <span className="font-medium text-sm">{user.username}</span>
                            {user.id === session.user?.id && (
                              <Badge variant="outline" className="text-[10px]">You</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {user.lastLogin 
                              ? `Last: ${new Date(user.lastLogin).toLocaleDateString()}`
                              : "Never logged in"
                            }
                          </p>
                        </div>
                      </div>
                      {isAdmin && user.id !== session.user?.id && (
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
                    
                    {isAdmin && (
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                        <Select 
                          value={user.role}
                          onValueChange={(v) => handleChangeRole(user.id, v as any)}
                          disabled={user.id === session.user?.id}
                        >
                          <SelectTrigger className="h-7 text-xs w-24">
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

      {/* User Details / Role Info */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-6">
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
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>Access levels for different user roles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="h-5 w-5 text-red-500" />
                    <span className="font-bold">Admin</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Full system access</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> User management</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Flight control & arming</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Mission planning</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> System settings</li>
                  </ul>
                </div>

                <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span className="font-bold">Operator</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Flight control & arming</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Mission planning</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> Camera & gimbal control</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> View telemetry</li>
                    <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> User management</li>
                  </ul>
                </div>

                <div className="p-4 bg-gray-500/10 border border-gray-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-5 w-5 text-gray-500" />
                    <span className="font-bold">Viewer</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> View map & telemetry</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> View camera feeds</li>
                    <li className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-500" /> View flight logs</li>
                    <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Flight control</li>
                    <li className="flex items-center gap-2"><XCircle className="h-3 w-3 text-red-500" /> Mission planning</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
