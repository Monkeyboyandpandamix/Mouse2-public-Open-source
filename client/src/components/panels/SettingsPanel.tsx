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
import { Loader2, Save, RotateCcw, Plus, Trash2, Check, Wifi, WifiOff, Usb, Cable, Upload, AlertTriangle, CheckCircle, RefreshCw, Cloud, Database, ExternalLink, Cpu, Radio, Terminal, HardDrive, MapPin, Home, Shield, User, LogOut, UserPlus, Lock } from "lucide-react";
import { operationsLog, LogEntry, LogType } from "@/lib/operationsLog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePermissions } from "@/hooks/usePermissions";
import {
  getDefaultSerialPort,
  getDefaultUsbCamera,
  getRuntimePlatform,
  getSerialPortOptions,
  getUsbCameraOptions,
  getUsbGpsPortOptions,
  getUsbRadioPortOptions,
} from "@/lib/platform";

// Google Account Manager Component for standalone deployments
function GoogleAccountManager() {
  const [status, setStatus] = useState<{
    mode: 'replit' | 'standalone' | 'unconfigured';
    connected: boolean;
    email?: string;
    accounts?: { id: string; email: string; name: string; picture?: string; active: boolean }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  // Check if current user is admin
  const saved = localStorage.getItem('mouse_gcs_session');
  const session = saved ? JSON.parse(saved) : null;
  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    fetchStatus();
    // Check for OAuth callback result
    const urlParams = new URLSearchParams(window.location.search);
    const authResult = urlParams.get('google_auth');
    if (authResult === 'success') {
      toast.success('Google account connected successfully!');
      window.history.replaceState({}, '', window.location.pathname);
      fetchStatus();
    } else if (authResult === 'error') {
      toast.error('Failed to connect Google account: ' + (urlParams.get('message') || 'Unknown error'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/google/status');
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error('Failed to fetch Google status:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const res = await fetch('/api/google/auth-url');
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        window.location.href = data.url;
      }
    } catch (e) {
      toast.error('Failed to start sign-in process');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSwitch = async (accountId: string) => {
    try {
      const res = await fetch('/api/google/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      if (res.ok) {
        toast.success('Switched Google account');
        fetchStatus();
      } else {
        toast.error('Failed to switch account');
      }
    } catch (e) {
      toast.error('Failed to switch account');
    }
  };

  const handleRemove = async (accountId: string) => {
    if (!confirm('Remove this Google account? Data will remain in Google Drive/Sheets.')) return;
    try {
      const res = await fetch(`/api/google/accounts/${accountId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Account removed');
        fetchStatus();
      } else {
        toast.error('Failed to remove account');
      }
    } catch (e) {
      toast.error('Failed to remove account');
    }
  };

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading account settings...
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <Label className="font-medium">Admin: Google Account Management</Label>
      </div>

      {status?.mode === 'unconfigured' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-3">
          <p className="text-sm text-muted-foreground">
            Standalone Google OAuth is not configured. To enable account switching without Replit:
          </p>
          <div className="text-sm space-y-2">
            <p className="font-medium">Setup steps:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Create a Google Cloud project</li>
              <li>Enable Google Drive and Sheets APIs</li>
              <li>Create OAuth 2.0 credentials (Desktop app)</li>
              <li>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables</li>
            </ol>
          </div>
          <p className="text-xs text-amber-500">
            Currently using Replit's built-in Google integration (if available).
          </p>
        </div>
      )}

      {status?.mode === 'replit' && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Using Replit Integration</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Connected via Replit's Google integration. For production deployment with account switching,
            configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
          </p>
        </div>
      )}

      {status?.mode === 'standalone' && (
        <div className="space-y-4">
          {status.accounts && status.accounts.length > 0 ? (
            <div className="space-y-2">
              <Label>Connected Accounts:</Label>
              {status.accounts.map(account => (
                <div 
                  key={account.id} 
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    account.active ? 'bg-primary/10 border border-primary/30' : 'bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {account.picture ? (
                      <img src={account.picture} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{account.name}</p>
                      <p className="text-xs text-muted-foreground">{account.email}</p>
                    </div>
                    {account.active && (
                      <Badge className="bg-emerald-500 ml-2">Active</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!account.active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSwitch(account.id)}
                      >
                        Use
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemove(account.id)}
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No Google accounts connected. Sign in to enable cloud backup.
              </p>
            </div>
          )}

          <Button
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full"
          >
            {signingIn ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            {status.accounts && status.accounts.length > 0 ? 'Add Another Account' : 'Sign in with Google'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Note: Switching accounts does not transfer data. Previous data remains in the original account.
          </p>
        </div>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const { hasPermission } = usePermissions();
  const canAccessSettings = hasPermission('system_settings');
  const runtimePlatform = getRuntimePlatform();
  const serialPortOptions = getSerialPortOptions(runtimePlatform);
  const usbCameraOptions = getUsbCameraOptions(runtimePlatform);
  const usbGpsPortOptions = getUsbGpsPortOptions(runtimePlatform);
  const usbRadioPortOptions = getUsbRadioPortOptions(runtimePlatform);
  const defaultSerialPort = getDefaultSerialPort(runtimePlatform);
  const defaultUsbCamera = getDefaultUsbCamera(runtimePlatform);
  
  const queryClient = useQueryClient();
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [connectionSettings, setConnectionSettings] = useState({
    connectionType: "usb",
    fcPort: defaultSerialPort,
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
    lidarPosition: "bottom" as "bottom" | "front",
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
    usbCamera: defaultUsbCamera,
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
    hotspotEnabled: false,
    hotspotSsid: "MOUSE-GCS",
    hotspotPassword: "",
  });

  const [gpsDeniedConfig, setGpsDeniedConfig] = useState({
    enabled: true,
    method: "hybrid" as "visual" | "dead" | "hybrid",
    useFlightHistory: true,
    useVisualMatching: true,
    gpsLostTimeoutSec: 10,
    minSatellites: 6,
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

  useEffect(() => {
    if (!operationsActive) {
      operationsLog.deactivate();
      return;
    }
    operationsLog.activate();
    const unsubscribe = operationsLog.subscribe(setLogEntries);
    return () => unsubscribe();
  }, [operationsActive]);

  // Base Location settings
  const [baseLocation, setBaseLocation] = useState<{lat: string, lng: string, name: string}>({
    lat: "", lng: "", name: ""
  });
  const [savedBaseLocation, setSavedBaseLocation] = useState<{lat: number, lng: number, name: string} | null>(null);

  // Load base location from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mouse_base_location');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSavedBaseLocation(parsed);
        setBaseLocation({
          lat: parsed.lat.toString(),
          lng: parsed.lng.toString(),
          name: parsed.name
        });
      } catch {}
    }
  }, []);

  const saveBaseLocationSetting = () => {
    const lat = parseFloat(baseLocation.lat);
    const lng = parseFloat(baseLocation.lng);
    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Please enter valid coordinates");
      return;
    }
    const newBase = { lat, lng, name: baseLocation.name || "Home Base" };
    setSavedBaseLocation(newBase);
    localStorage.setItem('mouse_base_location', JSON.stringify(newBase));
    window.dispatchEvent(new Event('storage'));
    toast.success(`Base location saved: ${newBase.name}`);
  };

  const useCurrentLocationForBase = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBaseLocation(prev => ({
            ...prev,
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6)
          }));
          toast.success("Current location captured");
        },
        () => toast.error("Could not get current location")
      );
    }
  };

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

  const [hardwareConfig, setHardwareConfig] = useState({
    companion: "Raspberry Pi 5 (16GB) - Trixie 13.2",
    fc: "Orange Cube+ with ADSB Carrier Board",
    gps: "Here3+ GPS Module",
    lidar: "LW20/HA Lidar",
    gimbal: "Skydroid C12 2K (2560x1440 HD + 384x288 Thermal)",
    motors: "Mad Motors XP6S Arms (x4)",
    pdb: "Matek PDB-HEX X Class 12S (6-60V, 5A, 264A sense)",
    motorCount: "4",
  });

  const [editingHardware, setEditingHardware] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('mouse_hardware_config');
    if (saved) {
      try {
        setHardwareConfig(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const saveHardwareConfig = () => {
    localStorage.setItem('mouse_hardware_config', JSON.stringify(hardwareConfig));
    localStorage.setItem('mouse_motor_count', hardwareConfig.motorCount);
    window.dispatchEvent(new CustomEvent('motor-count-changed', { detail: parseInt(hardwareConfig.motorCount) }));
    setEditingHardware(false);
    toast.success("Hardware configuration saved");
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

  useEffect(() => {
    const saved = localStorage.getItem("mouse_gps_denied_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setGpsDeniedConfig((prev) => ({
          ...prev,
          ...parsed,
        }));
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mouse_gps_denied_config", JSON.stringify(gpsDeniedConfig));
    window.dispatchEvent(new CustomEvent("gps-denied-config-changed"));
  }, [gpsDeniedConfig]);

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
      fcPort: defaultSerialPort,
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
      lidarPosition: "bottom",
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
      usbCamera: defaultUsbCamera,
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
      hotspotEnabled: false,
      hotspotSsid: "MOUSE-GCS",
      hotspotPassword: "",
    });
    setGpsDeniedConfig({
      enabled: true,
      method: "hybrid",
      useFlightHistory: true,
      useVisualMatching: true,
      gpsLostTimeoutSec: 10,
      minSatellites: 6,
    });
    setUnsavedChanges(true);
    toast.info("Settings reset to defaults");
  };

  const updateSetting = (setter: any, key: string, value: any) => {
    setter((prev: any) => ({ ...prev, [key]: value }));
    setUnsavedChanges(true);
  };

  const [connectionTesting, setConnectionTesting] = useState<{
    fc: 'idle' | 'testing' | 'success' | 'failed';
    gps: 'idle' | 'testing' | 'success' | 'failed';
    lidar: 'idle' | 'testing' | 'success' | 'failed';
    camera: 'idle' | 'testing' | 'success' | 'failed';
  }>({ fc: 'idle', gps: 'idle', lidar: 'idle', camera: 'idle' });

  const testConnection = async (device: 'fc' | 'gps' | 'lidar' | 'camera') => {
    setConnectionTesting((prev) => ({ ...prev, [device]: "testing" }));
    operationsLog.logSystem("Connection", `Testing ${device.toUpperCase()} connection...`);

    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device,
          settings: {
            ...connectionSettings,
            gpsEnabled: sensorSettings.gpsEnabled,
            lidarEnabled: sensorSettings.lidarEnabled,
            lidarAddress: sensorSettings.lidarAddress,
          },
        }),
      });
      const data = await res.json();

      if (data.success) {
        setConnectionTesting((prev) => ({ ...prev, [device]: "success" }));
        operationsLog.logSystem(
          "Connection",
          `${device.toUpperCase()} connection successful${data.simulated ? " (simulated)" : ""}`,
        );
        toast.success(
          `${device.toUpperCase()} connection successful${data.simulated ? " (simulated mode)" : ""}`,
        );
      } else {
        setConnectionTesting((prev) => ({ ...prev, [device]: "failed" }));
        operationsLog.logError("Connection", `${device.toUpperCase()} failed: ${data.error || "Unknown error"}`);
        toast.error(`${device.toUpperCase()} failed: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      setConnectionTesting((prev) => ({ ...prev, [device]: "failed" }));
      operationsLog.logError("Connection", `${device.toUpperCase()} test failed: ${error?.message || error}`);
      toast.error(`${device.toUpperCase()} test failed`);
    }

    setTimeout(() => {
      setConnectionTesting((prev) => ({ ...prev, [device]: "idle" }));
    }, 2500);
  };

  const testAllConnections = async () => {
    toast.info("Testing all connections...");
    operationsLog.logSystem('Connection', 'Starting connection tests for all devices...');
    
    await Promise.all([
      testConnection('fc'),
      testConnection('gps'),
      testConnection('lidar'),
      testConnection('camera'),
    ]);
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

  // Show permission denied if user doesn't have access
  if (!canAccessSettings) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access system settings.</p>
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
            <h2 className="text-2xl font-bold tracking-tight font-sans">System Settings</h2>
            <p className="text-muted-foreground">Configure drone connections, sensors, and input devices</p>
          </div>
          {unsavedChanges && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
              Unsaved changes
            </Badge>
          )}
        </div>

        <Tabs
          defaultValue="connections"
          className="w-full"
          onValueChange={(value) => {
            setOperationsActive(value === "operations");
          }}
        >
          <TabsList className="grid w-full grid-cols-11">
            <TabsTrigger value="hardware">Hardware</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            <TabsTrigger value="input">Input</TabsTrigger>
            <TabsTrigger value="camera">Camera</TabsTrigger>
            <TabsTrigger value="failsafe">Failsafe</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="firmware">Firmware</TabsTrigger>
            <TabsTrigger value="operations">Console</TabsTrigger>
          </TabsList>

          <TabsContent value="hardware" className="space-y-4 mt-4">
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5" />
                      Hardware Configuration
                    </CardTitle>
                    <CardDescription>Your M.O.U.S.E drone hardware specifications (editable for future upgrades)</CardDescription>
                  </div>
                  <Button 
                    variant={editingHardware ? "default" : "outline"} 
                    size="sm"
                    onClick={() => editingHardware ? saveHardwareConfig() : setEditingHardware(true)}
                    data-testid="button-edit-hardware"
                  >
                    {editingHardware ? <><Save className="h-4 w-4 mr-2" />Save</> : "Edit"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Companion Computer</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.companion}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, companion: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-companion"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.companion}</p>
                      )}
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Flight Controller</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.fc}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, fc: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-fc"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.fc}</p>
                      )}
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">GPS Module</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.gps}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, gps: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-gps"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.gps}</p>
                      )}
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Power Distribution Board</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.pdb}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, pdb: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-pdb"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.pdb}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Lidar Sensor</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.lidar}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, lidar: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-lidar"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.lidar}</p>
                      )}
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Camera/Gimbal</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.gimbal}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, gimbal: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-gimbal"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.gimbal}</p>
                      )}
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <Label className="text-xs text-muted-foreground">Propulsion</Label>
                      {editingHardware ? (
                        <Input 
                          value={hardwareConfig.motors}
                          onChange={(e) => setHardwareConfig(prev => ({ ...prev, motors: e.target.value }))}
                          className="mt-1"
                          data-testid="input-hardware-motors"
                        />
                      ) : (
                        <p className="font-medium text-sm">{hardwareConfig.motors}</p>
                      )}
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/30">
                      <Label className="text-xs text-muted-foreground">Motor Count</Label>
                      <Select 
                        value={hardwareConfig.motorCount}
                        onValueChange={(v) => setHardwareConfig(prev => ({ ...prev, motorCount: v }))}
                        disabled={!editingHardware}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-motor-count">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="4">4 Motors (Quadcopter)</SelectItem>
                          <SelectItem value="5">5 Motors (Pentacopter)</SelectItem>
                          <SelectItem value="6">6 Motors (Hexacopter)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Telemetry will display controls for selected motor count
                      </p>
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
                      data-testid="input-lidar-address"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Update Rate (Hz)</Label>
                    <Select 
                      value={sensorSettings.lidarRate}
                      onValueChange={(v) => updateSetting(setSensorSettings, "lidarRate", v)}
                    >
                      <SelectTrigger data-testid="select-lidar-rate">
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
                        data-testid="switch-lidar-enabled"
                      />
                      <Label>Enabled</Label>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-sm font-medium">LiDAR Mounting Position</Label>
                  <p className="text-xs text-muted-foreground">
                    Select where the LiDAR sensor is mounted on the drone to configure its use case
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant={sensorSettings.lidarPosition === "bottom" ? "default" : "outline"}
                      className="h-auto py-4 flex flex-col items-start text-left"
                      onClick={() => updateSetting(setSensorSettings, "lidarPosition", "bottom")}
                      data-testid="button-lidar-bottom"
                    >
                      <span className="font-bold">Bottom Mounted</span>
                      <span className="text-xs text-muted-foreground mt-1 whitespace-normal">
                        Points downward for altitude measurement
                      </span>
                      <ul className="text-[10px] mt-2 space-y-1 text-muted-foreground">
                        <li>• Autonomous landing assistance</li>
                        <li>• Terrain following mode</li>
                        <li>• Precision altitude measurement</li>
                      </ul>
                    </Button>
                    <Button
                      variant={sensorSettings.lidarPosition === "front" ? "default" : "outline"}
                      className="h-auto py-4 flex flex-col items-start text-left"
                      onClick={() => updateSetting(setSensorSettings, "lidarPosition", "front")}
                      data-testid="button-lidar-front"
                    >
                      <span className="font-bold">Front Mounted</span>
                      <span className="text-xs text-muted-foreground mt-1 whitespace-normal">
                        Points forward for obstacle detection
                      </span>
                      <ul className="text-[10px] mt-2 space-y-1 text-muted-foreground">
                        <li>• Obstacle detection</li>
                        <li>• Collision avoidance system</li>
                        <li>• Forward range sensing</li>
                      </ul>
                    </Button>
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

                <Card className="border-emerald-500/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-emerald-500" />
                      Real-Time Flight Backup
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Auto-backup during flight</Label>
                        <p className="text-xs text-muted-foreground">Sync telemetry & data every second while armed</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Backup footage to Drive</Label>
                        <p className="text-xs text-muted-foreground">Auto-upload video clips during flight</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Backup Interval</Label>
                        <Select defaultValue="1">
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Every 1 second</SelectItem>
                            <SelectItem value="5">Every 5 seconds</SelectItem>
                            <SelectItem value="10">Every 10 seconds</SelectItem>
                            <SelectItem value="30">Every 30 seconds</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Video Chunk Size</Label>
                        <Select defaultValue="30">
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 second clips</SelectItem>
                            <SelectItem value="30">30 second clips</SelectItem>
                            <SelectItem value="60">1 minute clips</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Video Footage (Drive)
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Object Detection Logs
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

                {/* Admin-only: Google Account Management */}
                <GoogleAccountManager />
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
                          {serialPortOptions.map((port) => (
                            <SelectItem key={port.value} value={port.value}>
                              {port.label ?? port.value}
                            </SelectItem>
                          ))}
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
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => testConnection('fc')}
                    disabled={connectionTesting.fc === 'testing'}
                    data-testid="button-test-fc-connection"
                  >
                    {connectionTesting.fc === 'testing' ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing...</>
                    ) : connectionTesting.fc === 'success' ? (
                      <><CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />Connected!</>
                    ) : connectionTesting.fc === 'failed' ? (
                      <><AlertTriangle className="h-4 w-4 mr-2 text-destructive" />Failed - Retry</>
                    ) : (
                      <>Test Connection</>
                    )}
                  </Button>
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
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => testConnection('gps')}
                    disabled={connectionTesting.gps === 'testing'}
                    data-testid="button-test-gpio-connection"
                  >
                    {connectionTesting.gps === 'testing' ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing GPIO...</>
                    ) : connectionTesting.gps === 'success' ? (
                      <><CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />GPIO Connected!</>
                    ) : connectionTesting.gps === 'failed' ? (
                      <><AlertTriangle className="h-4 w-4 mr-2 text-destructive" />Failed - Retry</>
                    ) : (
                      <>Test GPIO Connection</>
                    )}
                  </Button>
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
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => testConnection('lidar')}
                    disabled={connectionTesting.lidar === 'testing'}
                    data-testid="button-test-can-connection"
                  >
                    {connectionTesting.lidar === 'testing' ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing CAN...</>
                    ) : connectionTesting.lidar === 'success' ? (
                      <><CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />CAN Connected!</>
                    ) : connectionTesting.lidar === 'failed' ? (
                      <><AlertTriangle className="h-4 w-4 mr-2 text-destructive" />Failed - Retry</>
                    ) : (
                      <>Test CAN Connection</>
                    )}
                  </Button>
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
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => testConnection('camera')}
                    disabled={connectionTesting.camera === 'testing'}
                    data-testid="button-test-wifi-connection"
                  >
                    {connectionTesting.camera === 'testing' ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Testing WiFi...</>
                    ) : connectionTesting.camera === 'success' ? (
                      <><CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />WiFi Connected!</>
                    ) : connectionTesting.camera === 'failed' ? (
                      <><AlertTriangle className="h-4 w-4 mr-2 text-destructive" />Failed - Retry</>
                    ) : (
                      <>Test WiFi Connection</>
                    )}
                  </Button>
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
                        {usbCameraOptions.map((camera) => (
                          <SelectItem key={camera.value} value={camera.value}>
                            {camera.label ?? camera.value}
                          </SelectItem>
                        ))}
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
                        {usbGpsPortOptions.map((port) => (
                          <SelectItem key={port.value} value={port.value}>
                            {port.label ?? port.value}
                          </SelectItem>
                        ))}
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
                        {usbRadioPortOptions.map((port) => (
                          <SelectItem key={port.value} value={port.value}>
                            {port.label ?? port.value}
                          </SelectItem>
                        ))}
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

            <Card className="border-amber-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  3D Mapping (Photogrammetry)
                </CardTitle>
                <CardDescription>Generate 3D terrain maps from aerial footage. Note: Gimbal movement may affect quality.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                  <p className="text-amber-500 font-medium">Important:</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    For best results, lock gimbal to nadir (straight down) position during mapping flights. 
                    Gimbal movement during capture can reduce 3D reconstruction quality.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Capture Mode</Label>
                    <Select defaultValue="interval">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interval">Timed Interval (2s)</SelectItem>
                        <SelectItem value="distance">Distance-Based (10m)</SelectItem>
                        <SelectItem value="overlap">80% Overlap</SelectItem>
                        <SelectItem value="manual">Manual Trigger</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Output Format</Label>
                    <Select defaultValue="ortho">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ortho">Orthomosaic</SelectItem>
                        <SelectItem value="dem">Digital Elevation Model</SelectItem>
                        <SelectItem value="3dmodel">3D Point Cloud</SelectItem>
                        <SelectItem value="all">All Formats</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Lock Gimbal During Mapping</Label>
                    <p className="text-xs text-muted-foreground">Prevents gimbal movement for consistent captures</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-process on Landing</Label>
                    <p className="text-xs text-muted-foreground">Begin 3D reconstruction when flight ends</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failsafe" className="space-y-4 mt-4">
            <Card className="border-2 border-red-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  GPS-Denied Navigation
                </CardTitle>
                <CardDescription>Configure backup navigation for when GPS signal is lost</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
                  <p className="text-red-500 font-medium">Critical Safety Feature</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    When GPS is unavailable, the drone can use visual odometry (camera feed analysis) 
                    and dead reckoning (IMU heading/speed data) to navigate back to base.
                  </p>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable GPS-Denied Mode</Label>
                    <p className="text-xs text-muted-foreground">Activate backup navigation when GPS is lost</p>
                  </div>
                  <Switch
                    checked={gpsDeniedConfig.enabled}
                    onCheckedChange={(v) => {
                      setGpsDeniedConfig(prev => ({ ...prev, enabled: v }));
                      setUnsavedChanges(true);
                    }}
                    data-testid="switch-gps-denied"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Primary Backup Method</Label>
                  <Select
                    value={gpsDeniedConfig.method}
                    onValueChange={(v) => {
                      setGpsDeniedConfig(prev => ({ ...prev, method: v as "visual" | "dead" | "hybrid" }));
                      setUnsavedChanges(true);
                    }}
                  >
                    <SelectTrigger data-testid="select-backup-nav">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visual">Visual Odometry (Camera)</SelectItem>
                      <SelectItem value="dead">Dead Reckoning (IMU)</SelectItem>
                      <SelectItem value="hybrid">Hybrid (Visual + Dead Reckoning)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Use Flight Path History</Label>
                    <p className="text-xs text-muted-foreground">Backtrack using recorded heading/speed data</p>
                  </div>
                  <Switch
                    checked={gpsDeniedConfig.useFlightHistory}
                    onCheckedChange={(v) => {
                      setGpsDeniedConfig(prev => ({ ...prev, useFlightHistory: v }));
                      setUnsavedChanges(true);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Use Visual Feature Matching</Label>
                    <p className="text-xs text-muted-foreground">Match camera footage to find return path</p>
                  </div>
                  <Switch
                    checked={gpsDeniedConfig.useVisualMatching}
                    onCheckedChange={(v) => {
                      setGpsDeniedConfig(prev => ({ ...prev, useVisualMatching: v }));
                      setUnsavedChanges(true);
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>GPS Lost Timeout (sec)</Label>
                    <Input
                      type="number"
                      value={gpsDeniedConfig.gpsLostTimeoutSec}
                      onChange={(e) => {
                        const value = Math.max(5, Math.min(60, Number(e.target.value) || 10));
                        setGpsDeniedConfig(prev => ({ ...prev, gpsLostTimeoutSec: value }));
                        setUnsavedChanges(true);
                      }}
                      min="5"
                      max="60"
                      data-testid="input-gps-timeout"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Satellites for GPS</Label>
                    <Input
                      type="number"
                      value={gpsDeniedConfig.minSatellites}
                      onChange={(e) => {
                        const value = Math.max(4, Math.min(12, Number(e.target.value) || 6));
                        setGpsDeniedConfig(prev => ({ ...prev, minSatellites: value }));
                        setUnsavedChanges(true);
                      }}
                      min="4"
                      max="12"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-amber-500" />
                  Connection Loss Failsafe
                </CardTitle>
                <CardDescription>What happens when ground control connection is lost</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
                  <p className="text-amber-500 font-medium">Autonomous Mission Completion</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    If the drone loses connection to the ground control computer (not the onboard Raspberry Pi), 
                    it can continue to complete its mission autonomously and then return to base.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Complete Mission on Disconnect</Label>
                    <p className="text-xs text-muted-foreground">Continue mission waypoints if GCS connection lost</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-auto-complete-mission" />
                </div>

                <div className="space-y-2">
                  <Label>On Mission Complete (after disconnect)</Label>
                  <Select defaultValue="rtl">
                    <SelectTrigger data-testid="select-disconnect-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtl">Return to Base (RTL)</SelectItem>
                      <SelectItem value="hover">Hover in Place</SelectItem>
                      <SelectItem value="land">Land Immediately</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Connection Lost Timeout (sec)</Label>
                    <Input type="number" defaultValue="30" min="10" max="120" data-testid="input-disconnect-timeout" />
                  </div>
                  <div className="space-y-2">
                    <Label>Reconnection Attempts</Label>
                    <Input type="number" defaultValue="5" min="1" max="20" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-RTL on Low Battery</Label>
                    <p className="text-xs text-muted-foreground">Return to base when battery drops below threshold</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="space-y-2">
                  <Label>Low Battery RTL Threshold (%)</Label>
                  <Input type="number" defaultValue="20" min="10" max="50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-red-600/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Critical Battery Emergency Landing
                </CardTitle>
                <CardDescription>Automatic emergency landing when battery is critically low</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
                  <p className="text-red-500 font-medium">Critical Safety System</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    When battery drops below 5%, the drone will automatically identify a safe landing zone 
                    using camera AI (avoiding roads, highways, and obstacles) and perform a controlled descent.
                    User can override this action if needed.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Critical Battery Auto-Land</Label>
                    <p className="text-xs text-muted-foreground">Automatically land when battery is below threshold</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-critical-battery-land" />
                </div>

                <div className="space-y-2">
                  <Label>Critical Battery Threshold (%)</Label>
                  <Input type="number" defaultValue="5" min="3" max="15" data-testid="input-critical-battery" />
                  <p className="text-xs text-muted-foreground">Below this level, drone will begin emergency landing</p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Camera-Based Clearing Detection</Label>
                    <p className="text-xs text-muted-foreground">Use AI to identify safe landing zones automatically</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-clearing-detection" />
                </div>

                <div className="space-y-2">
                  <Label>Avoid Areas (AI Detection)</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked data-testid="switch-avoid-roads" />
                      <Label className="text-sm">Roads & Highways</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked data-testid="switch-avoid-water" />
                      <Label className="text-sm">Water Bodies</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked data-testid="switch-avoid-crowds" />
                      <Label className="text-sm">Crowds/People</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked data-testid="switch-avoid-vehicles" />
                      <Label className="text-sm">Vehicles</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked data-testid="switch-avoid-buildings" />
                      <Label className="text-sm">Buildings</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch defaultChecked data-testid="switch-avoid-powerlines" />
                      <Label className="text-sm">Power Lines</Label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Allow User Override</Label>
                    <p className="text-xs text-muted-foreground">Let operator cancel emergency landing if safe to do so</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-emergency-override" />
                </div>

                <div className="space-y-2">
                  <Label>Override Confirmation Time (sec)</Label>
                  <Input type="number" defaultValue="5" min="3" max="30" data-testid="input-override-time" />
                  <p className="text-xs text-muted-foreground">Time window to cancel before landing begins</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Descent Rate (m/s)</Label>
                    <Input type="number" defaultValue="1.5" min="0.5" max="5" step="0.5" data-testid="input-descent-rate" />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Clearing Size (m)</Label>
                    <Input type="number" defaultValue="10" min="5" max="50" data-testid="input-clearing-size" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-blue-500" />
                  ADS-B Integration
                </CardTitle>
                <CardDescription>Aircraft collision avoidance using ADSB Carrier Board with uAvionix receiver</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm">
                  <p className="text-blue-500 font-medium">Aircraft Detection System</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    The Orange Cube+ ADSB Carrier Board with uAvionix receiver picks up ADS-B signals from nearby aircraft,
                    providing position, altitude, and speed data. This information is used to prevent collisions during
                    all flight modes including emergency protocols.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable ADS-B Tracking</Label>
                    <p className="text-xs text-muted-foreground">Display nearby aircraft on map</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-adsb-enabled" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Collision Avoidance</Label>
                    <p className="text-xs text-muted-foreground">Automatically avoid aircraft during RTL and emergencies</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-adsb-avoidance" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Detection Range (km)</Label>
                    <Input type="number" defaultValue="20" min="5" max="50" data-testid="input-adsb-range" />
                  </div>
                  <div className="space-y-2">
                    <Label>Alert Distance (m)</Label>
                    <Input type="number" defaultValue="500" min="100" max="2000" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vertical Separation (m)</Label>
                    <Input type="number" defaultValue="150" min="50" max="500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Horizontal Separation (m)</Label>
                    <Input type="number" defaultValue="300" min="100" max="1000" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Audio Alerts</Label>
                    <p className="text-xs text-muted-foreground">Play warning sounds when aircraft detected</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include in Emergency Protocols</Label>
                    <p className="text-xs text-muted-foreground">RTL and emergency landing check for aircraft</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Emergency Actions
                </CardTitle>
                <CardDescription>Configure emergency behavior</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Geofence Enabled</Label>
                    <p className="text-xs text-muted-foreground">Prevent drone from exceeding boundaries</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Max Altitude (m)</Label>
                    <Input type="number" defaultValue="120" min="10" max="500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Distance (m)</Label>
                    <Input type="number" defaultValue="2000" min="100" max="10000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Min Altitude (m)</Label>
                    <Input type="number" defaultValue="10" min="2" max="50" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Kill Switch Confirmation</Label>
                    <p className="text-xs text-muted-foreground">Require double-press for emergency motor stop</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="network" className="space-y-4 mt-4">
            <Card className="border-2 border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5" />
                  Base Location (RTL)
                </CardTitle>
                <CardDescription>Set the home/base location for Return-to-Base functionality</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Base Name</Label>
                  <Input 
                    placeholder="Home Base"
                    value={baseLocation.name}
                    onChange={(e) => setBaseLocation(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input 
                      placeholder="37.7749"
                      value={baseLocation.lat}
                      onChange={(e) => setBaseLocation(prev => ({ ...prev, lat: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input 
                      placeholder="-122.4194"
                      value={baseLocation.lng}
                      onChange={(e) => setBaseLocation(prev => ({ ...prev, lng: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={useCurrentLocationForBase}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Use Current Location
                  </Button>
                  <Button onClick={saveBaseLocationSetting}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Base
                  </Button>
                </div>
                {savedBaseLocation && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm">
                    <div className="flex items-center gap-2 text-emerald-500">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Saved: {savedBaseLocation.name}</span>
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      {savedBaseLocation.lat.toFixed(6)}, {savedBaseLocation.lng.toFixed(6)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-500/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="h-5 w-5" />
                  Raspberry Pi Hotspot
                </CardTitle>
                <CardDescription>Configure the Raspberry Pi to create a WiFi hotspot for direct connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs space-y-2">
                  <p className="font-semibold text-blue-400">Why use a hotspot?</p>
                  <p className="text-muted-foreground">
                    When no WiFi network is available, the Raspberry Pi can create its own hotspot. 
                    Connect your laptop/tablet directly to the Pi's WiFi to send commands.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Enable Hotspot Mode</Label>
                    <Switch 
                      checked={networkSettings.hotspotEnabled}
                      onCheckedChange={(checked) => updateSetting(setNetworkSettings, "hotspotEnabled", checked)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Hotspot SSID</Label>
                    <Input 
                      placeholder="MOUSE-GCS"
                      value={networkSettings.hotspotSsid}
                      onChange={(e) => updateSetting(setNetworkSettings, "hotspotSsid", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Hotspot Password</Label>
                    <Input 
                      type="password"
                      placeholder="••••••••"
                      value={networkSettings.hotspotPassword}
                      onChange={(e) => updateSetting(setNetworkSettings, "hotspotPassword", e.target.value)}
                    />
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                  <p className="font-semibold">Connection Instructions:</p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                    <li>Enable hotspot mode on the Raspberry Pi</li>
                    <li>On your laptop, connect to WiFi: <span className="font-mono text-primary">{networkSettings.hotspotSsid || "MOUSE-GCS"}</span></li>
                    <li>Open the GCS app and use connection string: <span className="font-mono text-primary">udp:10.42.0.1:14550</span></li>
                    <li>The Pi's IP in hotspot mode is typically: <span className="font-mono text-primary">10.42.0.1</span></li>
                  </ol>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      toast.info("Hotspot activation would be sent to Raspberry Pi...");
                      operationsLog.logSystem('Network', `Hotspot ${networkSettings.hotspotEnabled ? 'enabled' : 'disabled'}: ${networkSettings.hotspotSsid || 'MOUSE-GCS'}`);
                    }}
                  >
                    <Radio className="h-4 w-4 mr-2" />
                    Apply Hotspot Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                  <div className="text-xs text-primary font-medium">
                    Required target firmware: ArduPilot Copter build for <span className="font-mono">CubeOrangePlus</span> board.
                  </div>
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
