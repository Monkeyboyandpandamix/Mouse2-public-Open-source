import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Volume2, Mic, Play, Square, MessageSquare, Plus, Trash2, Check, Radio, Loader2, Usb, Bell, Speaker, Lock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

type AudioDevice = 'gpio' | 'usb' | 'buzzer';

const BUZZER_TONES = [
  { id: 'alert', name: 'Alert', description: 'Short attention-getting beep' },
  { id: 'warning', name: 'Warning', description: 'Urgent warning siren' },
  { id: 'success', name: 'Success', description: 'Positive confirmation tone' },
  { id: 'startup', name: 'Startup', description: 'System initialization tune' },
  { id: 'landing', name: 'Landing', description: 'Landing approach alert' },
  { id: 'emergency', name: 'Emergency', description: 'Emergency beacon signal' },
];

interface QuickMessage {
  id: string;
  text: string;
}

interface VoiceOption {
  name: string;
  lang: string;
  voiceURI: string;
}

interface AudioStatusResponse {
  success: boolean;
  state: {
    deviceType: AudioDevice;
    volume: number;
    live: {
      active: boolean;
      startedAt: string | null;
    };
    droneMic: {
      enabled: boolean;
      listening: boolean;
      volume: number;
    };
  };
}

export function SpeakerPanel() {
  const { hasPermission } = usePermissions();
  const canBroadcast = hasPermission('broadcast_audio');
  const [isRecording, setIsRecording] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [volume, setVolume] = useState([80]);
  const [ttsMessage, setTtsMessage] = useState("");
  const [voiceType, setVoiceType] = useState("default");
  const [speechRate, setSpeechRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([
    { id: "1", text: "Clear the area immediately" },
    { id: "2", text: "Emergency services have been notified" },
    { id: "3", text: "Package delivery in progress" },
    { id: "4", text: "Inspection in progress, do not approach" },
  ]);
  const [newQuickMessage, setNewQuickMessage] = useState("");
  const [showAddMessage, setShowAddMessage] = useState(false);
  const [audioDevice, setAudioDevice] = useState<AudioDevice>('gpio');
  const [usbDevices, setUsbDevices] = useState<string[]>([]);
  const [selectedUsbDevice, setSelectedUsbDevice] = useState<string>('');
  const [buzzerPlaying, setBuzzerPlaying] = useState(false);
  
  const [droneMicEnabled, setDroneMicEnabled] = useState(false);
  const [droneMicVolume, setDroneMicVolume] = useState([70]);
  const [isListeningFromDrone, setIsListeningFromDrone] = useState(false);
  const [droneMicStatus, setDroneMicStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const micStreamRef = useRef<MediaStream | null>(null);

  const applyAudioState = (state: AudioStatusResponse["state"]) => {
    setAudioDevice(state.deviceType);
    setVolume([state.volume]);
    setIsRecording(state.live.active);
    setDroneMicEnabled(state.droneMic.enabled);
    setIsListeningFromDrone(state.droneMic.listening);
    setDroneMicVolume([state.droneMic.volume]);
    setDroneMicStatus(state.droneMic.enabled ? "connected" : "disconnected");
  };

  const apiJson = async (url: string, init?: RequestInit) => {
    const response = await fetch(url, init);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return response.json();
  };

  const loadAudioStatus = async () => {
    const status = await apiJson("/api/audio/status") as AudioStatusResponse;
    applyAudioState(status.state);
  };

  const playBuzzerTone = async (toneId: string) => {
    try {
      setBuzzerPlaying(true);
      await apiJson("/api/audio/buzzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: toneId, volume: volume[0] }),
      });
      toast.success(`Playing ${toneId} tone on Orange Cube+ buzzer`);
    } catch (error: any) {
      toast.error(error.message || "Failed to trigger buzzer");
    } finally {
      setBuzzerPlaying(false);
    }
  };

  const detectUsbDevices = async () => {
    try {
      const result = await apiJson("/api/audio/output/devices");
      const devices: string[] = Array.isArray(result.devices) ? result.devices : [];
      setUsbDevices(devices);
      if (devices.length > 0 && !selectedUsbDevice) {
        setSelectedUsbDevice(devices[0]);
      }
      toast.success(`Found ${devices.length} audio device${devices.length === 1 ? "" : "s"}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to detect devices");
    }
  };

  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      const voiceOptions: VoiceOption[] = voices.map(v => ({
        name: v.name,
        lang: v.lang,
        voiceURI: v.voiceURI,
      }));
      setAvailableVoices(voiceOptions);
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    loadAudioStatus().catch(() => {
      // no-op: panel remains operational with local defaults
    });
    detectUsbDevices().catch(() => {
      // no-op for offline fallback
    });
    return () => {
      speechSynthesis.onvoiceschanged = null;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      loadAudioStatus().catch(() => {});
    }, 3000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const onOutput = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (custom.detail && typeof custom.detail === "object") {
        setAudioDevice(custom.detail.deviceType || "gpio");
        setVolume([Number(custom.detail.volume ?? 80)]);
      }
    };
    const onLive = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (custom.detail && typeof custom.detail === "object") {
        setIsRecording(Boolean(custom.detail.active));
      }
    };
    const onDroneMic = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (custom.detail && typeof custom.detail === "object") {
        setDroneMicEnabled(Boolean(custom.detail.enabled));
        setIsListeningFromDrone(Boolean(custom.detail.listening));
        setDroneMicVolume([Number(custom.detail.volume ?? 70)]);
        setDroneMicStatus(custom.detail.enabled ? "connected" : "disconnected");
      }
    };

    window.addEventListener("audio-output-updated", onOutput as any);
    window.addEventListener("audio-live-updated", onLive as any);
    window.addEventListener("audio-drone-mic-updated", onDroneMic as any);
    return () => {
      window.removeEventListener("audio-output-updated", onOutput as any);
      window.removeEventListener("audio-live-updated", onLive as any);
      window.removeEventListener("audio-drone-mic-updated", onDroneMic as any);
    };
  }, []);

  useEffect(() => {
    if (audioDevice === "usb" && selectedUsbDevice) {
      apiJson("/api/audio/output/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceType: "usb",
          deviceId: selectedUsbDevice,
          volume: volume[0],
        }),
      }).catch(() => {});
      return;
    }
    apiJson("/api/audio/output/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceType: audioDevice,
        deviceId: audioDevice === "gpio" ? "gpio-default" : audioDevice,
        volume: volume[0],
      }),
    }).catch(() => {});
  }, [audioDevice, selectedUsbDevice]);

  useEffect(() => {
    apiJson("/api/audio/output/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceType: audioDevice,
        deviceId: audioDevice === "usb" ? selectedUsbDevice || "usb-default" : audioDevice,
        volume: volume[0],
      }),
    }).catch(() => {});
  }, [volume]);

  const getSelectedVoice = () => {
    const voices = speechSynthesis.getVoices();
    
    switch (voiceType) {
      case "male":
        return voices.find(v => 
          v.name.toLowerCase().includes('male') || 
          v.name.toLowerCase().includes('david') ||
          v.name.toLowerCase().includes('james') ||
          v.name.toLowerCase().includes('daniel')
        ) || voices[0];
      case "female":
        return voices.find(v => 
          v.name.toLowerCase().includes('female') || 
          v.name.toLowerCase().includes('samantha') ||
          v.name.toLowerCase().includes('karen') ||
          v.name.toLowerCase().includes('victoria')
        ) || voices[0];
      case "robotic":
        return voices.find(v => 
          v.name.toLowerCase().includes('zira') ||
          v.name.toLowerCase().includes('microsoft')
        ) || voices[0];
      default:
        return voices[0];
    }
  };

  const speakText = (text: string, isPreview: boolean = false) => {
    if (!text.trim()) {
      toast.error("Please enter a message");
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speechRate[0];
    utterance.pitch = voiceType === "robotic" ? 0.5 : pitch[0];
    utterance.volume = volume[0] / 100;
    
    const selectedVoice = getSelectedVoice();
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    if (isPreview) {
      setIsPreviewing(true);
      utterance.onend = () => setIsPreviewing(false);
      utterance.onerror = () => setIsPreviewing(false);
    }

    speechSynthesis.speak(utterance);
  };

  const handlePreview = () => {
    if (isPreviewing) {
      speechSynthesis.cancel();
      setIsPreviewing(false);
      return;
    }
    speakText(ttsMessage, true);
    toast.success("Playing preview locally...");
  };

  const handleBroadcast = async () => {
    if (!ttsMessage.trim()) {
      toast.error("Please enter a message to broadcast");
      return;
    }
    
    try {
      setIsBroadcasting(true);
      const result = await apiJson("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ttsMessage,
          rate: speechRate[0],
          pitch: pitch[0],
          volume: volume[0],
          voiceType,
          preview: false,
        }),
      });

      toast.success(
        result.playedLocally
          ? "Broadcast sent and played on local audio backend"
          : "Broadcast queued (audio backend in simulated mode)",
      );
    } catch (error: any) {
      toast.error(error.message || "Broadcast failed");
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleQuickMessage = async (message: string) => {
    try {
      setIsBroadcasting(true);
      await apiJson("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message,
          rate: speechRate[0],
          pitch: pitch[0],
          volume: volume[0],
          voiceType,
          preview: false,
        }),
      });
      toast.success(`Broadcasting: "${message}"`);
    } catch (error: any) {
      toast.error(error.message || "Quick message broadcast failed");
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Microphone API unavailable in this browser/environment");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const result = await apiJson("/api/audio/live/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "operator-mic", deviceType: audioDevice }),
      });
      if (result?.live?.active === true) {
        setIsRecording(true);
      } else {
        throw new Error("Audio backend did not enter live mode");
      }
      toast.success("Live broadcast started - speak into microphone");
    } catch (error: any) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      toast.error(error?.message || "Microphone access denied");
    }
  };

  const handleStopRecording = async () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    await apiJson("/api/audio/live/stop", { method: "POST" }).catch(() => {});
    setIsRecording(false);
    toast.info("Live broadcast stopped");
    loadAudioStatus().catch(() => {});
  };

  const handleAddQuickMessage = () => {
    if (!newQuickMessage.trim()) {
      toast.error("Please enter a message");
      return;
    }
    setQuickMessages([...quickMessages, { id: Date.now().toString(), text: newQuickMessage }]);
    setNewQuickMessage("");
    setShowAddMessage(false);
    toast.success("Quick message added");
  };

  const handleDeleteQuickMessage = (id: string) => {
    setQuickMessages(quickMessages.filter(m => m.id !== id));
    toast.info("Quick message removed");
  };

  const handleToggleDroneMic = async () => {
    try {
      if (droneMicEnabled) {
        await apiJson("/api/audio/drone-mic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: false, listening: false, volume: droneMicVolume[0] }),
        });
        setDroneMicEnabled(false);
        setIsListeningFromDrone(false);
        setDroneMicStatus("disconnected");
        toast.info("Drone microphone disconnected");
      } else {
        setDroneMicStatus("connecting");
        await apiJson("/api/audio/drone-mic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true, listening: false, volume: droneMicVolume[0] }),
        });
        setDroneMicEnabled(true);
        setDroneMicStatus("connected");
        toast.success("Drone microphone connected");
      }
    } catch (error: any) {
      setDroneMicStatus("disconnected");
      toast.error(error.message || "Failed to update drone microphone state");
    }
  };

  const handleToggleListenDrone = async () => {
    const nextListeningState = !isListeningFromDrone;
    try {
      await apiJson("/api/audio/drone-mic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          listening: nextListeningState,
          volume: droneMicVolume[0],
        }),
      });
      setIsListeningFromDrone(nextListeningState);
    } catch (error: any) {
      toast.error(error.message || "Failed to change drone listen state");
    }
  };

  useEffect(() => {
    if (!droneMicEnabled) return;
    apiJson("/api/audio/drone-mic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        listening: isListeningFromDrone,
        volume: droneMicVolume[0],
      }),
    }).catch(() => {});
  }, [droneMicVolume]);

  // Show permission denied if user doesn't have access
  if (!canBroadcast) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <div className="text-center">
            <h3 className="font-semibold text-lg">Access Restricted</h3>
            <p className="text-sm">You don't have permission to access the audio broadcast system.</p>
            <p className="text-xs mt-2">Contact an administrator for access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 bg-background space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight font-sans">Audio Broadcast System</h2>
        <p className="text-muted-foreground">Speak through the drone's onboard speaker</p>
      </div>

      <Card className="border-2 border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="h-5 w-5" />
                Audio Output Device
              </CardTitle>
              <CardDescription>Select speaker output for broadcasts</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {(isBroadcasting || isRecording || buzzerPlaying) && (
                <Badge className="bg-destructive animate-pulse">
                  <Radio className="h-3 w-3 mr-1" />
                  ACTIVE
                </Badge>
              )}
              <Badge className="bg-emerald-500">CONNECTED</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Button 
              variant={audioDevice === 'gpio' ? 'default' : 'outline'}
              className="flex flex-col h-auto py-3"
              onClick={() => setAudioDevice('gpio')}
            >
              <Speaker className="h-5 w-5 mb-1" />
              <span className="text-xs">Pi GPIO</span>
            </Button>
            <Button 
              variant={audioDevice === 'usb' ? 'default' : 'outline'}
              className="flex flex-col h-auto py-3"
              onClick={() => { setAudioDevice('usb'); detectUsbDevices(); }}
            >
              <Usb className="h-5 w-5 mb-1" />
              <span className="text-xs">USB Speaker</span>
            </Button>
            <Button 
              variant={audioDevice === 'buzzer' ? 'default' : 'outline'}
              className="flex flex-col h-auto py-3"
              onClick={() => setAudioDevice('buzzer')}
            >
              <Bell className="h-5 w-5 mb-1" />
              <span className="text-xs">Cube+ Buzzer</span>
            </Button>
          </div>

          {audioDevice === 'usb' && (
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between">
                <Label>USB Audio Device</Label>
                <Button variant="ghost" size="sm" onClick={detectUsbDevices}>
                  Scan
                </Button>
              </div>
              <Select value={selectedUsbDevice} onValueChange={setSelectedUsbDevice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select USB device..." />
                </SelectTrigger>
                <SelectContent>
                  {usbDevices.map(device => (
                    <SelectItem key={device} value={device}>{device}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {audioDevice === 'buzzer' && (
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
              <Label>Orange Cube+ Buzzer Tones (MAVLink)</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {BUZZER_TONES.map(tone => (
                  <Button
                    key={tone.id}
                    variant="outline"
                    size="sm"
                    className="justify-start h-auto py-2"
                    onClick={() => playBuzzerTone(tone.id)}
                    disabled={buzzerPlaying}
                  >
                    <Bell className="h-3 w-3 mr-2" />
                    <div className="text-left">
                      <div className="text-xs font-medium">{tone.name}</div>
                      <div className="text-[10px] text-muted-foreground">{tone.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Output Volume</Label>
              <span className="text-sm text-muted-foreground font-mono">{volume[0]}%</span>
            </div>
            <Slider 
              value={volume} 
              onValueChange={setVolume}
              max={100} 
              step={5}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Voice Transmission</CardTitle>
          <CardDescription>Real-time audio broadcast via microphone</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center py-6">
            <Button
              size="lg"
              variant={isRecording ? "destructive" : "default"}
              className="h-28 w-28 rounded-full text-lg"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isBroadcasting}
            >
              {isRecording ? (
                <Square className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {isRecording ? (
              <span className="text-destructive font-bold flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                BROADCASTING LIVE - Click to stop
              </span>
            ) : (
              "Click to start live broadcast"
            )}
          </p>
        </CardContent>
      </Card>

      <Card className="border-2 border-primary/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Drone Microphone Input
              </CardTitle>
              <CardDescription>Receive audio from drone-mounted microphone for two-way communication</CardDescription>
            </div>
            <Badge className={droneMicStatus === 'connected' ? "bg-emerald-500" : droneMicStatus === 'connecting' ? "bg-amber-500" : "bg-muted"}>
              {droneMicStatus === 'connected' ? 'Connected' : droneMicStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <Label>Enable Drone Microphone</Label>
              <p className="text-xs text-muted-foreground">Receive audio from drone via WebSocket stream</p>
            </div>
            <Button
              variant={droneMicEnabled ? "destructive" : "default"}
              onClick={handleToggleDroneMic}
              data-testid="button-toggle-drone-mic"
            >
              {droneMicStatus === 'connecting' ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
              ) : droneMicEnabled ? (
                <>Disconnect</>
              ) : (
                <>Connect</>
              )}
            </Button>
          </div>

          {droneMicEnabled && (
            <>
              <div className="flex items-center justify-center py-4">
                <Button
                  size="lg"
                  variant={isListeningFromDrone ? "secondary" : "outline"}
                  className={`h-20 w-20 rounded-full ${isListeningFromDrone ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  onClick={handleToggleListenDrone}
                  data-testid="button-listen-drone"
                >
                  <Volume2 className={`h-8 w-8 ${isListeningFromDrone ? 'text-primary animate-pulse' : ''}`} />
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {isListeningFromDrone ? (
                  <span className="text-primary font-bold flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    LISTENING TO DRONE - Click to mute
                  </span>
                ) : (
                  "Click to hear audio from drone"
                )}
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Drone Mic Volume</Label>
                  <span className="text-sm text-muted-foreground font-mono">{droneMicVolume[0]}%</span>
                </div>
                <Slider 
                  value={droneMicVolume} 
                  onValueChange={setDroneMicVolume}
                  max={100} 
                  step={5}
                />
              </div>

              <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                <Label className="text-xs">Audio Stream Info</Label>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Source: Raspberry Pi USB Mic</div>
                  <div>Format: WebSocket Audio</div>
                  <div>Sample Rate: 16kHz</div>
                  <div>Latency: ~150ms</div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Text-to-Speech</CardTitle>
          <CardDescription>Convert text to audio announcement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Voice Type</Label>
              <Select value={voiceType} onValueChange={setVoiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="robotic">Robotic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Speed</Label>
                <span className="text-xs text-muted-foreground">{speechRate[0].toFixed(1)}x</span>
              </div>
              <Slider 
                value={speechRate} 
                onValueChange={setSpeechRate}
                min={0.5}
                max={2}
                step={0.1}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Pitch</Label>
                <span className="text-xs text-muted-foreground">{pitch[0].toFixed(1)}</span>
              </div>
              <Slider 
                value={pitch} 
                onValueChange={setPitch}
                min={0.5}
                max={2}
                step={0.1}
                disabled={voiceType === "robotic"}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tts-message">Message</Label>
            <Textarea
              id="tts-message"
              placeholder="Enter message to broadcast..."
              className="min-h-20 font-mono"
              value={ttsMessage}
              onChange={(e) => setTtsMessage(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handlePreview}
              disabled={isBroadcasting || !ttsMessage.trim()}
            >
              {isPreviewing ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Preview
                </>
              )}
            </Button>
            <Button 
              className="flex-1"
              onClick={handleBroadcast}
              disabled={isBroadcasting || isRecording || !ttsMessage.trim()}
            >
              {isBroadcasting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Broadcasting...
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4 mr-2" />
                  Broadcast
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Quick Messages</CardTitle>
              <CardDescription>Pre-configured announcements</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowAddMessage(!showAddMessage)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddMessage && (
            <div className="flex gap-2 p-3 bg-muted/50 rounded-lg">
              <Input
                placeholder="Enter new quick message..."
                value={newQuickMessage}
                onChange={(e) => setNewQuickMessage(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddQuickMessage()}
              />
              <Button size="sm" onClick={handleAddQuickMessage}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-2">
            {quickMessages.map((message) => (
              <div 
                key={message.id}
                className="flex items-center gap-2 group"
              >
                <Button 
                  variant="outline" 
                  className="flex-1 justify-start text-left h-auto py-3"
                  onClick={() => handleQuickMessage(message.text)}
                  disabled={isBroadcasting || isRecording}
                >
                  <MessageSquare className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{message.text}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDeleteQuickMessage(message.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
