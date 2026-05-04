import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Wifi, 
  Battery, 
  Signal, 
  Satellite, 
  Gamepad2,
  AlertTriangle,
  Settings,
  MessageSquare,
  Mic,
  CheckCircle,
  XCircle,
  LogOut,
  User,
  Plane,
  ChevronDown,
  RefreshCw,
  Send,
  Edit2,
  Trash2,
  X,
  Check,
  ListChecks
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Drone, UserMessage, MessageRecipient, UserGroup } from "@shared/schema";
import { dispatchBackendCommand } from "@/lib/commandService";
import { useAppState } from "@/contexts/AppStateContext";
import { clearStoredSession, readStoredSessionToken, writeStoredSelectedDrone } from "@/lib/clientState";
import { queryClient } from "@/lib/queryClient";

interface UserSession {
  user: { id: string; username: string; role: string } | null;
  isLoggedIn: boolean;
}

interface MentionOption {
  id: string;
  username: string;
  fullName: string;
  role: string;
  type: 'user' | 'group' | 'broadcast';
  memberIds?: string[]; // For groups - members to expand to
}

interface TopBarProps {
  onSettingsClick?: () => void;
}

interface SystemDiagnostics {
  gpsConnected: boolean;
  gpsCount: number;
  rcSignal: number;
  telemetryLink: number;
  batteryVoltage: number;
  batteryPercent: number;
  fcConnected: boolean;
  lidarConnected: boolean;
  cameraConnected: boolean;
}

