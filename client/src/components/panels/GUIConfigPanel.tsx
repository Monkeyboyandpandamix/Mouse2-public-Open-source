import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  LayoutDashboard, 
  Plus, 
  Trash2, 
  GripVertical,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Save,
  RotateCcw,
  Palette
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface TabConfig {
  id: string;
  name: string;
  icon: string;
  visible: boolean;
  order: number;
  isCustom: boolean;
}

interface PanelConfig {
  id: string;
  name: string;
  position: "left" | "right" | "floating";
  visible: boolean;
  draggable: boolean;
}

const defaultTabs: TabConfig[] = [
  { id: "map", name: "Map View", icon: "Map", visible: true, order: 0, isCustom: false },
  { id: "mission", name: "Mission Plan", icon: "Navigation", visible: true, order: 1, isCustom: false },
  { id: "tracking", name: "Object Track", icon: "Target", visible: true, order: 2, isCustom: false },
  { id: "geofence", name: "Geofencing", icon: "Shield", visible: true, order: 3, isCustom: false },
  { id: "payload", name: "Speaker", icon: "Volume2", visible: true, order: 4, isCustom: false },
  { id: "feeds", name: "Camera Feeds", icon: "Video", visible: true, order: 5, isCustom: false },
  { id: "logs", name: "Flight Logs", icon: "FileText", visible: true, order: 6, isCustom: false },
  { id: "scripts", name: "Automation", icon: "Code", visible: true, order: 7, isCustom: false },
  { id: "terminal", name: "Commands", icon: "Terminal", visible: true, order: 8, isCustom: false },
  { id: "users", name: "User Access", icon: "Users", visible: true, order: 9, isCustom: false },
  { id: "settings", name: "Settings", icon: "Settings", visible: true, order: 10, isCustom: false },
];

const defaultPanels: PanelConfig[] = [
  { id: "telemetry", name: "Telemetry Panel", position: "right", visible: true, draggable: false },
  { id: "videofeed", name: "Video Feed", position: "floating", visible: true, draggable: true },
  { id: "adsb", name: "ADS-B Traffic", position: "floating", visible: true, draggable: true },
  { id: "controls", name: "Flight Controls", position: "left", visible: true, draggable: false },
];

