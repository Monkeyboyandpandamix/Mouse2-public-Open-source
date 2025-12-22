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
  Route
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const menuItems = [
    { id: "map", icon: Map, label: "Map View" },
    { id: "mission", icon: Navigation, label: "Mission Plan" },
    { id: "optimizer", icon: Route, label: "Path Optimizer" },
    { id: "tracking", icon: Target, label: "Object Track" },
    { id: "geofence", icon: Shield, label: "Geofencing" },
    { id: "payload", icon: Volume2, label: "Speaker" },
    { id: "feeds", icon: Video, label: "Camera Feeds" },
    { id: "logs", icon: FileText, label: "Flight Logs" },
    { id: "scripts", icon: Code, label: "Automation" },
    { id: "terminal", icon: Terminal, label: "Commands" },
    { id: "users", icon: Users, label: "User Access" },
    { id: "guiconfig", icon: LayoutDashboard, label: "GUI Config" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-12 sm:w-16 flex flex-col items-center py-2 sm:py-4 border-r border-border bg-card/50 backdrop-blur-sm z-40 overflow-y-auto">
      <div className="flex-1 flex flex-col gap-1 sm:gap-2 w-full px-1 sm:px-2">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant={activeTab === item.id ? "default" : "ghost"}
            size="icon"
            className={cn(
              "w-10 h-10 sm:w-12 sm:h-12 rounded-lg transition-all duration-200 shrink-0",
              activeTab === item.id 
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(6,182,212,0.5)]" 
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            onClick={() => setActiveTab(item.id)}
            title={item.label}
            data-testid={`sidebar-${item.id}`}
          >
            <item.icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
        ))}
      </div>
    </div>
  );
}
