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
  Palette,
  Lock
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

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

interface CustomWidget {
  id: string;
  name: string;
  type: 'button' | 'display';
  targetPage: string;
  command?: string;
  displayValue?: string;
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
  const { hasPermission, isAdmin } = usePermissions();
  const canConfigureGUI = hasPermission('configure_gui_advanced');
  const canCreateDelete = isAdmin();
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

  // Apply theme immediately when changed
  useEffect(() => {
    localStorage.setItem('mouse_theme', theme);
    
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    }
    
    window.dispatchEvent(new CustomEvent('gui-config-changed', { detail: { theme } }));
  }, [theme]);
  
  const [customWidgets, setCustomWidgets] = useState<CustomWidget[]>(() => {
    const saved = localStorage.getItem('mouse_gui_widgets');
    return saved ? JSON.parse(saved) : [];
  });
  const [newWidget, setNewWidget] = useState<Partial<CustomWidget>>({
    name: '',
    type: 'button',
    targetPage: 'map',
    command: ''
  });

  useEffect(() => {
    localStorage.setItem('mouse_gui_widgets', JSON.stringify(customWidgets));
    window.dispatchEvent(new CustomEvent('gui-config-changed', { detail: { widgets: customWidgets } }));
  }, [customWidgets]);

  const addCustomWidget = () => {
    if (!canCreateDelete) {
      toast.error("Only administrators can create widgets");
      return;
    }
    if (!newWidget.name?.trim()) {
      toast.error("Please enter a widget name");
      return;
    }
    if (newWidget.type === 'button' && !newWidget.command?.trim()) {
      toast.error("Please enter a command for the button");
      return;
    }
    const widget: CustomWidget = {
      id: `widget_${Date.now()}`,
      name: newWidget.name,
      type: newWidget.type || 'button',
      targetPage: newWidget.targetPage || 'map',
      command: newWidget.command,
      displayValue: newWidget.displayValue
    };
    setCustomWidgets(prev => [...prev, widget]);
    setNewWidget({ name: '', type: 'button', targetPage: 'map', command: '' });
    toast.success(`Widget "${widget.name}" added to ${widget.targetPage} page`);
  };

  const deleteWidget = (id: string) => {
    if (!canCreateDelete) {
      toast.error("Only administrators can delete widgets");
      return;
    }
    setCustomWidgets(prev => prev.filter(w => w.id !== id));
    toast.success("Widget deleted");
  };

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
    if (!canCreateDelete) {
      toast.error("Only administrators can delete tabs");
      return;
    }
    const tab = tabs.find(t => t.id === id);
    if (!tab?.isCustom) {
      toast.error("Cannot delete built-in tabs");
      return;
    }
    setTabs(prev => prev.filter(t => t.id !== id));
    toast.success("Tab deleted");
  };

  const addCustomTab = () => {
    if (!canCreateDelete) {
      toast.error("Only administrators can create tabs");
      return;
    }
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

  const saveSettings = async () => {
    localStorage.setItem('mouse_gui_tabs', JSON.stringify(tabs));
    localStorage.setItem('mouse_gui_panels', JSON.stringify(panels));
    localStorage.setItem('mouse_theme', theme);
    localStorage.setItem('mouse_gui_widgets', JSON.stringify(customWidgets));
    
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
    
    // Backup to Google Sheets (non-blocking)
    try {
      await fetch('/api/backup/gui-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs, panels, widgets: customWidgets, theme })
      });
    } catch (e) {
      // Silent fail - backup is optional
      console.log('GUI config backup skipped (Google not connected)');
    }
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

  // Show permission denied if user doesn't have access
  if (!canConfigureGUI) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access GUI configuration.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

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
                        {tab.isCustom && canCreateDelete && (
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

              {canCreateDelete && (
                <>
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
                </>
              )}
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
                  Theme changes apply immediately
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-2 border-primary/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Custom Widgets
            </CardTitle>
            <CardDescription>Add custom buttons and displays to pages connected to terminal commands</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {customWidgets.length > 0 && (
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {customWidgets.map(widget => (
                    <div 
                      key={widget.id}
                      className="flex items-center justify-between p-2 rounded border bg-muted/30"
                      data-testid={`widget-${widget.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {widget.type}
                        </Badge>
                        <span className="font-medium text-sm">{widget.name}</span>
                        <span className="text-xs text-muted-foreground">→ {widget.targetPage}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono max-w-32 truncate">
                          {widget.command}
                        </span>
                        {canCreateDelete && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteWidget(widget.id)}
                            data-testid={`button-delete-widget-${widget.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {canCreateDelete && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>Add New Widget</Label>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Widget Name</Label>
                      <Input 
                        placeholder="e.g., Arm Drone"
                        value={newWidget.name || ''}
                        onChange={(e) => setNewWidget(prev => ({ ...prev, name: e.target.value }))}
                        data-testid="input-widget-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Select 
                        value={newWidget.type} 
                        onValueChange={(v) => setNewWidget(prev => ({ ...prev, type: v as 'button' | 'display' }))}
                      >
                        <SelectTrigger data-testid="select-widget-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="button">Button</SelectItem>
                          <SelectItem value="display">Display</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Target Page</Label>
                      <Select 
                        value={newWidget.targetPage} 
                        onValueChange={(v) => setNewWidget(prev => ({ ...prev, targetPage: v }))}
                      >
                        <SelectTrigger data-testid="select-widget-page">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tabs.filter(t => t.visible).map(tab => (
                            <SelectItem key={tab.id} value={tab.id}>{tab.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Command</Label>
                      <div className="flex gap-1">
                        <Input 
                          placeholder="mavlink_shell '...'"
                          value={newWidget.command || ''}
                          onChange={(e) => setNewWidget(prev => ({ ...prev, command: e.target.value }))}
                          data-testid="input-widget-command"
                        />
                        <Button onClick={addCustomWidget} data-testid="button-add-widget">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Widgets will appear as clickable buttons on the selected page. Clicking them will execute the terminal command.
                  </p>
                </div>
              </>
            )}
            {!canCreateDelete && customWidgets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No custom widgets have been created. Only administrators can create custom widgets.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
