import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Volume2, Mic, Play, Square, MessageSquare, Plus, Trash2, Check, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface QuickMessage {
  id: string;
  text: string;
}

export function SpeakerPanel() {
  const [isRecording, setIsRecording] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [volume, setVolume] = useState([80]);
  const [ttsMessage, setTtsMessage] = useState("");
  const [voiceType, setVoiceType] = useState("female");
  const [speechRate, setSpeechRate] = useState([1]);
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([
    { id: "1", text: "Clear the area immediately" },
    { id: "2", text: "Emergency services have been notified" },
    { id: "3", text: "Package delivery in progress" },
    { id: "4", text: "Inspection in progress, do not approach" },
  ]);
  const [newQuickMessage, setNewQuickMessage] = useState("");
  const [showAddMessage, setShowAddMessage] = useState(false);

  const handleStartRecording = () => {
    setIsRecording(true);
    setIsBroadcasting(true);
    toast.success("Live broadcast started - speak into microphone");
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setIsBroadcasting(false);
    toast.info("Live broadcast stopped");
  };

  const handlePreview = () => {
    if (!ttsMessage.trim()) {
      toast.error("Please enter a message to preview");
      return;
    }
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(ttsMessage);
      utterance.rate = speechRate[0];
      speechSynthesis.speak(utterance);
      toast.success("Playing preview locally...");
    } else {
      toast.error("Text-to-speech not supported in this browser");
    }
  };

  const handleBroadcast = () => {
    if (!ttsMessage.trim()) {
      toast.error("Please enter a message to broadcast");
      return;
    }
    setIsBroadcasting(true);
    toast.success("Broadcasting message to drone speaker...");
    setTimeout(() => {
      setIsBroadcasting(false);
      toast.info("Broadcast complete");
    }, 3000);
  };

  const handleQuickMessage = (message: string) => {
    setTtsMessage(message);
    setIsBroadcasting(true);
    toast.success(`Broadcasting: "${message}"`);
    setTimeout(() => {
      setIsBroadcasting(false);
    }, 2000);
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
                Speaker Status
              </CardTitle>
              <CardDescription>Raspberry Pi GPIO connected speaker</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isBroadcasting && (
                <Badge className="bg-destructive animate-pulse">BROADCASTING</Badge>
              )}
              <Badge className="bg-emerald-500">ONLINE</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <div className="flex items-center justify-center py-8">
            <Button
              size="lg"
              variant={isRecording ? "destructive" : "default"}
              className="h-32 w-32 rounded-full text-lg"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
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
              "Click to start broadcasting"
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Text-to-Speech</CardTitle>
          <CardDescription>Convert text message to audio announcement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Voice Type</Label>
              <Select value={voiceType} onValueChange={setVoiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="robotic">Robotic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Speed</Label>
                <span className="text-xs text-muted-foreground">{speechRate[0]}x</span>
              </div>
              <Slider 
                value={speechRate} 
                onValueChange={setSpeechRate}
                min={0.5}
                max={2}
                step={0.1}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tts-message">Message</Label>
            <Textarea
              id="tts-message"
              placeholder="Enter message to broadcast..."
              className="min-h-24 font-mono"
              value={ttsMessage}
              onChange={(e) => setTtsMessage(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handlePreview}
              disabled={isBroadcasting}
            >
              <Play className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button 
              className="flex-1"
              onClick={handleBroadcast}
              disabled={isBroadcasting || !ttsMessage.trim()}
            >
              <Volume2 className="h-4 w-4 mr-2" />
              {isBroadcasting ? "Broadcasting..." : "Broadcast"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Quick Messages</CardTitle>
              <CardDescription>Pre-configured emergency announcements</CardDescription>
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
                  disabled={isBroadcasting}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Audio Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Audio Output Device</Label>
            <Select defaultValue="gpio">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpio">GPIO Speaker (Default)</SelectItem>
                <SelectItem value="usb">USB Audio</SelectItem>
                <SelectItem value="hdmi">HDMI Audio</SelectItem>
                <SelectItem value="i2s">I2S DAC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Audio Quality</Label>
            <Select defaultValue="high">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low (8kHz)</SelectItem>
                <SelectItem value="medium">Medium (16kHz)</SelectItem>
                <SelectItem value="high">High (44.1kHz)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