export function GUIConfigPanel() {
  const [tabs, setTabs] = useState<TabConfig[]>(() => {
    const saved = localStorage.getItem('mouse_gui_tabs');
    return saved ? JSON.parse(saved) : defaultTabs;
  });

  const [panels, setPanels] = useState<PanelConfig[]>(() => {
    const saved = localStorage.getItem('mouse_gui_panels');
    return saved ? JSON.parse(saved) : defaultPanels;
  });

  const [newTabName, setNewTabName] = useState("");
  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    return (localStorage.getItem('mouse_theme') as "dark" | "light" | "system") || "dark";
  });

  useEffect(() => {
    localStorage.setItem('mouse_gui_tabs', JSON.stringify(tabs));
    window.dispatchEvent(new CustomEvent('gui-config-changed', { detail: { tabs } }));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('mouse_gui_panels', JSON.stringify(panels));
    window.dispatchEvent(new CustomEvent('gui-config-changed', { detail: { panels } }));
  }, [panels]);

  const toggleTabVisibility = (id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  const moveTab = (id: string, direction: "up" | "down") => {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === tabs.length - 1) return;

    const newTabs = [...tabs];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newTabs[index], newTabs[swapIndex]] = [newTabs[swapIndex], newTabs[index]];
    newTabs.forEach((t, i) => t.order = i);
    setTabs(newTabs);
  };

  const deleteTab = (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (!tab?.isCustom) {
      toast.error("Cannot delete built-in tabs");
      return;
    }
    setTabs(prev => prev.filter(t => t.id !== id));
    toast.success("Tab deleted");
  };

  const addCustomTab = () => {
    if (!newTabName.trim()) {
      toast.error("Please enter a tab name");
      return;
    }
    const newTab: TabConfig = {
      id: `custom_${Date.now()}`,
      name: newTabName,
      icon: "Plus",
      visible: true,
      order: tabs.length,
      isCustom: true
    };
    setTabs(prev => [...prev, newTab]);
    setNewTabName("");
    toast.success(`Tab "${newTabName}" added`);
  };

  const togglePanelDraggable = (id: string) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, draggable: !p.draggable } : p));
  };

  const togglePanelVisibility = (id: string) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p));
  };

  const updatePanelPosition = (id: string, position: PanelConfig["position"]) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, position } : p));
  };

  const resetToDefaults = () => {
    if (confirm("Reset all GUI settings to defaults?")) {
      setTabs(defaultTabs);
      setPanels(defaultPanels);
      localStorage.removeItem('mouse_gui_tabs');
      localStorage.removeItem('mouse_gui_panels');
      toast.success("GUI settings reset to defaults");
    }
  };

  const saveSettings = () => {
    localStorage.setItem('mouse_gui_tabs', JSON.stringify(tabs));
    localStorage.setItem('mouse_gui_panels', JSON.stringify(panels));
    localStorage.setItem('mouse_theme', theme);
    
    window.dispatchEvent(new CustomEvent('gui-config-changed', { 
      detail: { tabs, panels, theme, immediate: true } 
    }));
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    
    toast.success("GUI settings saved and applied");
  };
  
  const applyNow = () => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    
    window.dispatchEvent(new CustomEvent('gui-config-changed', { 
      detail: { tabs, panels, theme, immediate: true } 
    }));
    toast.success("Changes applied immediately");
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              GUI Configuration
            </h2>
            <p className="text-muted-foreground">Customize the interface layout and appearance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetToDefaults} data-testid="button-reset-gui">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button variant="secondary" onClick={applyNow} data-testid="button-apply-gui">
              Apply Now
            </Button>
            <Button onClick={saveSettings} data-testid="button-save-gui">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Sidebar Tabs Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sidebar Tabs</CardTitle>
              <CardDescription>Show, hide, or reorder sidebar navigation tabs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-72">
                <div className="space-y-2">
                  {tabs.sort((a, b) => a.order - b.order).map((tab) => (
                    <div 
                      key={tab.id}
                      className={`flex items-center justify-between p-2 rounded border ${
                        tab.visible ? "bg-muted/30" : "bg-muted/10 opacity-50"
                      }`}
                      data-testid={`tab-config-${tab.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className={tab.visible ? "" : "line-through text-muted-foreground"}>
                          {tab.name}
                        </span>
                        {tab.isCustom && (
                          <Badge variant="outline" className="text-[10px]">Custom</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => moveTab(tab.id, "up")}
                          data-testid={`button-move-up-${tab.id}`}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => moveTab(tab.id, "down")}
                          data-testid={`button-move-down-${tab.id}`}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => toggleTabVisibility(tab.id)}
                          data-testid={`button-toggle-${tab.id}`}
                        >
                          {tab.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </Button>
                        {tab.isCustom && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteTab(tab.id)}
                            data-testid={`button-delete-${tab.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Separator />

              <div className="space-y-2">
                <Label>Add Custom Tab</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Tab name..."
                    value={newTabName}
                    onChange={(e) => setNewTabName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomTab()}
                    data-testid="input-new-tab-name"
                  />
                  <Button onClick={addCustomTab} data-testid="button-add-tab">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Panels Configuration */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Panel Settings</CardTitle>
                <CardDescription>Configure draggable panels on the main view</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {panels.map((panel) => (
                  <div 
                    key={panel.id}
                    className="p-3 rounded border bg-muted/30 space-y-2"
                    data-testid={`panel-config-${panel.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{panel.name}</span>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={panel.visible}
                          onCheckedChange={() => togglePanelVisibility(panel.id)}
                          data-testid={`switch-panel-visible-${panel.id}`}
                        />
                        <Label className="text-xs">Visible</Label>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Position</Label>
                        <Select 
                          value={panel.position}
                          onValueChange={(v) => updatePanelPosition(panel.id, v as PanelConfig["position"])}
                        >
                          <SelectTrigger className="h-8" data-testid={`select-panel-position-${panel.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">Left Side</SelectItem>
                            <SelectItem value="right">Right Side</SelectItem>
                            <SelectItem value="floating">Floating</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Switch 
                          checked={panel.draggable}
                          onCheckedChange={() => togglePanelDraggable(panel.id)}
                          disabled={panel.position !== "floating"}
                          data-testid={`switch-panel-draggable-${panel.id}`}
                        />
                        <Label className="text-xs">Draggable</Label>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Theme
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
                  <SelectTrigger data-testid="select-theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark Mode</SelectItem>
                    <SelectItem value="light">Light Mode</SelectItem>
                    <SelectItem value="system">System Default</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Theme changes will apply on next refresh
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
