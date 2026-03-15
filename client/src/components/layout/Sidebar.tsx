import { 
  Map, 
  Navigation, 
  Target, 
  Volume2, 
  Video, 
  Settings, 
  FileText,
  Code,
  Users,
  Terminal,
  Shield,
  LayoutDashboard,
  Route,
  BookOpen,
  Leaf,
  SlidersHorizontal,
  Wrench,
  Users2,
  Brain,
  LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useState, useEffect, memo } from "react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface MenuItem {
  id: string;
  icon: LucideIcon;
  label: string;
  requiredPermission?: string;
  requiredAnyPermission?: string[];
  alwaysShow?: boolean;
}

interface TabConfig {
  id: string;
  name: string;
  icon: string;
  visible: boolean;
  order: number;
  isCustom: boolean;
}

export const Sidebar = memo(function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { hasPermission, hasAnyPermission, isLoggedIn } = usePermissions();
  const [tabConfig, setTabConfig] = useState<TabConfig[]>([]);

  useEffect(() => {
    const loadTabConfig = () => {
      const saved = localStorage.getItem('mouse_gui_tabs');
      if (saved) {
        try {
          setTabConfig(JSON.parse(saved));
        } catch (e) {
          setTabConfig([]);
        }
      }
    };

    loadTabConfig();

    const handleConfigChange = () => {
      loadTabConfig();
    };

    window.addEventListener('gui-config-changed', handleConfigChange);
    window.addEventListener('storage', handleConfigChange);
    
    return () => {
      window.removeEventListener('gui-config-changed', handleConfigChange);
      window.removeEventListener('storage', handleConfigChange);
    };
  }, []);

  const menuItems: MenuItem[] = [
    { id: "map", icon: Map, label: "Map View", requiredPermission: "view_map" },
    { id: "mission", icon: Navigation, label: "Mission Plan", requiredPermission: "mission_planning" },
    { id: "optimizer", icon: Route, label: "Path Optimizer", requiredPermission: "mission_planning" },
    { id: "tracking", icon: Target, label: "Object Track", requiredPermission: "object_tracking" },
    { id: "geofence", icon: Shield, label: "Geofencing", requiredPermission: "manage_geofences" },
    { id: "payload", icon: Volume2, label: "Speaker", requiredPermission: "broadcast_audio" },
    { id: "feeds", icon: Video, label: "Camera Feeds", requiredPermission: "view_camera" },
    { id: "logs", icon: FileText, label: "Flight Logs", requiredPermission: "access_flight_recorder" },
    { id: "logbook", icon: BookOpen, label: "Logbook", requiredPermission: "access_flight_recorder" },
    { id: "environment", icon: Leaf, label: "Environment", requiredPermission: "view_telemetry" },
    { id: "scripts", icon: Code, label: "Automation", requiredPermission: "automation_scripts" },
    { id: "terminal", icon: Terminal, label: "Commands", requiredPermission: "run_terminal" },
    { id: "fcparams", icon: SlidersHorizontal, label: "FC Params", requiredPermission: "system_settings" },
    { id: "calibration", icon: Wrench, label: "Calibration", requiredPermission: "system_settings" },
    { id: "swarm", icon: Users2, label: "Swarm Ops", requiredPermission: "system_settings" },
    { id: "stabilization", icon: Brain, label: "Stabilization", requiredPermission: "view_telemetry" },
    { id: "users", icon: Users, label: "User Access", alwaysShow: true },
    { id: "guiconfig", icon: LayoutDashboard, label: "GUI Config", requiredPermission: "configure_gui_advanced" },
    { id: "settings", icon: Settings, label: "Settings", requiredPermission: "system_settings" },
  ];

  const isTabVisible = (id: string): boolean => {
    if (tabConfig.length === 0) return true;
    const config = tabConfig.find(t => t.id === id);
    return config ? config.visible : true;
  };

  const canAccessItem = (item: MenuItem): boolean => {
    if (!isLoggedIn) return false;
    if (!isTabVisible(item.id)) return false;
    if (item.alwaysShow) return true;
    if (item.requiredPermission) return hasPermission(item.requiredPermission);
    if (item.requiredAnyPermission) return hasAnyPermission(item.requiredAnyPermission);
    return true;
  };

  const getTabOrder = (id: string): number => {
    if (tabConfig.length === 0) return 999;
    const config = tabConfig.find(t => t.id === id);
    return config ? config.order : 999;
  };

  const visibleItems = menuItems
    .filter(canAccessItem)
    .sort((a, b) => getTabOrder(a.id) - getTabOrder(b.id));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-12 sm:w-16 flex flex-col items-center py-2 sm:py-4 border-r border-border bg-card/50 backdrop-blur-sm z-40 overflow-y-auto">
        <div className="flex-1 flex flex-col gap-1 sm:gap-2 w-full px-1 sm:px-2">
          {visibleItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeTab === item.id ? "default" : "ghost"}
                  size="icon"
                  className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-lg transition-all duration-200 shrink-0",
                    activeTab === item.id 
                      ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(6,182,212,0.5)]" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => setActiveTab(item.id)}
                  data-testid={`sidebar-${item.id}`}
                >
                  <item.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
});
