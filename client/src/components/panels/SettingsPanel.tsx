import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { Loader2, Save, RotateCcw, Plus, Trash2, Check, Wifi, WifiOff, Usb, Cable, Upload, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [connectionSettings, setConnectionSettings] = useState({
    connectionType: "usb",
    fcPort: "/dev/ttyACM0",
    fcBaud: "57600",
    fcAutoConnect: true,
    droneIp: "192.168.1.100",
    telemetryPort: "14550",
    wsEnabled: true,
    gpioTx: "14",
    gpioRx: "15",
    canBitrate: "1000000",
    canBusId: "1",
    canSplitterEnabled: false,
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
    exposure: "auto",
    whiteBalance: "auto",
    zoom: "1",
  });

  const [networkSettings, setNetworkSettings] = useState({
    deviceRole: "controller",
    syncEnabled: true,
    remoteIp: "",
    syncPort: "8080",
    encryptionEnabled: true,
  });

  const { data: savedConnectionSettings } = useQuery({
    queryKey: ["/api/settings/connection"],
  });

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
      for (const [key, value] of Object.entries(connectionSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "connection" });
      }
      for (const [key, value] of Object.entries(sensorSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "sensor" });
      }
      for (const [key, value] of Object.entries(inputSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "input" });
      }
      for (const [key, value] of Object.entries(cameraSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "camera" });
      }
      for (const [key, value] of Object.entries(networkSettings)) {
        await saveSetting.mutateAsync({ key, value, category: "network" });
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
      connectionType: "usb",
      fcPort: "/dev/ttyACM0",
      fcBaud: "57600",
      fcAutoConnect: true,
      droneIp: "192.168.1.100",
      telemetryPort: "14550",
      wsEnabled: true,
      gpioTx: "14",
      gpioRx: "15",
      canBitrate: "1000000",
      canBusId: "1",
      canSplitterEnabled: false,
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
      exposure: "auto",
      whiteBalance: "auto",
      zoom: "1",
    });
    setNetworkSettings({
      deviceRole: "controller",
      syncEnabled: true,
      remoteIp: "",
      syncPort: "8080",
      encryptionEnabled: true,
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

  const handleFirmwareSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.apj') || file.name.endsWith('.px4')) {
        setFirmwareFile(file);
        toast.success(`Selected: ${file.name}`);
      } else {
        toast.error("Please select a valid firmware file (.apj or .px4)");
      }
    }
  };

  const handleFirmwareUpload = async () => {
    if (!firmwareFile) {
      toast.error("Please select a firmware file first");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 500);

    setTimeout(() => {
      clearInterval(interval);
      setUploadProgress(100);
      setIsUploading(false);
      toast.success("Firmware upload complete! Orange Cube+ will reboot...");
      setFirmwareFile(null);
    }, 5000);
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            <TabsTrigger value="input">Input</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="firmware">Firmware</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Connection Type</CardTitle>
                <CardDescription>Select how to connect to the Orange Cube+ flight controller</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { id: "usb", label: "USB", icon: Usb, desc: "Direct USB connection" },
                    { id: "gpio", label: "GPIO UART", icon: Cable, desc: "Raspberry Pi GPIO pins" },
                    { id: "can", label: "CAN Bus", icon: Cable, desc: "CAN/CANS ports" },
                    { id: "wifi", label: "WiFi", icon: Wifi, desc: "WiFi telemetry" },
                  ].map((type) => (
                    <Button
                      key={type.id}
                      variant={connectionSettings.connectionType === type.id ? "default" : "outline"}
                      className="h-24 flex flex-col gap-2"
                      onClick={() => updateSetting(setConnectionSettings, "connectionType", type.id)}
                    >
                      <type.icon className="h-6 w-6" />
                      <span className="text-sm font-bold">{type.label}</span>
                      <span className="text-[10px] text-muted-foreground">{type.desc}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {connectionSettings.connectionType === "usb" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>USB Connection</CardTitle>
                      <CardDescription>Direct USB connection to Orange Cube+</CardDescription>
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
                      <Select
                        value={connectionSettings.fcPort}
                        onValueChange={(v) => updateSetting(setConnectionSettings, "fcPort", v)}
                      >
                        <SelectTrigger id="fc-port">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="/dev/ttyACM0">/dev/ttyACM0</SelectItem>
                          <SelectItem value="/dev/ttyACM1">/dev/ttyACM1</SelectItem>
                          <SelectItem value="/dev/ttyUSB0">/dev/ttyUSB0</SelectItem>
                          <SelectItem value="/dev/ttyUSB1">/dev/ttyUSB1</SelectItem>
                          <SelectItem value="/dev/serial0">/dev/serial0</SelectItem>
                        </SelectContent>
                      </Select>
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
            )}

            {connectionSettings.connectionType === "gpio" && (
              <Card>
                <CardHeader>
                  <CardTitle>Raspberry Pi GPIO UART</CardTitle>
                  <CardDescription>Connect via GPIO pins on Raspberry Pi</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>TX Pin (GPIO)</Label>
                      <Select
                        value={connectionSettings.gpioTx}
                        onValueChange={(v) => updateSetting(setConnectionSettings, "gpioTx", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="14">GPIO 14 (TXD)</SelectItem>
                          <SelectItem value="0">GPIO 0</SelectItem>
                          <SelectItem value="4">GPIO 4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>RX Pin (GPIO)</Label>
                      <Select
                        value={connectionSettings.gpioRx}
                        onValueChange={(v) => updateSetting(setConnectionSettings, "gpioRx", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">GPIO 15 (RXD)</SelectItem>
                          <SelectItem value="1">GPIO 1</SelectItem>
                          <SelectItem value="5">GPIO 5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Baud Rate</Label>
                    <Select 
                      value={connectionSettings.fcBaud}
                      onValueChange={(v) => updateSetting(setConnectionSettings, "fcBaud", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="57600">57600</SelectItem>
                        <SelectItem value="115200">115200</SelectItem>
                        <SelectItem value="921600">921600</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" className="w-full">Test GPIO Connection</Button>
                </CardContent>
              </Card>
            )}

            {connectionSettings.connectionType === "can" && (
              <Card>
                <CardHeader>
                  <CardTitle>CAN Bus Connection</CardTitle>
                  <CardDescription>Connect via Orange Cube+ CAN/CANS ports</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>CAN Bus ID</Label>
                      <Select
                        value={connectionSettings.canBusId}
                        onValueChange={(v) => updateSetting(setConnectionSettings, "canBusId", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">CAN 1</SelectItem>
                          <SelectItem value="2">CAN 2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Bitrate</Label>
                      <Select
                        value={connectionSettings.canBitrate}
                        onValueChange={(v) => updateSetting(setConnectionSettings, "canBitrate", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="500000">500 kbit/s</SelectItem>
                          <SelectItem value="1000000">1 Mbit/s</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>CAN Splitter Enabled</Label>
                      <p className="text-xs text-muted-foreground">Using CAN splitter for multiple devices</p>
                    </div>
                    <Switch 
                      checked={connectionSettings.canSplitterEnabled}
                      onCheckedChange={(v) => updateSetting(setConnectionSettings, "canSplitterEnabled", v)}
                    />
                  </div>
                  <Button variant="outline" className="w-full">Test CAN Connection</Button>
                </CardContent>
              </Card>
            )}

            {connectionSettings.connectionType === "wifi" && (
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
                  <Button variant="outline" className="w-full">Test WiFi Connection</Button>
                </CardContent>
              </Card>
            )}
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
                            <SelectItem value="can">CAN</SelectItem>
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
                    <Label>Resolution</Label>
                    <Select 
                      value={cameraSettings.resolution}
                      onValueChange={(v) => updateSetting(setCameraSettings, "resolution", v)}
                    >
                      <SelectTrigger>
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
                    <Label>Frame Rate</Label>
                    <Select 
                      value={cameraSettings.fps}
                      onValueChange={(v) => updateSetting(setCameraSettings, "fps", v)}
                    >
                      <SelectTrigger>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Exposure</Label>
                    <Select 
                      value={cameraSettings.exposure}
                      onValueChange={(v) => updateSetting(setCameraSettings, "exposure", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="1/60">1/60</SelectItem>
                        <SelectItem value="1/125">1/125</SelectItem>
                        <SelectItem value="1/250">1/250</SelectItem>
                        <SelectItem value="1/500">1/500</SelectItem>
                        <SelectItem value="1/1000">1/1000</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>White Balance</Label>
                    <Select 
                      value={cameraSettings.whiteBalance}
                      onValueChange={(v) => updateSetting(setCameraSettings, "whiteBalance", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="daylight">Daylight</SelectItem>
                        <SelectItem value="cloudy">Cloudy</SelectItem>
                        <SelectItem value="tungsten">Tungsten</SelectItem>
                        <SelectItem value="fluorescent">Fluorescent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Digital Zoom ({cameraSettings.zoom}x)</Label>
                  <Input 
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={cameraSettings.zoom}
                    onChange={(e) => updateSetting(setCameraSettings, "zoom", e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Gimbal Smoothing ({cameraSettings.gimbalSmoothing}%)</Label>
                  <Input 
                    type="range"
                    min="0"
                    max="100"
                    value={cameraSettings.gimbalSmoothing}
                    onChange={(e) => updateSetting(setCameraSettings, "gimbalSmoothing", e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Auto-record on takeoff</Label>
                  <Switch 
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
                  <Label>Color Palette</Label>
                  <Select 
                    value={cameraSettings.thermalPalette}
                    onValueChange={(v) => updateSetting(setCameraSettings, "thermalPalette", v)}
                  >
                    <SelectTrigger>
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

          <TabsContent value="network" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Multi-Device Sync</CardTitle>
                <CardDescription>Configure this device's role in the GCS network</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Device Role</Label>
                  <Select 
                    value={networkSettings.deviceRole}
                    onValueChange={(v) => updateSetting(setNetworkSettings, "deviceRole", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="controller">Primary Controller (Raspberry Pi)</SelectItem>
                      <SelectItem value="remote">Remote Client (Laptop/Tablet)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {networkSettings.deviceRole === "remote" && (
                  <div className="space-y-2">
                    <Label>Controller IP Address</Label>
                    <Input 
                      value={networkSettings.remoteIp}
                      onChange={(e) => updateSetting(setNetworkSettings, "remoteIp", e.target.value)}
                      placeholder="192.168.1.100"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Sync Port</Label>
                  <Input 
                    type="number"
                    value={networkSettings.syncPort}
                    onChange={(e) => updateSetting(setNetworkSettings, "syncPort", e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Sync</Label>
                    <p className="text-xs text-muted-foreground">Synchronize telemetry and commands</p>
                  </div>
                  <Switch 
                    checked={networkSettings.syncEnabled}
                    onCheckedChange={(v) => updateSetting(setNetworkSettings, "syncEnabled", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Encrypted Connection</Label>
                    <p className="text-xs text-muted-foreground">Use TLS for secure communication</p>
                  </div>
                  <Switch 
                    checked={networkSettings.encryptionEnabled}
                    onCheckedChange={(v) => updateSetting(setNetworkSettings, "encryptionEnabled", v)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="firmware" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <CardTitle>ArduPilot Firmware Upload</CardTitle>
                </div>
                <CardDescription>
                  Upload ArduPilot firmware to Orange Cube+ flight controller. 
                  This will erase existing firmware and require a reboot.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current Firmware:</span>
                    <span className="font-mono">ArduCopter v4.4.0</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Board:</span>
                    <span className="font-mono">CubeOrangePlus</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Bootloader:</span>
                    <Badge className="bg-emerald-500/20 text-emerald-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Compatible
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label>Select Firmware File (.apj or .px4)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="file"
                      accept=".apj,.px4"
                      ref={fileInputRef}
                      onChange={handleFirmwareSelect}
                      className="hidden"
                    />
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {firmwareFile ? firmwareFile.name : "Choose File"}
                    </Button>
                  </div>

                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Uploading firmware...</span>
                        <span className="font-mono">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}

                  <Button 
                    className="w-full" 
                    disabled={!firmwareFile || isUploading}
                    onClick={handleFirmwareUpload}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Firmware to Orange Cube+
                      </>
                    )}
                  </Button>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-500">Warning</p>
                      <p className="text-muted-foreground mt-1">
                        Firmware upload will disconnect the flight controller. Ensure the drone is 
                        powered and not flying. Do not disconnect power during upload.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Download Official Firmware</CardTitle>
                <CardDescription>Get the latest ArduPilot firmware for your board</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="https://firmware.ardupilot.org/Copter/stable/CubeOrangePlus/" target="_blank" rel="noopener">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    ArduCopter Stable (Recommended)
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href="https://firmware.ardupilot.org/Copter/latest/CubeOrangePlus/" target="_blank" rel="noopener">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    ArduCopter Latest (Beta)
                  </a>
                </Button>
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
