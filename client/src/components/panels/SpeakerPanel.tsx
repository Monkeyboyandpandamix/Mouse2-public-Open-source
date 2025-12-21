import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Volume2, Mic, Play, Square, MessageSquare } from "lucide-react";
import { useState } from "react";

export function SpeakerPanel() {
  const [isRecording, setIsRecording] = useState(false);
  const [volume, setVolume] = useState([80]);

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
            <Badge className="bg-emerald-500">ONLINE</Badge>
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
              onClick={() => setIsRecording(!isRecording)}
            >
              {isRecording ? (
                <>
                  <Square className="h-8 w-8" />
                </>
              ) : (
                <>
                  <Mic className="h-8 w-8" />
                </>
              )}
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {isRecording ? (
              <span className="text-destructive font-bold flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                BROADCASTING LIVE
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
          <div className="space-y-2">
            <Label htmlFor="tts-message">Message</Label>
            <Textarea
              id="tts-message"
              placeholder="Enter message to broadcast..."
              className="min-h-24 font-mono"
              defaultValue=""
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button className="flex-1">
              <Volume2 className="h-4 w-4 mr-2" />
              Broadcast
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Messages</CardTitle>
          <CardDescription>Pre-recorded emergency announcements</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="justify-start">
            <MessageSquare className="h-4 w-4 mr-2" />
            "Clear the area"
          </Button>
          <Button variant="outline" className="justify-start">
            <MessageSquare className="h-4 w-4 mr-2" />
            "Emergency services"
          </Button>
          <Button variant="outline" className="justify-start">
            <MessageSquare className="h-4 w-4 mr-2" />
            "Package delivery"
          </Button>
          <Button variant="outline" className="justify-start">
            <MessageSquare className="h-4 w-4 mr-2" />
            "Inspection in progress"
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