export function TopBar({ onSettingsClick }: TopBarProps) {
  const { session, selectedDrone, clearSession, selectDrone } = useAppState();
  const [time, setTime] = useState(new Date());
  const [manualOverride, setManualOverride] = useState(false);
  const [manualReady, setManualReady] = useState(true);
  const [emergencyBusy, setEmergencyBusy] = useState(false);

  // Messaging state - server is source of truth; no localStorage backup
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // @ mention autocomplete state - includes fullName for better matching
  const [chatUsers, setChatUsers] = useState<{ id: string; username: string; fullName: string; role: string }[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  // Multi-recipient support: persistent array of recipients until @all or changed
  const [selectedRecipients, setSelectedRecipients] = useState<MessageRecipient[]>([]);

  // Load messages from API on mount (filtered by user for DM privacy); server is source of truth
  useEffect(() => {
    const userId = session.user?.id;
    const url = userId ? `/api/messages?userId=${userId}` : '/api/messages';
    fetch(url)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setMessages(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.warn("[TopBar] messages fetch failed:", err));
  }, [session.user?.id]);

  // Load users and groups for @ mention autocomplete
  useEffect(() => {
    const loadData = async () => {
      try {
        const usersRes = await fetch('/api/admin/users');
        const usersPayload = await usersRes.json().catch(() => ({}));
        if (usersRes.ok && Array.isArray(usersPayload?.users)) {
          const users = usersPayload.users
            .filter((u: any) => u.enabled !== false)
            .map((u: any) => ({
              id: String(u.id || ""),
              username: String(u.username || ""),
              fullName: String(u.fullName || u.username || ""),
              role: String(u.role || "viewer"),
            }))
            .filter((u: any) => u.id && u.username);
          setChatUsers(users);
        } else {
          const chatRes = await fetch('/api/chat-users');
          const chatPayload = await chatRes.json().catch(() => []);
          if (chatRes.ok && Array.isArray(chatPayload)) {
            setChatUsers(chatPayload.map((u: any) => ({
              id: String(u.id || ""),
              username: String(u.username || ""),
              fullName: String(u.username || ""),
              role: String(u.role || "viewer"),
            })).filter((u: any) => u.id && u.username));
          } else {
            setChatUsers([]);
          }
        }
      } catch {
        setChatUsers([]);
      }

      try {
        const groupsRes = await fetch('/api/groups');
        const groupsPayload = await groupsRes.json().catch(() => ({}));
        if (groupsRes.ok && Array.isArray(groupsPayload?.groups)) {
          setUserGroups(groupsPayload.groups as UserGroup[]);
        } else {
          setUserGroups([]);
        }
      } catch {
        setUserGroups([]);
      }
    };
    
    const onStorage = () => {
      void loadData();
    };
    const onUsersUpdated = () => {
      void loadData();
    };
    const onGroupsUpdated = () => {
      void loadData();
    };

    void loadData();
    // Listen for cross-tab storage events
    window.addEventListener('storage', onStorage);
    // Listen for same-tab user updates (custom event from UserAccessPanel)
    window.addEventListener('users-updated', onUsersUpdated);
    // Listen for group updates
    window.addEventListener('groups-updated', onGroupsUpdated);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('users-updated', onUsersUpdated);
      window.removeEventListener('groups-updated', onGroupsUpdated);
    };
  }, [session]);

  // WebSocket subscription for real-time updates with reconnect
  useEffect(() => {
    let tornDown = false;
    let currentWs: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    const MAX_RECONNECT_DELAY_MS = 30000;
    const INITIAL_RECONNECT_DELAY_MS = 1000;

    const connect = (attempt = 0) => {
      if (tornDown) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      currentWs = new WebSocket(`${protocol}//${window.location.host}/ws`);
      const ws = currentWs;

      ws.onopen = () => {
        const sessionToken = readStoredSessionToken();
        if (sessionToken) {
          ws.send(JSON.stringify({ type: 'auth', sessionToken }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          if (type === 'new_message') {
            setMessages(prev => {
              if (prev.some(m => m.id === data.id)) return prev;
              const updated = [...prev, data];
              return updated.length > 200 ? updated.slice(-200) : updated;
            });
          } else if (type === 'message_updated') {
            setMessages(prev => prev.map(m => m.id === data.id ? data : m));
          } else if (type === 'message_deleted') {
            setMessages(prev => prev.map(m =>
              m.id === data.id ? { ...m, deleted: true, content: "[Message deleted]" } : m
            ));
          } else if (type === 'telemetry' || type === 'telemetry_recorded') {
            const normalized = {
              ...data,
              position: data.position || (
                typeof data.latitude === 'number' && typeof data.longitude === 'number'
                  ? { lat: data.latitude, lng: data.longitude }
                  : undefined
              ),
              heading: data.heading ?? data.yaw ?? 0,
              groundSpeed: data.groundSpeed ?? data.speed ?? 0,
              source: 'ws',
            };
            (window as any).__currentTelemetry = normalized;
            window.dispatchEvent(new CustomEvent('telemetry-update', { detail: normalized }));
          } else if (type === 'sensor_data') {
            window.dispatchEvent(new CustomEvent('sensor-update', { detail: data }));
          } else if (type === 'motor_telemetry') {
            window.dispatchEvent(new CustomEvent('motor-telemetry-update', { detail: data }));
          } else if (type === 'adsb' || type === 'adsb_update') {
            window.dispatchEvent(new CustomEvent('adsb-update', { detail: data }));
          } else if (type === 'audio_output_selected') {
            window.dispatchEvent(new CustomEvent('audio-output-updated', { detail: data }));
          } else if (type === 'audio_live') {
            window.dispatchEvent(new CustomEvent('audio-live-updated', { detail: data }));
          } else if (type === 'audio_drone_mic') {
            window.dispatchEvent(new CustomEvent('audio-drone-mic-updated', { detail: data }));
          } else if (type === 'audio_tts') {
            window.dispatchEvent(new CustomEvent('audio-tts-broadcast', { detail: data }));
          } else if (type === 'audio_chunk') {
            // Mic audio chunk from another GCS — GlobalAudioReceiver plays it.
            window.dispatchEvent(new CustomEvent('audio-chunk-incoming', { detail: data }));
          } else if (type === 'audio_buzzer') {
            window.dispatchEvent(new CustomEvent('audio-buzzer-played', { detail: data }));
          } else if (type === 'drone_added' || type === 'drone_updated') {
            void queryClient.invalidateQueries({ queryKey: ["/api/drones"] });
            if (selectedDrone?.id && String(data?.id) === String(selectedDrone.id)) {
              writeStoredSelectedDrone(data);
              selectDrone(data);
            }
          } else if (type === 'drone_location') {
            void queryClient.invalidateQueries({ queryKey: ["/api/drones"] });
            if (selectedDrone?.id && String(data?.id) === String(selectedDrone.id)) {
              const nextDrone = { ...selectedDrone, ...data };
              writeStoredSelectedDrone(nextDrone);
              selectDrone(nextDrone);
            }
          } else if (type === 'drone_removed') {
            void queryClient.invalidateQueries({ queryKey: ["/api/drones"] });
            if (selectedDrone?.id && String(data?.id) === String(selectedDrone.id)) {
              selectDrone(null);
              toast.warning("Selected drone was removed");
            }
          } else if (type === 'app_config_updated') {
            // Unified app-config: a key was changed (by us, by another GCS,
            // or by external admin tooling via Firebase RTDB). Fan out to
            // useAppConfig consumers via a CustomEvent and invalidate the
            // snapshot cache so any non-subscribed reader picks it up.
            window.dispatchEvent(new CustomEvent('app-config-updated', { detail: data }));
            void queryClient.invalidateQueries({ queryKey: ["/api/app-config"] });
          } else if (type === 'mission_updated') {
            // Mission run state changed (started / waypoint reached / completed).
            // Refresh both the mission list and the per-mission cache so any
            // open mission panel reflects the new status without polling.
            void queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
            if (data?.missionId) {
              void queryClient.invalidateQueries({ queryKey: ["/api/missions", data.missionId] });
            }
            window.dispatchEvent(new CustomEvent('mission-updated', { detail: data }));
          } else if (type === 'geofence_breach') {
            window.dispatchEvent(new CustomEvent('geofence-breach', { detail: data }));
            if (data?.cleared) {
              toast.success(`Geofence cleared (${data.zoneId || 'zone'})`);
            } else {
              const zone = data?.zoneName || data?.zoneId || 'geofence zone';
              const action = String(data?.action || 'rtl').toUpperCase();
              const dispatched = data?.dispatched ? `auto-${action} dispatched` : `${action} not dispatched (insufficient permission)`;
              toast.error(`Geofence breach: ${zone} — ${dispatched}`);
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        window.dispatchEvent(new CustomEvent('connection-lost', { detail: { source: 'websocket' } }));
        if (tornDown) return;
        const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * Math.pow(2, attempt), MAX_RECONNECT_DELAY_MS);
        reconnectTimeout = setTimeout(() => connect(attempt + 1), delay);
      };

      ws.onerror = () => { /* Handled in onclose */ };
    };

    connect();

    return () => {
      tornDown = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (currentWs) {
        currentWs.onclose = () => {};
        currentWs.close();
        currentWs = null;
      }
    };
  }, [session.user?.id]);

  // Filter users and groups for @ mention autocomplete
  // Includes @all option for broadcasting to everyone
  const filteredMentionOptions: MentionOption[] = (() => {
    const query = mentionQuery.toLowerCase().trim();
    
    // Add "all" option when query matches "all" or is empty
    const allOption: MentionOption = { 
      id: 'all', 
      username: 'all', 
      fullName: 'Everyone (Broadcast)', 
      role: 'broadcast',
      type: 'broadcast'
    };
    const showAllOption = query === '' || 'all'.startsWith(query);
    
    // Filter users by username or fullName
    const matchedUsers: MentionOption[] = chatUsers
      .filter(u => u.id !== session.user?.id) // Exclude self
      .filter(u => {
        if (!query) return true; // Show all when no query
        const usernameMatch = u.username.toLowerCase().includes(query);
        const fullNameMatch = u.fullName.toLowerCase().includes(query);
        return usernameMatch || fullNameMatch;
      })
      .map(u => ({
        ...u,
        type: 'user' as const,
        // Score for sorting - prioritize matches that start with query
        _score: (() => {
          if (!query) return 0;
          const usernameStarts = u.username.toLowerCase().startsWith(query) ? 2 : 0;
          const fullNameStarts = u.fullName.toLowerCase().startsWith(query) ? 1 : 0;
          return usernameStarts + fullNameStarts;
        })()
      }))
      .sort((a, b) => (b as any)._score - (a as any)._score);
    
    // Filter groups by name
    const matchedGroups: MentionOption[] = userGroups
      .filter(g => {
        if (!query) return true;
        return g.name.toLowerCase().includes(query);
      })
      .map(g => ({
        id: g.id,
        username: g.name,
        fullName: `Group (${g.memberIds.length} members)`,
        role: 'group',
        type: 'group' as const,
        memberIds: g.memberIds
      }));
    
    // Combine results: groups first if matching, then users, then @all
    const results: MentionOption[] = [];
    
    // Add matching groups first
    results.push(...matchedGroups);
    
    // Add matching users
    results.push(...matchedUsers);
    
    // Add @all option at end (or beginning if typing "all")
    if (showAllOption && query.length > 0 && 'all'.startsWith(query)) {
      return [allOption, ...results];
    }
    if (showAllOption && query === '') {
      results.push(allOption);
    }
    
    return results;
  })();

  // Handle message input change for @ detection
  const handleMessageChange = (value: string) => {
    setNewMessage(value);
    
    // Check for @ mention trigger
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const afterAt = value.slice(lastAtIndex + 1);
      // Only show dropdown if @ is at start or after a space, and no space after
      const beforeAt = value.slice(0, lastAtIndex);
      const isValidPosition = lastAtIndex === 0 || beforeAt.endsWith(' ');
      const hasNoSpaceAfter = !afterAt.includes(' ');
      
      if (isValidPosition && hasNoSpaceAfter) {
        setMentionQuery(afterAt);
        setShowMentions(true);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentions(false);
    setMentionQuery("");
  };

  // Select a user/group from mention dropdown - supports multi-recipient
  const selectMention = (option: MentionOption) => {
    const lastAtIndex = newMessage.lastIndexOf('@');
    const beforeMention = newMessage.slice(0, lastAtIndex);
    setNewMessage(beforeMention); // Clear the @mention from input
    
    // @all means broadcast to everyone - clears all recipients
    if (option.type === 'broadcast') {
      setSelectedRecipients([]); // Empty = broadcast to all
    } else if (option.type === 'group') {
      // Group: expand to all members as recipients
      const groupMembers = chatUsers
        .filter(u => option.memberIds?.includes(u.id))
        .filter(u => u.id !== session.user?.id) // Exclude self
        .map(u => ({ id: u.id, name: u.username, type: 'user' as const }));
      
      // Replace existing recipients with group members
      setSelectedRecipients(groupMembers);
    } else {
      // User: add to existing recipients (allow multi-select)
      const newRecipient: MessageRecipient = { 
        id: option.id, 
        name: option.username, 
        type: 'user' 
      };
      
      // Check if already in list
      setSelectedRecipients(prev => {
        if (prev.some(r => r.id === option.id)) return prev;
        return [...prev, newRecipient];
      });
    }
    
    setShowMentions(false);
    setMentionQuery("");
    inputRef.current?.focus();
  };
  
  // Clear a specific recipient from selection
  const removeRecipient = (recipientId: string) => {
    setSelectedRecipients(prev => prev.filter(r => r.id !== recipientId));
  };
  
  // Clear all recipients (switch to broadcast)
  const clearAllRecipients = () => {
    setSelectedRecipients([]);
  };

  // Handle keyboard navigation in mention dropdown
  const handleMessageKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredMentionOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredMentionOptions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(filteredMentionOptions[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !showMentions) {
      sendMessage();
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !session.user) return;
    
    const messageContent = newMessage.trim();
    
    // Use persistent selectedRecipients - empty array = broadcast to all
    // For backward compatibility, also set recipientId/recipientName for single recipient
    const recipients = selectedRecipients.length > 0 ? selectedRecipients : null;
    const recipientId = selectedRecipients.length === 1 ? selectedRecipients[0].id : null;
    const recipientName = selectedRecipients.length === 1 ? selectedRecipients[0].name : null;
    
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageContent,
          recipientId,
          recipientName,
          recipients // New multi-recipient field
        })
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || "Message send failed");
      }

      const message = await res.json();
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        const updated = [...prev, message];
        return updated.length > 200 ? updated.slice(-200) : updated;
      });
      setNewMessage(""); // Clear message but KEEP selectedRecipients (persistent)
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch {
      toast.error("Message send failed");
    }
  };

  const editMessage = async (id: string) => {
    if (!editContent.trim()) return;
    
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() })
      });

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload?.error || "Message update failed");
      }

      const updated = await res.json();
      setMessages(prev => prev.map(m => m.id === id ? updated : m));
    } catch {
      toast.error("Message update failed");
    }
    
    setEditingId(null);
    setEditContent("");
  };

  const deleteMessage = async (id: string) => {
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error();
      }
    } catch {
      toast.error("Message delete failed");
      return;
    }
    setMessages(prev => prev.map(m => 
      m.id === id ? { ...m, deleted: true, content: "[Message deleted]" } : m
    ));
  };

  const startEdit = (msg: UserMessage) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };
  
  const handleLogout = async () => {
    const sessionToken = readStoredSessionToken();
    if (sessionToken) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'X-Session-Token': sessionToken },
        });
      } catch {
        // best-effort logout; local session is still cleared below
      }
    }
    clearSession();
    clearStoredSession();
    toast.info("Logged out successfully");
  };

  const handleSwitchDrone = () => {
    window.dispatchEvent(new CustomEvent('show-drone-selection'));
    toast.info("Select a different drone");
  };

  const handleEmergencyLand = async () => {
    if (emergencyBusy) return;
    if (!confirm("EMERGENCY LANDING: This will immediately command LAND. Continue?")) {
      return;
    }
    setEmergencyBusy(true);
    try {
      await dispatchBackendCommand({
        commandType: "land",
        timeoutMs: 20000,
      });
      toast.error("EMERGENCY LAND COMMAND ACKNOWLEDGED", { duration: 5000 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Emergency LAND command failed");
    } finally {
      setEmergencyBusy(false);
    }
  };
  
  // Real diagnostics from WebSocket - defaults to disconnected state
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics>({
    gpsConnected: false,
    gpsCount: 0,
    rcSignal: 0,
    telemetryLink: 0,
    batteryVoltage: 0,
    batteryPercent: 0,
    fcConnected: false,
    lidarConnected: false,
    cameraConnected: false
  });

  // Listen for telemetry updates from WebSocket
  useEffect(() => {
    const handleTelemetry = (e: CustomEvent) => {
      const data = e.detail;
      if (data) {
        setDiagnostics(prev => ({
          ...prev,
          gpsConnected: data.gpsSatellites > 0,
          gpsCount: data.gpsSatellites || 0,
          batteryVoltage: data.batteryVoltage || 0,
          batteryPercent: data.batteryPercent || 0,
          fcConnected: true,
          telemetryLink: 100,
        }));
      }
    };
    window.addEventListener('telemetry-update' as any, handleTelemetry);
    return () => window.removeEventListener('telemetry-update' as any, handleTelemetry);
  }, []);

  // Calculate auto system status based on diagnostics
  const calculateSystemStatus = (): { ready: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    if (!diagnostics.fcConnected) issues.push("Flight controller disconnected");
    if (!diagnostics.gpsConnected || diagnostics.gpsCount < 6) issues.push("GPS signal weak");
    if (diagnostics.rcSignal < 50) issues.push("RC signal low");
    if (diagnostics.telemetryLink < 50) issues.push("Telemetry link weak");
    if (diagnostics.batteryPercent < 20) issues.push("Battery critical");
    if (!diagnostics.lidarConnected) issues.push("Lidar disconnected");
    
    return { ready: issues.length === 0, issues };
  };

  const systemStatus = calculateSystemStatus();
  const isReady = manualOverride ? manualReady : systemStatus.ready;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 border-b border-border bg-card/80 backdrop-blur-md px-2 sm:px-4 flex items-center justify-between shrink-0 z-50 relative">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleSwitchDrone}
              className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
              data-testid="button-switch-drone"
            >
              <Gamepad2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse" />
              <h1 className="text-base sm:text-xl font-bold tracking-wider text-foreground font-sans whitespace-nowrap">
                <span className="hidden sm:inline">M.O.U.S.E.</span>
                <span className="sm:hidden">MOUSE</span>
                <span className="text-muted-foreground text-xs sm:text-sm font-normal hidden md:inline"> GCS v1.0</span>
              </h1>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Click to switch drones</p>
          </TooltipContent>
        </Tooltip>
        
        {selectedDrone && (
          <>
            <div className="h-6 w-px bg-border mx-1" />
            <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-md">
              <Plane className="h-4 w-4 text-primary" />
              <div className="text-xs">
                <span className="font-bold">{selectedDrone.callsign}</span>
                <span className="text-muted-foreground ml-2 hidden sm:inline">{selectedDrone.name}</span>
              </div>
              <Badge 
                variant="outline" 
                className={`text-[10px] px-1.5 py-0 ${
                  selectedDrone.status === 'flying' ? 'text-blue-500 border-blue-500' :
                  selectedDrone.status === 'online' ? 'text-emerald-500 border-emerald-500' :
                  selectedDrone.status === 'armed' ? 'text-amber-500 border-amber-500' :
                  'text-gray-500 border-gray-500'
                }`}
              >
                {selectedDrone.status?.toUpperCase() || 'OFFLINE'}
              </Badge>
            </div>
          </>
        )}
        <div className="h-6 w-px bg-border mx-1 sm:mx-2 hidden sm:block" />
        
        {/* System Ready Status with Popover for manual override */}
        <Popover>
          <PopoverTrigger asChild>
            <Badge 
              variant="outline" 
              className={`cursor-pointer px-3 font-mono ${
                isReady 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              }`}
              data-testid="badge-system-status"
            >
              {isReady ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  SYSTEM READY
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  CHECK SYSTEM
                </>
              )}
              {manualOverride && <span className="ml-1 text-[10px]">(M)</span>}
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold">System Diagnostics</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Manual</Label>
                  <Switch 
                    checked={manualOverride}
                    onCheckedChange={setManualOverride}
                  />
                </div>
              </div>
              
              {manualOverride && (
                <div className="p-2 bg-amber-500/10 rounded border border-amber-500/30 text-xs">
                  <div className="flex items-center justify-between">
                    <span>Force System Status:</span>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant={manualReady ? "default" : "outline"}
                        className="h-6 text-xs px-2"
                        onClick={() => setManualReady(true)}
                      >
                        Ready
                      </Button>
                      <Button 
                        size="sm" 
                        variant={!manualReady ? "destructive" : "outline"}
                        className="h-6 text-xs px-2"
                        onClick={() => setManualReady(false)}
                      >
                        Not Ready
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span>Flight Controller</span>
                  {diagnostics.fcConnected ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>GPS ({diagnostics.gpsCount} sats)</span>
                  {diagnostics.gpsConnected && diagnostics.gpsCount >= 6 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>RC Signal ({diagnostics.rcSignal}%)</span>
                  {diagnostics.rcSignal >= 50 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Telemetry ({diagnostics.telemetryLink}%)</span>
                  {diagnostics.telemetryLink >= 50 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Battery ({diagnostics.batteryPercent}%)</span>
                  {diagnostics.batteryPercent >= 20 ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span>Lidar</span>
                  {diagnostics.lidarConnected ? (
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
              </div>
              
              {!systemStatus.ready && !manualOverride && (
                <div className="p-2 bg-destructive/10 rounded text-xs text-destructive">
                  <p className="font-bold mb-1">Issues detected:</p>
                  <ul className="list-disc list-inside">
                    {systemStatus.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 px-2 font-mono text-[10px] sm:text-xs">
          <span className="hidden sm:inline">MODE:</span>STAB
        </Badge>

      </div>

      {/* Right Section - Telemetry, Emergency, Comms, Time, User */}
      <div className="flex items-center gap-1 sm:gap-2 lg:gap-4 shrink-0">
        {/* Telemetry Status Bar - Always visible with compact display on small screens */}
        <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-0.5" title="GPS Satellites">
            <Satellite className="h-3 w-3 text-primary" />
            <span className="text-foreground">{diagnostics.gpsCount}</span>
          </div>
          <div className="flex items-center gap-0.5" title="RC Signal Strength">
            <Signal className="h-3 w-3 text-emerald-500" />
            <span className="text-foreground">{diagnostics.rcSignal}</span>
          </div>
          <div className="flex items-center gap-0.5 hidden sm:flex" title="Telemetry Link Quality">
            <Wifi className="h-3 w-3 text-emerald-500" />
            <span className="text-foreground">{diagnostics.telemetryLink}</span>
          </div>
          <div className="flex items-center gap-0.5" title="Drone Battery">
            <Battery className="h-3 w-3 text-emerald-500" />
            <span className="text-foreground">{diagnostics.batteryPercent}%</span>
          </div>
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Emergency Button - Moved to right section */}
        <Button 
          variant="destructive" 
          size="sm" 
          className="gap-1 font-bold animate-pulse hover:animate-none px-2 h-7 text-[10px] sm:text-xs shrink-0"
          onClick={handleEmergencyLand}
          disabled={emergencyBusy}
          data-testid="button-emergency-land"
        >
          <ChevronDown className="h-3 w-3" />
          <span className="hidden sm:inline">SOS</span>
        </Button>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Comms Panel - Team Messaging */}
        <Popover>
          <PopoverTrigger asChild>
             <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground px-2 h-8">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden lg:inline text-xs font-mono uppercase">Comms</span>
                {messages.filter(m => !m.deleted).length > 0 && (
                  <Badge className="h-4 min-w-4 p-0 flex items-center justify-center bg-primary text-[10px]">
                    {messages.filter(m => !m.deleted).length}
                  </Badge>
                )}
             </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0 mr-4 bg-card/95 backdrop-blur border-border" align="end">
             <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="font-mono font-bold text-sm">TEAM COMMS</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{messages.filter(m => !m.deleted).length} messages</span>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
             </div>
             <ScrollArea className="h-72 p-3">
                <div className="space-y-3">
                  {messages.filter(m => !m.deleted).length === 0 ? (
                    <div className="text-center text-muted-foreground text-xs py-8">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    messages.map((msg) => {
                      if (msg.deleted) return null;
                      const isOwn = session.user?.id === msg.senderId;
                      const msgTime = new Date(msg.timestamp);
                      const timeStr = msgTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      
                      return (
                        <div key={msg.id} className={`flex flex-col gap-1 ${isOwn ? 'items-end' : ''}`}>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            <span>{timeStr}</span>
                            <span className="font-medium">{msg.senderName}</span>
                            {msg.recipientName && (
                              <span className="text-primary">→ @{msg.recipientName}</span>
                            )}
                            <Badge variant="outline" className="h-4 text-[8px] px-1">
                              {msg.senderRole}
                            </Badge>
                            {msg.recipientId && (
                              <Badge variant="secondary" className="h-4 text-[8px] px-1 bg-primary/20 text-primary">DM</Badge>
                            )}
                            {msg.editedAt && <span className="italic">(edited)</span>}
                          </div>
                          
                          {editingId === msg.id ? (
                            <div className="flex gap-1 w-full">
                              <Input
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="h-7 text-xs flex-1"
                                onKeyDown={(e) => e.key === 'Enter' && editMessage(msg.id)}
                                data-testid={`input-edit-message-${msg.id}`}
                              />
                              <Button size="icon" className="h-7 w-7" onClick={() => editMessage(msg.id)}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className={`group relative p-2 rounded text-xs max-w-[280px] ${
                              isOwn ? 'bg-primary/20 text-primary' : 'bg-muted/50'
                            }`}>
                              <p className="break-words">{msg.content}</p>
                              {isOwn && (
                                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5 bg-background rounded border shadow-sm">
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-5 w-5"
                                    onClick={() => startEdit(msg)}
                                    data-testid={`button-edit-message-${msg.id}`}
                                  >
                                    <Edit2 className="h-2.5 w-2.5" />
                                  </Button>
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-5 w-5 text-destructive hover:text-destructive"
                                    onClick={() => deleteMessage(msg.id)}
                                    data-testid={`button-delete-message-${msg.id}`}
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={scrollRef} />
                </div>
             </ScrollArea>
             <div className="p-2 border-t border-border flex gap-2">
                {session.isLoggedIn ? (
                  <div className="flex-1 flex gap-2 relative">
                    <div className="flex-1 relative">
                      <Input
                        ref={inputRef}
                        placeholder="Type @ to DM someone..."
                        value={newMessage}
                        onChange={(e) => handleMessageChange(e.target.value)}
                        onKeyDown={handleMessageKeyDown}
                        className="h-8 text-xs w-full"
                        data-testid="input-new-message"
                      />
                      {showMentions && filteredMentionOptions.length > 0 && (
                        <div className="absolute bottom-full left-0 w-full mb-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto" data-testid="mention-dropdown">
                          {filteredMentionOptions.map((option, idx) => (
                            <div
                              key={option.id}
                              className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between gap-2 ${
                                idx === mentionIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                              }`}
                              onClick={() => selectMention(option)}
                              data-testid={`mention-option-${option.id}`}
                            >
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="font-medium truncate">@{option.username}</span>
                                {option.fullName !== option.username && (
                                  <span className="text-[10px] text-muted-foreground truncate">{option.fullName}</span>
                                )}
                              </div>
                              <Badge 
                                variant={option.type === 'broadcast' ? 'default' : option.type === 'group' ? 'secondary' : 'outline'} 
                                className={`h-4 text-[8px] px-1 shrink-0 ${option.type === 'broadcast' ? 'bg-primary' : option.type === 'group' ? 'bg-blue-500 text-white' : ''}`}
                              >
                                {option.type === 'broadcast' ? 'Everyone' : option.type === 'group' ? 'Group' : option.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedRecipients.length > 0 && (
                        <div className="absolute -top-6 left-0 right-0 flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">To:</span>
                          {selectedRecipients.map(r => (
                            <Badge 
                              key={r.id} 
                              variant="secondary" 
                              className="h-4 text-[10px] px-1 gap-0.5 cursor-pointer hover:bg-destructive/20"
                              onClick={() => removeRecipient(r.id)}
                              data-testid={`recipient-badge-${r.id}`}
                            >
                              @{r.name}
                              <X className="h-2 w-2" />
                            </Badge>
                          ))}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-4 w-4" 
                            onClick={clearAllRecipients}
                            title="Clear all - switch to broadcast"
                            data-testid="button-clear-recipients"
                          >
                            <X className="h-2 w-2" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={sendMessage} className="h-8 px-3" data-testid="button-send-message">
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground text-center w-full py-1">
                    Log in to send messages
                  </div>
                )}
             </div>
          </PopoverContent>
        </Popover>

        <div className="font-mono text-xs sm:text-lg text-foreground tabular-nums">
          {time.toLocaleTimeString([], { hour12: false })}
        </div>
        
        {session.isLoggedIn && (
          <div className="flex items-center gap-1 sm:gap-2 border-l border-border pl-2 sm:pl-4">
            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm">
              <User className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              <span className="font-medium">{session.user?.username}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-7 w-7 sm:h-9 sm:w-9"
              onClick={handleLogout}
              title="Log out"
              data-testid="button-logout-topbar"
            >
              <LogOut className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        )}

        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9"
          onClick={() => window.dispatchEvent(new CustomEvent("navigate-tab", { detail: { tabId: "mp-parity" } }))}
          data-testid="button-mp-parity"
          title="Mission Planner Parity Checklist"
        >
          <ListChecks className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>

        <Button 
          variant="ghost" 
          size="icon"
          className="h-8 w-8 sm:h-9 sm:w-9"
          onClick={onSettingsClick}
          data-testid="button-settings"
        >
          <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </header>
  );
}
