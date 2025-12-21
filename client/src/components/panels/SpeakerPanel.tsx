import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Volume2, Mic, Play, Square, MessageSquare, Plus, Trash2, Check, Settings2, Radio, Loader2, Usb, Bell, Speaker } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

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

export function SpeakerPanel() {
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

  const playBuzzerTone = async (toneId: string) => {
    setBuzzerPlaying(true);
    toast.success(`Playing ${toneId} tone on Orange Cube+ buzzer`);
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = volume[0] / 100;
    
    switch (toneId) {
      case 'alert':
        oscillator.frequency.value = 880;
        oscillator.type = 'square';
        oscillator.start();
        setTimeout(() => oscillator.stop(), 200);
        break;
      case 'warning':
        oscillator.frequency.value = 440;
        oscillator.type = 'sawtooth';
        oscillator.start();
        const warningInterval = setInterval(() => {
          oscillator.frequency.value = oscillator.frequency.value === 440 ? 880 : 440;
        }, 200);
        setTimeout(() => { oscillator.stop(); clearInterval(warningInterval); }, 1000);
        break;
      case 'success':
        oscillator.frequency.value = 523;
        oscillator.type = 'sine';
        oscillator.start();
        setTimeout(() => oscillator.frequency.value = 659, 100);
        setTimeout(() => oscillator.frequency.value = 784, 200);
        setTimeout(() => oscillator.stop(), 400);
        break;
      case 'startup':
        oscillator.frequency.value = 262;
        oscillator.type = 'sine';
        oscillator.start();
        setTimeout(() => oscillator.frequency.value = 330, 150);
        setTimeout(() => oscillator.frequency.value = 392, 300);
        setTimeout(() => oscillator.frequency.value = 523, 450);
        setTimeout(() => oscillator.stop(), 600);
        break;
      case 'landing':
        oscillator.frequency.value = 1000;
        oscillator.type = 'square';
        oscillator.start();
        const landingInterval = setInterval(() => {
          oscillator.frequency.value = oscillator.frequency.value === 1000 ? 500 : 1000;
        }, 500);
        setTimeout(() => { oscillator.stop(); clearInterval(landingInterval); }, 2000);
        break;
      case 'emergency':
        oscillator.frequency.value = 1500;
        oscillator.type = 'square';
        oscillator.start();
        const emergencyInterval = setInterval(() => {
          oscillator.frequency.value = oscillator.frequency.value === 1500 ? 2000 : 1500;
        }, 100);
        setTimeout(() => { oscillator.stop(); clearInterval(emergencyInterval); }, 3000);
        break;
      default:
        oscillator.frequency.value = 440;
        oscillator.type = 'sine';
        oscillator.start();
        setTimeout(() => oscillator.stop(), 500);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    setBuzzerPlaying(false);
  };

  const detectUsbDevices = async () => {
    const mockDevices = [
      'USB Audio Device (Generic)',
      'Raspberry Pi Audio',
      'External Speaker (USB)',
    ];
    setUsbDevices(mockDevices);
    if (mockDevices.length > 0 && !selectedUsbDevice) {
      setSelectedUsbDevice(mockDevices[0]);
    }
    toast.success(`Found ${mockDevices.length} USB audio devices`);
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
  }, []);

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
    
    setIsBroadcasting(true);
    toast.success("Broadcasting to drone speaker...");
    
    speakText(ttsMessage, false);
    
    await new Promise(resolve => setTimeout(resolve, 2000 + ttsMessage.length * 50));
    
    setIsBroadcasting(false);
    toast.info("Broadcast complete");
  };

  const handleQuickMessage = async (message: string) => {
    setIsBroadcasting(true);
    toast.success(`Broadcasting: "${message}"`);
    
    speakText(message, false);
    
    await new Promise(resolve => setTimeout(resolve, 2000 + message.length * 50));
    
    setIsBroadcasting(false);
  };

  const handleStartRecording = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      toast.success("Live broadcast started - speak into microphone");
    } catch (error) {
      toast.error("Microphone access denied");
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    toast.info("Live broadcast stopped");
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
