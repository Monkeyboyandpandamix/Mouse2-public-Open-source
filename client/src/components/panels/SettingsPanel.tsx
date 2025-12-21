import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Loader2, Save, RotateCcw, Plus, Trash2, Check, Wifi, WifiOff } from "lucide-react";

interface SettingValue {
  [key: string]: any;
}

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  
  // Local state for all settings
  const [connectionSettings, setConnectionSettings] = useState({
    fcPort: "/dev/ttyACM0",
    fcBaud: "57600",
    fcAutoConnect: true,
    droneIp: "192.168.1.100",
    telemetryPort: "14550",
    wsEnabled: true,
  });

  const [sensorSettings, setSensorSettings] = useState({
    lidarAddress: "0x62",
    lidarRate: "10",
    lidarEnabled: true,
    gpsCanId: "1",
    gpsEnabled: true,
    customSensors: [] as { name: string; type: string; address: string }[],
  });

  const [inputSettings, setInputSettings] = useState({
    rcProtocol: "sbus",
    rcFailsafe: true,
    gamepadDevice: "none",
    joystickDeadzone: "5",
  });

  const [cameraSettings, setCameraSettings] = useState({
    resolution: "1080p",
    fps: "30",
    autoRecord: false,
    thermalPalette: "ironbow",
    gimbalSmoothing: "50",
  });

  // Fetch existing settings from database
  const { data: savedConnectionSettings } = useQuery({
    queryKey: ["/api/settings/connection"],
  });

  const { data: savedSensorSettings } = useQuery({
    queryKey: ["/api/settings/sensor"],
  });

  const { data: savedInputSettings } = useQuery({
    queryKey: ["/api/settings/input"],
  });

  const { data: savedCameraSettings } = useQuery({
    queryKey: ["/api/settings/camera"],
  });

  // Load saved settings when available
  useEffect(() => {
    if (savedConnectionSettings && Array.isArray(savedConnectionSettings) && savedConnectionSettings.length > 0) {
      const settings: any = {};
      savedConnectionSettings.forEach((s: any) => {
        settings[s.key] = s.value;
      });
      if (Object.keys(settings).length > 0) {
        setConnectionSettings(prev => ({ ...prev, ...settings }));
      }
    }
  }, [savedConnectionSettings]);

  // Save setting mutation
  const saveSetting = useMutation({
    mutationFn: async ({ key, value, category }: { key: string; value: any; category: string }) => {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, category }),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      return res.json();
    },
  });

  const handleSaveAll = async () => {
    try {
      // Save connection settings
      for (const [key, value] of Object.entries(connectionSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "connection" });
      }
      
      // Save sensor settings
      for (const [key, value] of Object.entries(sensorSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "sensor" });
      }
      
      // Save input settings
      for (const [key, value] of Object.entries(inputSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "input" });
      }
      
      // Save camera settings
      for (const [key, value] of Object.entries(cameraSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "camera" });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      setUnsavedChanges(false);
      toast.success("All settings saved successfully");
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const handleReset = () => {
    setConnectionSettings({
      fcPort: "/dev/ttyACM0",
      fcBaud: "57600",
      fcAutoConnect: true,
      droneIp: "192.168.1.100",
      telemetryPort: "14550",
      wsEnabled: true,
    });
    setSensorSettings({
      lidarAddress: "0x62",
      lidarRate: "10",
      lidarEnabled: true,
      gpsCanId: "1",
      gpsEnabled: true,
      customSensors: [],
    });
    setInputSettings({
      rcProtocol: "sbus",
      rcFailsafe: true,
      gamepadDevice: "none",
      joystickDeadzone: "5",
    });
    setCameraSettings({
      resolution: "1080p",
      fps: "30",
      autoRecord: false,
      thermalPalette: "ironbow",
      gimbalSmoothing: "50",
    });
    setUnsavedChanges(true);
    toast.info("Settings reset to defaults");
  };

  const updateSetting = (setter: any, key: string, value: any) => {
    setter((prev: any) => ({ ...prev, [key]: value }));
    setUnsavedChanges(true);
  };

  const addCustomSensor = () => {
    setSensorSettings(prev => ({
      ...prev,
      customSensors: [...prev.customSensors, { name: "", type: "i2c", address: "" }],
    }));
    setUnsavedChanges(true);
  };

  const removeCustomSensor = (index: number) => {
    setSensorSettings(prev => ({
      ...prev,
      customSensors: prev.customSensors.filter((_, i) => i !== index),
    }));
    setUnsavedChanges(true);
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight font-sans">System Settings</h2>
            <p className="text-muted-foreground">Configure drone connections, sensors, and input devices</p>
          </div>
          {unsavedChanges && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
              Unsaved changes
            </Badge>
          )}
        </div>

        <Tabs defaultValue="connections" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            <TabsTrigger value="input">Input Devices</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Orange Cube+ Connection</CardTitle>
                    <CardDescription>Flight controller serial connection settings</CardDescription>
                  </div>
                  <Badge variant="outline" className="gap-1">
                    <WifiOff className="h-3 w-3" /> Disconnected
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fc-port">Serial Port</Label>
                    <Input 
                      id="fc-port" 
                      value={connectionSettings.fcPort}
                      onChange={(e) => updateSetting(setConnectionSettings, "fcPort", e.target.value)}
                      placeholder="/dev/ttyACM0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fc-baud">Baud Rate</Label>
                    <Select 
                      value={connectionSettings.fcBaud}
                      onValueChange={(v) => updateSetting(setConnectionSettings, "fcBaud", v)}
                    >
                      <SelectTrigger id="fc-baud">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9600">9600</SelectItem>
                        <SelectItem value="57600">57600</SelectItem>
                        <SelectItem value="115200">115200</SelectItem>
                        <SelectItem value="921600">921600</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="fc-auto">Auto-connect on startup</Label>
                  <Switch 
                    id="fc-auto" 
                    checked={connectionSettings.fcAutoConnect}
                    onCheckedChange={(v) => updateSetting(setConnectionSettings, "fcAutoConnect", v)}
                  />
                </div>
                <Button variant="outline" className="w-full">Test Connection</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WiFi Telemetry Link</CardTitle>
                <CardDescription>Ground station to Raspberry Pi communication</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wifi-ip">Drone IP Address</Label>
                    <Input 
                      id="wifi-ip" 
                      value={connectionSettings.droneIp}
                      onChange={(e) => updateSetting(setConnectionSettings, "droneIp", e.target.value)}
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wifi-port">Telemetry Port</Label>
                    <Input 
                      id="wifi-port" 
                      type="number"
                      value={connectionSettings.telemetryPort}
                      onChange={(e) => updateSetting(setConnectionSettings, "telemetryPort", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ws-enable">Enable WebSocket streaming</Label>
                  <Switch 
                    id="ws-enable" 
                    checked={connectionSettings.wsEnabled}
                    onCheckedChange={(v) => updateSetting(setConnectionSettings, "wsEnabled", v)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sensors" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>LiDAR Sensor (I2C Port 2)</CardTitle>
                <CardDescription>Precision distance and obstacle detection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lidar-addr">I2C Address</Label>
                    <Input 
                      id="lidar-addr" 
                      value={sensorSettings.lidarAddress}
                      onChange={(e) => updateSetting(setSensorSettings, "lidarAddress", e.target.value)}
                      placeholder="0x62"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lidar-rate">Update Rate (Hz)</Label>
                    <Input 
                      id="lidar-rate" 
                      type="number"
                      value={sensorSettings.lidarRate}
                      onChange={(e) => updateSetting(setSensorSettings, "lidarRate", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="lidar-enable">Enable LiDAR</Label>
                  <Switch 
                    id="lidar-enable" 
                    checked={sensorSettings.lidarEnabled}
                    onCheckedChange={(v) => updateSetting(setSensorSettings, "lidarEnabled", v)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>HERE3+ GPS/Compass (CAN 2)</CardTitle>
                <CardDescription>Navigation and positioning system</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gps-can">CAN Bus ID</Label>
                  <Input 
                    id="gps-can" 
                    type="number"
                    value={sensorSettings.gpsCanId}
                    onChange={(e) => updateSetting(setSensorSettings, "gpsCanId", e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="gps-enable">Enable GPS</Label>
                  <Switch 
                    id="gps-enable" 
                    checked={sensorSettings.gpsEnabled}
                    onCheckedChange={(v) => updateSetting(setSensorSettings, "gpsEnabled", v)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Additional Sensors</CardTitle>
                    <CardDescription>Custom sensor configurations</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={addCustomSensor}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Sensor
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sensorSettings.customSensors.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No custom sensors configured. Click "Add Sensor" to add one.
                  </p>
                ) : (
                  sensorSettings.customSensors.map((sensor, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1 space-y-2">
                        <Label>Sensor Name</Label>
                        <Input
                          value={sensor.name}
                          onChange={(e) => {
                            const updated = [...sensorSettings.customSensors];
                            updated[index].name = e.target.value;
                            setSensorSettings(prev => ({ ...prev, customSensors: updated }));
                            setUnsavedChanges(true);
                          }}
                          placeholder="e.g., Rangefinder"
                        />
                      </div>
                      <div className="w-32 space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={sensor.type}
                          onValueChange={(v) => {
                            const updated = [...sensorSettings.customSensors];
                            updated[index].type = v;
                            setSensorSettings(prev => ({ ...prev, customSensors: updated }));
                            setUnsavedChanges(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="i2c">I2C</SelectItem>
                            <SelectItem value="spi">SPI</SelectItem>
                            <SelectItem value="uart">UART</SelectItem>
                            <SelectItem value="gpio">GPIO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32 space-y-2">
                        <Label>Address</Label>
                        <Input
                          value={sensor.address}
                          onChange={(e) => {
                            const updated = [...sensorSettings.customSensors];
                            updated[index].address = e.target.value;
                            setSensorSettings(prev => ({ ...prev, customSensors: updated }));
                            setUnsavedChanges(true);
                          }}
                          placeholder="0x00"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomSensor(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="input" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>RC Controller</CardTitle>
                <CardDescription>Radio control transmitter configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rc-protocol">Protocol</Label>
                  <Select 
                    value={inputSettings.rcProtocol}
                    onValueChange={(v) => updateSetting(setInputSettings, "rcProtocol", v)}
                  >
                    <SelectTrigger id="rc-protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sbus">S.BUS</SelectItem>
                      <SelectItem value="ppm">PPM</SelectItem>
                      <SelectItem value="spektrum">Spektrum</SelectItem>
                      <SelectItem value="crossfire">TBS Crossfire</SelectItem>
                      <SelectItem value="elrs">ExpressLRS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="rc-failsafe">Enable failsafe (RTL on signal loss)</Label>
                  <Switch 
                    id="rc-failsafe" 
                    checked={inputSettings.rcFailsafe}
                    onCheckedChange={(v) => updateSetting(setInputSettings, "rcFailsafe", v)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gamepad/Joystick</CardTitle>
                <CardDescription>USB controller for manual override</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gamepad">Connected Device</Label>
                  <Select 
                    value={inputSettings.gamepadDevice}
                    onValueChange={(v) => updateSetting(setInputSettings, "gamepadDevice", v)}
                  >
                    <SelectTrigger id="gamepad">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None detected</SelectItem>
                      <SelectItem value="xbox">Xbox Controller</SelectItem>
                      <SelectItem value="ps4">PlayStation 4 Controller</SelectItem>
                      <SelectItem value="ps5">PlayStation 5 Controller</SelectItem>
                      <SelectItem value="logitech">Logitech Gamepad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadzone">Joystick Deadzone (%)</Label>
                  <Input 
                    id="deadzone" 
                    type="number"
                    min="0"
                    max="20"
                    value={inputSettings.joystickDeadzone}
                    onChange={(e) => updateSetting(setInputSettings, "joystickDeadzone", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="camera" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Gimbal Camera</CardTitle>
                <CardDescription>Main camera video stream settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cam-res">Resolution</Label>
                    <Select 
                      value={cameraSettings.resolution}
                      onValueChange={(v) => updateSetting(setCameraSettings, "resolution", v)}
                    >
                      <SelectTrigger id="cam-res">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="480p">854x480 (480p)</SelectItem>
                        <SelectItem value="720p">1280x720 (720p)</SelectItem>
                        <SelectItem value="1080p">1920x1080 (1080p)</SelectItem>
                        <SelectItem value="4k">3840x2160 (4K)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cam-fps">Frame Rate</Label>
                    <Select 
                      value={cameraSettings.fps}
                      onValueChange={(v) => updateSetting(setCameraSettings, "fps", v)}
                    >
                      <SelectTrigger id="cam-fps">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">24 FPS</SelectItem>
                        <SelectItem value="30">30 FPS</SelectItem>
                        <SelectItem value="60">60 FPS</SelectItem>
                        <SelectItem value="120">120 FPS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gimbal-smooth">Gimbal Smoothing (%)</Label>
                  <Input 
                    id="gimbal-smooth" 
                    type="number"
                    min="0"
                    max="100"
                    value={cameraSettings.gimbalSmoothing}
                    onChange={(e) => updateSetting(setCameraSettings, "gimbalSmoothing", e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="cam-record">Auto-record on takeoff</Label>
                  <Switch 
                    id="cam-record" 
                    checked={cameraSettings.autoRecord}
                    onCheckedChange={(v) => updateSetting(setCameraSettings, "autoRecord", v)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Thermal Camera</CardTitle>
                <CardDescription>Thermal imaging settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="thermal-palette">Color Palette</Label>
                  <Select 
                    value={cameraSettings.thermalPalette}
                    onValueChange={(v) => updateSetting(setCameraSettings, "thermalPalette", v)}
                  >
                    <SelectTrigger id="thermal-palette">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ironbow">Ironbow</SelectItem>
                      <SelectItem value="rainbow">Rainbow</SelectItem>
                      <SelectItem value="grayscale">Grayscale</SelectItem>
                      <SelectItem value="arctic">Arctic</SelectItem>
                      <SelectItem value="lava">Lava</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex gap-4">
          <Button 
            className="flex-1" 
            size="lg" 
            onClick={handleSaveAll}
            disabled={saveSetting.isPending}
          >
            {saveSetting.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save All Settings
          </Button>
          <Button variant="outline" size="lg" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
