import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Volume2, Mic, Play, Square, MessageSquare, Plus, Trash2, Check, Radio, Loader2, Usb, Bell, Speaker, Lock, Monitor, Cpu, ArrowRight } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppState } from "@/contexts/AppStateContext";

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

interface SpeakerPanelProps {
  isControllerMode: boolean;
  micRoutedToDrone: boolean;
}

export function SpeakerPanel({ isControllerMode, micRoutedToDrone }: SpeakerPanelProps) {
  const { selectedDrone } = useAppState();
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const lastRealtimeUpdateRef = useRef(0);
  // Suppression refs prevent WS-driven state updates from re-firing the debounced
  // POST effect (which would echo back to the server and cause oscillation /
  // ping-pong of the active output device or drone-mic listen state).
  const suppressOutputPostRef = useRef(0);
  const suppressDroneMicPostRef = useRef(0);
  const lastUserDroneMicActionRef = useRef(0);
  const isStreamingRef = useRef(false);
  // Owner token for the sessionStorage `mouse_audio_sender` flag. Only the
  // SpeakerPanel instance that wrote the current value should be allowed to
  // clear it — otherwise a parallel instance (StrictMode double-mount, or a
  // second panel in the same tab) could un-suppress active playback.
  const senderOwnerTokenRef = useRef<string | null>(null);
  const clearSenderFlagIfOwner = () => {
    try {
      const current = sessionStorage.getItem("mouse_audio_sender");
      if (current && current === senderOwnerTokenRef.current) {
        sessionStorage.removeItem("mouse_audio_sender");
      }
      // Always release our claim locally so a subsequent start can re-acquire.
      senderOwnerTokenRef.current = null;
    } catch {}
  };

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

  const getSelectedDroneId = (): string | null => {
    return typeof selectedDrone?.id === "string" ? selectedDrone.id : null;
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
    loadAudioStatus().catch((err) => console.warn("[SpeakerPanel] loadAudioStatus failed:", err));
    detectUsbDevices().catch((err) => console.warn("[SpeakerPanel] detectUsbDevices failed:", err));
    return () => {
      speechSynthesis.onvoiceschanged = null;
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      // If this tab is unmounted (navigation, hot reload, tab close) while
      // it was the active sender, clear the flag so the next mount doesn't
      // suppress incoming audio forever — but only if THIS instance owns it,
      // so a parallel SpeakerPanel instance keeps its claim.
      clearSenderFlagIfOwner();
    };
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      const realtimeIsFresh = Date.now() - lastRealtimeUpdateRef.current < 15_000;
      if (realtimeIsFresh) return;
      loadAudioStatus().catch((err) => console.warn("[SpeakerPanel] poll loadAudioStatus failed:", err));
    }, 10_000);
    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    const onOutput = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (custom.detail && typeof custom.detail === "object") {
        lastRealtimeUpdateRef.current = Date.now();
        // Mark this state change as WS-originated so the debounced POST effect
        // doesn't echo it back to the server (root cause of USB↔GPIO ping-pong).
        suppressOutputPostRef.current = Date.now();
        // Preserve the user's current selection if the WS event doesn't carry
        // an explicit deviceType (don't blindly fall back to "gpio").
        if (custom.detail.deviceType) {
          setAudioDevice(custom.detail.deviceType);
        }
        if (custom.detail.volume != null) {
          setVolume([Number(custom.detail.volume)]);
        }
      }
    };
    const onLive = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (custom.detail && typeof custom.detail === "object") {
        lastRealtimeUpdateRef.current = Date.now();
        setIsRecording(Boolean(custom.detail.active));
        isStreamingRef.current = Boolean(custom.detail.active);
      }
    };
    const onDroneMic = (event: Event) => {
      const custom = event as CustomEvent<any>;
      if (custom.detail && typeof custom.detail === "object") {
        lastRealtimeUpdateRef.current = Date.now();
        // Ignore broadcast for ~1.2 s after a local user toggle, to prevent the
        // server's authoritative echo from racing the optimistic local state
        // and causing the "Hear" toggle to flicker connected/disconnected.
        const sinceUserAction = Date.now() - lastUserDroneMicActionRef.current;
        if (sinceUserAction < 1200) return;
        suppressDroneMicPostRef.current = Date.now();
        setDroneMicEnabled(Boolean(custom.detail.enabled));
        setIsListeningFromDrone(Boolean(custom.detail.listening));
        if (custom.detail.volume != null) {
          setDroneMicVolume([Number(custom.detail.volume)]);
        }
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

  // Single debounced effect for output selection (avoids duplicate API calls).
  // Skip the POST if the most recent state change was caused by a WS event —
  // otherwise we'd echo it straight back to the server and create a feedback loop.
  useEffect(() => {
    const sinceWsUpdate = Date.now() - suppressOutputPostRef.current;
    if (sinceWsUpdate < 400) return;
    const t = window.setTimeout(() => {
      apiJson("/api/audio/output/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceType: audioDevice,
          deviceId: audioDevice === "usb" ? selectedUsbDevice || "usb-default" : audioDevice === "gpio" ? "gpio-default" : audioDevice,
          volume: volume[0],
        }),
      }).catch((err) => console.warn("[SpeakerPanel] output select failed:", err));
    }, 150);
    return () => window.clearTimeout(t);
  }, [audioDevice, selectedUsbDevice, volume]);

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
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Text-to-speech is not supported in this browser");
      return;
    }

    // Some browsers leave speechSynthesis paused after long idle; wake it before speaking.
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {}

    const doSpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate[0];
      utterance.pitch = voiceType === "robotic" ? 0.5 : pitch[0];
      utterance.volume = volume[0] / 100;

      const selectedVoice = getSelectedVoice();
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang || "en-US";
      } else {
        utterance.lang = "en-US";
      }

      if (isPreview) {
        setIsPreviewing(true);
        utterance.onstart = () => {
          toast.success("Speaking preview...");
        };
        utterance.onend = () => setIsPreviewing(false);
        utterance.onerror = (event) => {
          console.warn("[SpeakerPanel] TTS error:", event);
          setIsPreviewing(false);
          const err = (event as any)?.error;
          if (err === "interrupted" || err === "canceled") return;
          toast.error(`TTS error${err ? `: ${err}` : ": no audio device"}`);
        };
      }

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("[SpeakerPanel] speechSynthesis.speak failed:", err);
        toast.error("TTS failed to start - try another voice");
        setIsPreviewing(false);
      }
    };

    // Voices are loaded async on Chromium; if the list is empty, wait once for voiceschanged.
    if (window.speechSynthesis.getVoices().length === 0) {
      let spoken = false;
      const handler = () => {
        if (spoken) return;
        spoken = true;
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        doSpeak();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
      // Fallback: even without voiceschanged we still attempt to speak using browser default.
      setTimeout(() => {
        if (spoken) return;
        spoken = true;
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        doSpeak();
      }, 250);
    } else {
      doSpeak();
    }
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
      const selectedDroneId = getSelectedDroneId();
      if (selectedDroneId) {
        await apiJson("/api/audio/session/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ droneId: selectedDroneId, mode: "talk" }),
        }).catch((err) => console.warn("[SpeakerPanel] session join failed:", err));
      }
      if (result?.live?.active === true) {
        setIsRecording(true);
        isStreamingRef.current = true;
        // Mark this tab as the active sender so GlobalAudioReceiver skips
        // playing back our own broadcasted chunks (echo prevention). We
        // store a unique owner token so a *different* SpeakerPanel instance
        // (StrictMode double-mount, or another panel in the same tab) only
        // clears the flag if it owns the current session — preventing one
        // instance from accidentally un-suppressing another's playback.
        try {
          const ownerToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          senderOwnerTokenRef.current = ownerToken;
          sessionStorage.setItem("mouse_audio_sender", ownerToken);
        } catch {}
      } else {
        throw new Error("Audio backend did not enter live mode");
      }

      // Start streaming mic chunks to the drone speaker (two-way audio).
      try {
        if (typeof MediaRecorder !== "undefined") {
          const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
              ? "audio/webm"
              : "";
          const recorder = preferredMime
            ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 32000 })
            : new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          let consecutiveStreamFailures = 0;
          recorder.addEventListener("error", (ev: Event) => {
            console.error("[SpeakerPanel] MediaRecorder error:", ev);
            toast.error("Microphone recording error — voice streaming stopped");
            // Clear sender flag so this tab resumes hearing other broadcasts
            // even if the recorder errors out — but only if we still own it.
            clearSenderFlagIfOwner();
            isStreamingRef.current = false;
            try { if (recorder.state !== "inactive") recorder.stop(); } catch {}
          });
          recorder.addEventListener("stop", () => {
            // Belt-and-suspenders: any stop event clears the sender flag too,
            // again only if we own it.
            clearSenderFlagIfOwner();
          });
          recorder.addEventListener("dataavailable", async (event: BlobEvent) => {
            if (!event.data || event.data.size === 0) return;
            // Don't POST chunks after the recorder/live session was stopped.
            // MediaRecorder can flush a final chunk AFTER stop() resolves, and
            // the server returns 409 if /api/audio/live is no longer active.
            if (!isStreamingRef.current || recorder.state === "inactive") return;
            try {
              const buf = await event.data.arrayBuffer();
              const bytes = new Uint8Array(buf);
              let bin = "";
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              const b64 = btoa(bin);
              if (!isStreamingRef.current) return; // re-check after async work
              const resp = await fetch("/api/audio/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chunk: b64,
                  mimeType: recorder.mimeType || "audio/webm;codecs=opus",
                  droneId: selectedDroneId || null,
                }),
              });
              if (!resp.ok) {
                // 409 = live session no longer active. That's an expected race
                // around stop() — silently swallow it instead of toasting and
                // halting the stream.
                if (resp.status === 409) {
                  isStreamingRef.current = false;
                  return;
                }
                consecutiveStreamFailures++;
                if (consecutiveStreamFailures === 1 || consecutiveStreamFailures % 10 === 0) {
                  toast.warning(`Voice stream error (HTTP ${resp.status}) — chunks may be dropping`);
                }
                if (consecutiveStreamFailures >= 5) {
                  toast.error("Voice streaming halted: too many failures. Stop & restart broadcast.");
                  try { if ((recorder.state as string) !== "inactive") recorder.stop(); } catch {}
                }
              } else {
                consecutiveStreamFailures = 0;
              }
            } catch (chunkErr) {
              console.warn("[SpeakerPanel] chunk send failed:", chunkErr);
              consecutiveStreamFailures++;
            }
          });
          recorder.start(500);
        }
      } catch (recErr) {
        // Recorder construction or .start() failed AFTER /api/audio/live/start
        // succeeded. Without this branch, the sender flag would stay set
        // forever (no recorder error/stop event will ever fire).
        console.warn("[SpeakerPanel] MediaRecorder unavailable:", recErr);
        toast.warning("Microphone recorder unavailable — broadcast started in TTS-only mode");
        clearSenderFlagIfOwner();
        isStreamingRef.current = false;
      }

      toast.success("Live broadcast started - speak into microphone");
    } catch (error: any) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }
      // Failure path: ensure sender flag is cleared even if it was set just
      // before the failure threw (e.g. server flips active=true but a later
      // step throws). Owner-aware so we don't clobber another instance.
      clearSenderFlagIfOwner();
      isStreamingRef.current = false;
      toast.error(error?.message || "Microphone access denied");
    }
  };

  const handleStopRecording = async () => {
    // Mark the streaming session inactive BEFORE stopping the MediaRecorder so
    // the dataavailable handler skips the final flushed chunk (which would
    // otherwise hit /api/audio/stream after live/stop and produce a 409).
    isStreamingRef.current = false;
    clearSenderFlagIfOwner();
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch (e) {
        console.warn("[SpeakerPanel] recorder stop failed:", e);
      }
      mediaRecorderRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    await apiJson("/api/audio/live/stop", { method: "POST" }).catch((err) => console.warn("[SpeakerPanel] live stop failed:", err));
    const selectedDroneId = getSelectedDroneId();
    if (selectedDroneId) {
      await apiJson("/api/audio/session/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ droneId: selectedDroneId }),
      }).catch((err) => console.warn("[SpeakerPanel] session leave failed:", err));
    }
    setIsRecording(false);
    toast.info("Live broadcast stopped");
    loadAudioStatus().catch((err) => console.warn("[SpeakerPanel] loadAudioStatus failed:", err));
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
    // Mark this as a user action so the WS broadcast handler doesn't immediately
    // overwrite our optimistic state and cause toggle flicker.
    lastUserDroneMicActionRef.current = Date.now();
    setIsListeningFromDrone(nextListeningState);
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
      const selectedDroneId = getSelectedDroneId();
      if (selectedDroneId) {
        if (nextListeningState) {
          await apiJson("/api/audio/session/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ droneId: selectedDroneId, mode: "listen" }),
          }).catch((err) => console.warn("[SpeakerPanel] session join (listen) failed:", err));
        } else {
          await apiJson("/api/audio/session/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ droneId: selectedDroneId }),
          }).catch((err) => console.warn("[SpeakerPanel] session leave (listen) failed:", err));
        }
      }
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
    }).catch((err) => console.warn("[SpeakerPanel] drone-mic volume update failed:", err));
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

      <Card className={`border ${isControllerMode ? "border-blue-500/50 bg-blue-500/5" : "border-emerald-500/50 bg-emerald-500/5"}`}>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isControllerMode ? <Monitor className="h-4 w-4 text-blue-500" /> : <Cpu className="h-4 w-4 text-emerald-500" />}
              <div>
                <p className="text-xs font-semibold" data-testid="text-device-env">
                  {isControllerMode ? "Ground Controller Mode" : "Drone Onboard Mode"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {micRoutedToDrone
                    ? "Microphone auto-routes to drone speaker"
                    : isControllerMode
                    ? "Mic routing: local preview"
                    : "Audio plays locally on drone hardware"}
                </p>
              </div>
            </div>
            {micRoutedToDrone && (
              <Badge className="bg-blue-500 text-[10px]" data-testid="badge-mic-routed">
                <Mic className="h-3 w-3 mr-1" />
                <ArrowRight className="h-3 w-3 mr-1" />
                <Speaker className="h-3 w-3" />
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

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
