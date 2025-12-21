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
import { Loader2, Save, RotateCcw, Plus, Trash2, Check, Wifi, WifiOff, Usb, Cable, Upload, AlertTriangle, CheckCircle, RefreshCw, Cloud, Database, ExternalLink, Cpu, Radio, Terminal, HardDrive } from "lucide-react";
import { operationsLog, LogEntry, LogType } from "@/lib/operationsLog";
import { ScrollArea } from "@/components/ui/scroll-area";

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
    customSensors: [] as { name: string; type: string; address: string; port: string }[],
    // Orange Cube+ Ports
    i2c1Enabled: true,
    i2c2Enabled: true,
    spi1Enabled: false,
    spi2Enabled: false,
    uart1Protocol: "mavlink",
    uart2Protocol: "gps",
    uart3Protocol: "none",
    uart4Protocol: "none",
    can1Enabled: true,
    can2Enabled: true,
    adc1Enabled: true,
    adc2Enabled: false,
    pwmOutputs: "8",
    // Raspberry Pi GPIO
    gpioSpeaker: "18",
    gpioLed: "23",
    gpioRelay: "24",
    gpioButton: "25",
    // USB Devices
    usbCamera: "/dev/video0",
    usbGps: "none",
    usbRadio: "none",
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

  const [backupStatus, setBackupStatus] = useState<{
    connected: boolean;
    spreadsheetUrl?: string;
    lastSync?: string;
    syncing: boolean;
  }>({ connected: false, syncing: false });

  // Operations Console state
  const [operationsActive, setOperationsActive] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<LogType | 'all'>('all');
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Google Drive status
  const [driveStatus, setDriveStatus] = useState<{
    connected: boolean;
    email?: string;
    error?: string;
  }>({ connected: false });
  const [driveFiles, setDriveFiles] = useState<any[]>([]);

  const checkBackupStatus = async () => {
    try {
      const res = await fetch('/api/backup/google-sheets/status');
      const data = await res.json();
      setBackupStatus(prev => ({ ...prev, ...data }));
    } catch (error) {
      console.error('Failed to check backup status:', error);
    }
  };

  const triggerBackup = async () => {
    setBackupStatus(prev => ({ ...prev, syncing: true }));
    try {
      const res = await fetch('/api/backup/google-sheets', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setBackupStatus(prev => ({ 
          ...prev, 
          connected: true,
          spreadsheetUrl: data.spreadsheetUrl,
          lastSync: new Date().toISOString(),
          syncing: false 
        }));
        toast.success(`Backup complete! Synced: ${data.syncedTables.join(', ')}`);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error('Backup failed: ' + (error.message || 'Unknown error'));
      setBackupStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  useEffect(() => {
    checkBackupStatus();
    checkDriveStatus();
  }, []);

  const checkDriveStatus = async () => {
    try {
      const res = await fetch('/api/drive/status');
      const data = await res.json();
      setDriveStatus(data);
    } catch (error) {
      console.error('Failed to check Drive status:', error);
    }
  };

  const HARDWARE_PRESETS = {
    current: {
      name: "Current Configuration",
      description: "Your M.O.U.S.E drone setup",
      specs: {
        companion: "Raspberry Pi 5 (16GB) - Trixie 13.2",
        fc: "Orange Cube+ with ADSB Carrier Board",
        gps: "Here3+ GPS Module",
        lidar: "LW20/HA Lidar",
        gimbal: "Skydroid C12 2K (2560x1440 HD + 384x288 Thermal)",
        motors: "Mad Motors XP6S Arms (x4)",
      }
    }
  };

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
      i2c1Enabled: true,
      i2c2Enabled: true,
      spi1Enabled: false,
      spi2Enabled: false,
      uart1Protocol: "mavlink",
      uart2Protocol: "gps",
      uart3Protocol: "none",
      uart4Protocol: "none",
      can1Enabled: true,
      can2Enabled: true,
      adc1Enabled: true,
      adc2Enabled: false,
      pwmOutputs: "8",
      gpioSpeaker: "18",
      gpioLed: "23",
      gpioRelay: "24",
      gpioButton: "25",
      usbCamera: "/dev/video0",
      usbGps: "none",
      usbRadio: "none",
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
      customSensors: [...prev.customSensors, { name: "", type: "i2c", address: "", port: "1" }],
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

        <Tabs defaultValue="connections" className="w-full" onValueChange={(value) => {
          if (value === 'operations') {
            setOperationsActive(true);
            operationsLog.activate();
            const unsubscribe = operationsLog.subscribe(setLogEntries);
            return () => unsubscribe();
          } else {
            setOperationsActive(false);
            operationsLog.deactivate();
          }
        }}>
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="hardware">Hardware</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            <TabsTrigger value="input">Input</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="operations">Console</TabsTrigger>
          </TabsList>

          <TabsContent value="hardware" className="space-y-4 mt-4">
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Hardware Configuration
                </CardTitle>
                <CardDescription>Your M.O.U.S.E drone hardware specifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Companion Computer</Label>
                      <p className="font-medium text-sm">{HARDWARE_PRESETS.current.specs.companion}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Flight Controller</Label>
                      <p className="font-medium text-sm">{HARDWARE_PRESETS.current.specs.fc}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">GPS Module</Label>
                      <p className="font-medium text-sm">{HARDWARE_PRESETS.current.specs.gps}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Lidar Sensor</Label>
                      <p className="font-medium text-sm">{HARDWARE_PRESETS.current.specs.lidar}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Camera/Gimbal</Label>
                      <p className="font-medium text-sm">{HARDWARE_PRESETS.current.specs.gimbal}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Propulsion</Label>
                      <p className="font-medium text-sm">{HARDWARE_PRESETS.current.specs.motors}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Skydroid C12 Gimbal Settings</CardTitle>
                <CardDescription>2K HD Camera (2560x1440) + Thermal Imaging (384x288)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Primary Camera</Label>
                    <Select defaultValue="2k">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2k">2K HD (2560x1440)</SelectItem>
                        <SelectItem value="1080p">1080p (1920x1080)</SelectItem>
                        <SelectItem value="720p">720p (1280x720)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Thermal Resolution</Label>
                    <Select defaultValue="384x288">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="384x288">384x288 (Full)</SelectItem>
                        <SelectItem value="256x192">256x192</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Gimbal Lens</Label>
                    <Input defaultValue="7mm" disabled className="bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>LW20/HA Lidar Configuration</CardTitle>
                <CardDescription>High-accuracy laser altimeter settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>I2C Address</Label>
                    <Input 
                      value={sensorSettings.lidarAddress}
                      onChange={(e) => updateSetting(setSensorSettings, "lidarAddress", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Update Rate (Hz)</Label>
                    <Select 
                      value={sensorSettings.lidarRate}
                      onValueChange={(v) => updateSetting(setSensorSettings, "lidarRate", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Hz</SelectItem>
                        <SelectItem value="5">5 Hz</SelectItem>
                        <SelectItem value="10">10 Hz (Default)</SelectItem>
                        <SelectItem value="20">20 Hz</SelectItem>
                        <SelectItem value="50">50 Hz (Max)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={sensorSettings.lidarEnabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "lidarEnabled", v)}
                      />
                      <Label>Enabled</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Here3+ GPS Configuration</CardTitle>
                <CardDescription>CAN-connected GPS with compass</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>CAN Node ID</Label>
                    <Input 
                      value={sensorSettings.gpsCanId}
                      onChange={(e) => updateSetting(setSensorSettings, "gpsCanId", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Connection</Label>
                    <Input defaultValue="CAN1" disabled className="bg-muted" />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={sensorSettings.gpsEnabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "gpsEnabled", v)}
                      />
                      <Label>Enabled</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup" className="space-y-4 mt-4">
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cloud className="h-5 w-5" />
                      Google Sheets Backup
                    </CardTitle>
                    <CardDescription>Automatically backup all data to Google Sheets</CardDescription>
                  </div>
                  <Badge className={backupStatus.connected ? "bg-emerald-500" : "bg-amber-500"}>
                    {backupStatus.connected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">M.O.U.S.E GCS Backup</p>
                      <p className="text-sm text-muted-foreground">
                        Backs up missions, waypoints, flight logs, and settings
                      </p>
                    </div>
                    <Button 
                      onClick={triggerBackup}
                      disabled={backupStatus.syncing}
                    >
                      {backupStatus.syncing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Cloud className="h-4 w-4 mr-2" />
                          Backup Now
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {backupStatus.spreadsheetUrl && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={backupStatus.spreadsheetUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm flex items-center gap-1"
                      >
                        Open Spreadsheet <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  
                  {backupStatus.lastSync && (
                    <p className="text-xs text-muted-foreground">
                      Last backup: {new Date(backupStatus.lastSync).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Data Included in Backup:</Label>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Missions & Waypoints
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Flight Sessions
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Telemetry Logs
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      System Settings
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="storage" className="space-y-4 mt-4">
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="h-5 w-5" />
                      Google Drive Storage
                    </CardTitle>
                    <CardDescription>Store flight footage and recordings on Google Drive</CardDescription>
                  </div>
                  <Badge className={driveStatus.connected ? "bg-emerald-500" : "bg-amber-500"}>
                    {driveStatus.connected ? "Connected" : "Not Connected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {driveStatus.connected && driveStatus.email && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-sm text-muted-foreground">Signed in as:</p>
                    <p className="font-medium">{driveStatus.email}</p>
                  </div>
                )}

                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">MOUSE_GCS_Footage</p>
                      <p className="text-sm text-muted-foreground">
                        Flight recordings, thermal images, session videos
                      </p>
                    </div>
                    <Button 
                      variant="outline"
                      onClick={async () => {
                        const res = await fetch('/api/drive/files');
                        const data = await res.json();
                        if (data.success) {
                          setDriveFiles(data.files || []);
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </div>

                {driveFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Recent Files ({driveFiles.length}):</Label>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {driveFiles.slice(0, 10).map((file: any) => (
                        <div key={file.id} className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm">
                          <span className="truncate flex-1">{file.name}</span>
                          <a 
                            href={file.webViewLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 ml-2"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Storage includes:</Label>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Flight Recordings
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Thermal Captures
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Session Videos
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Log Bundles
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="space-y-4 mt-4">
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Terminal className="h-5 w-5" />
                      Operations Console
                    </CardTitle>
                    <CardDescription>Real-time system logs and operations</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={operationsActive ? "bg-emerald-500 animate-pulse" : "bg-gray-500"}>
                      {operationsActive ? "Active" : "Inactive"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => operationsLog.clear()}>
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  {(['all', 'websocket', 'api', 'system', 'error'] as const).map((type) => (
                    <Button
                      key={type}
                      variant={logFilter === type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLogFilter(type)}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Button>
                  ))}
                </div>

                <ScrollArea className="h-80 w-full rounded border bg-black/90 p-3 font-mono text-xs">
                  <div ref={logScrollRef} className="space-y-1">
                    {logEntries
                      .filter(e => logFilter === 'all' || e.type === logFilter)
                      .slice(-200)
                      .map((entry) => (
                        <div 
                          key={entry.id} 
                          className={`flex gap-2 ${
                            entry.type === 'error' ? 'text-red-400' :
                            entry.type === 'websocket' ? 'text-cyan-400' :
                            entry.type === 'api' ? 'text-amber-400' :
                            'text-green-400'
                          }`}
                        >
                          <span className="text-gray-500 shrink-0">
                            {entry.timestamp.toLocaleTimeString()}
                          </span>
                          <span className="text-gray-600 shrink-0">[{entry.type.toUpperCase()}]</span>
                          <span className="text-gray-400 shrink-0">{entry.category}:</span>
                          <span className="break-all">{entry.message}</span>
                        </div>
                      ))}
                    {logEntries.length === 0 && (
                      <div className="text-gray-500 text-center py-8">
                        No log entries yet. Console will capture events while this tab is open.
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <p className="text-xs text-muted-foreground">
                  Console only captures events while this tab is open to conserve memory.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

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
            {/* Orange Cube+ Ports */}
            <Card>
              <CardHeader>
                <CardTitle>Orange Cube+ I/O Ports</CardTitle>
                <CardDescription>Configure flight controller input/output ports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-sm">I2C Buses</h4>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">I2C 1 (External)</Label>
                      <Switch 
                        checked={sensorSettings.i2c1Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "i2c1Enabled", v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">I2C 2 (Internal)</Label>
                      <Switch 
                        checked={sensorSettings.i2c2Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "i2c2Enabled", v)}
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-sm">SPI Buses</h4>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">SPI 1 (External)</Label>
                      <Switch 
                        checked={sensorSettings.spi1Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "spi1Enabled", v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">SPI 2 (Internal)</Label>
                      <Switch 
                        checked={sensorSettings.spi2Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "spi2Enabled", v)}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="font-medium text-sm">UART/Serial Ports</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {["uart1", "uart2", "uart3", "uart4"].map((uart, idx) => (
                      <div key={uart} className="space-y-2">
                        <Label>TELEM{idx + 1} / UART{idx + 1}</Label>
                        <Select 
                          value={(sensorSettings as any)[`${uart}Protocol`]}
                          onValueChange={(v) => updateSetting(setSensorSettings, `${uart}Protocol`, v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Disabled</SelectItem>
                            <SelectItem value="mavlink">MAVLink</SelectItem>
                            <SelectItem value="gps">GPS</SelectItem>
                            <SelectItem value="rangefinder">Rangefinder</SelectItem>
                            <SelectItem value="sbus">SBUS RC</SelectItem>
                            <SelectItem value="frsky">FrSky Telemetry</SelectItem>
                            <SelectItem value="esc">ESC Telemetry</SelectItem>
                            <SelectItem value="lidar">LiDAR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-sm">CAN Buses</h4>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">CAN 1</Label>
                      <Switch 
                        checked={sensorSettings.can1Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "can1Enabled", v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">CAN 2</Label>
                      <Switch 
                        checked={sensorSettings.can2Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "can2Enabled", v)}
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-sm">ADC Inputs</h4>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">ADC 1 (Battery)</Label>
                      <Switch 
                        checked={sensorSettings.adc1Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "adc1Enabled", v)}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">ADC 2 (Analog)</Label>
                      <Switch 
                        checked={sensorSettings.adc2Enabled}
                        onCheckedChange={(v) => updateSetting(setSensorSettings, "adc2Enabled", v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>PWM Outputs (Main + Aux)</Label>
                  <Select 
                    value={sensorSettings.pwmOutputs}
                    onValueChange={(v) => updateSetting(setSensorSettings, "pwmOutputs", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 outputs</SelectItem>
                      <SelectItem value="6">6 outputs</SelectItem>
                      <SelectItem value="8">8 outputs (standard)</SelectItem>
                      <SelectItem value="14">14 outputs (with AUX)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Raspberry Pi GPIO */}
            <Card>
              <CardHeader>
                <CardTitle>Raspberry Pi GPIO</CardTitle>
                <CardDescription>Configure GPIO pins for peripherals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Speaker Output (PWM)</Label>
                    <Select 
                      value={sensorSettings.gpioSpeaker}
                      onValueChange={(v) => updateSetting(setSensorSettings, "gpioSpeaker", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">GPIO 12 (PWM0)</SelectItem>
                        <SelectItem value="13">GPIO 13 (PWM1)</SelectItem>
                        <SelectItem value="18">GPIO 18 (PWM0)</SelectItem>
                        <SelectItem value="19">GPIO 19 (PWM1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status LED</Label>
                    <Select 
                      value={sensorSettings.gpioLed}
                      onValueChange={(v) => updateSetting(setSensorSettings, "gpioLed", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Disabled</SelectItem>
                        <SelectItem value="22">GPIO 22</SelectItem>
                        <SelectItem value="23">GPIO 23</SelectItem>
                        <SelectItem value="27">GPIO 27</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Relay/Gripper Output</Label>
                    <Select 
                      value={sensorSettings.gpioRelay}
                      onValueChange={(v) => updateSetting(setSensorSettings, "gpioRelay", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Disabled</SelectItem>
                        <SelectItem value="24">GPIO 24</SelectItem>
                        <SelectItem value="25">GPIO 25</SelectItem>
                        <SelectItem value="26">GPIO 26</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Button Input</Label>
                    <Select 
                      value={sensorSettings.gpioButton}
                      onValueChange={(v) => updateSetting(setSensorSettings, "gpioButton", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Disabled</SelectItem>
                        <SelectItem value="5">GPIO 5</SelectItem>
                        <SelectItem value="6">GPIO 6</SelectItem>
                        <SelectItem value="25">GPIO 25</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* USB Devices */}
            <Card>
              <CardHeader>
                <CardTitle>USB Devices</CardTitle>
                <CardDescription>Configure USB-connected peripherals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>USB Camera</Label>
                    <Select 
                      value={sensorSettings.usbCamera}
                      onValueChange={(v) => updateSetting(setSensorSettings, "usbCamera", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="/dev/video0">/dev/video0</SelectItem>
                        <SelectItem value="/dev/video1">/dev/video1</SelectItem>
                        <SelectItem value="/dev/video2">/dev/video2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>USB GPS</Label>
                    <Select 
                      value={sensorSettings.usbGps}
                      onValueChange={(v) => updateSetting(setSensorSettings, "usbGps", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="/dev/ttyUSB0">/dev/ttyUSB0</SelectItem>
                        <SelectItem value="/dev/ttyUSB1">/dev/ttyUSB1</SelectItem>
                        <SelectItem value="/dev/ttyACM0">/dev/ttyACM0</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>USB Radio (SiK)</Label>
                    <Select 
                      value={sensorSettings.usbRadio}
                      onValueChange={(v) => updateSetting(setSensorSettings, "usbRadio", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="/dev/ttyUSB0">/dev/ttyUSB0</SelectItem>
                        <SelectItem value="/dev/ttyUSB1">/dev/ttyUSB1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sensors */}
            <Card>
              <CardHeader>
                <CardTitle>LiDAR Sensor</CardTitle>
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
                <CardTitle>HERE3+ GPS/Compass</CardTitle>
                <CardDescription>Navigation and positioning via CAN</CardDescription>
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

            {/* Custom Sensors */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Custom Sensors</CardTitle>
                    <CardDescription>Add additional sensors with any connection type</CardDescription>
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
                      <div className="w-28 space-y-2">
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
                            <SelectItem value="usb">USB</SelectItem>
                            <SelectItem value="adc">ADC</SelectItem>
                            <SelectItem value="pwm">PWM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20 space-y-2">
                        <Label>Port</Label>
                        <Input
                          value={sensor.port}
                          onChange={(e) => {
                            const updated = [...sensorSettings.customSensors];
                            updated[index].port = e.target.value;
                            setSensorSettings(prev => ({ ...prev, customSensors: updated }));
                            setUnsavedChanges(true);
                          }}
                          placeholder="1"
                        />
                      </div>
                      <div className="w-24 space-y-2">
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
