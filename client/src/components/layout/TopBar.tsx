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
  Check
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
import type { Drone, UserMessage } from "@shared/schema";

interface UserSession {
  user: { id: string; username: string; role: string } | null;
  isLoggedIn: boolean;
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
  const [time, setTime] = useState(new Date());
  const [manualOverride, setManualOverride] = useState(false);
  const [manualReady, setManualReady] = useState(true);
  const [session, setSession] = useState<UserSession>(() => {
    const saved = localStorage.getItem('mouse_gcs_session');
    return saved ? JSON.parse(saved) : { user: null, isLoggedIn: false };
  });
  
  // Selected drone state
  const [selectedDrone, setSelectedDrone] = useState<Drone | null>(() => {
    const saved = localStorage.getItem('mouse_selected_drone');
    return saved ? JSON.parse(saved) : null;
  });

  // Messaging state
  const [messages, setMessages] = useState<UserMessage[]>(() => {
    const saved = localStorage.getItem('mouse_gcs_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [newMessage, setNewMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // @ mention autocomplete state
  const [chatUsers, setChatUsers] = useState<{ id: string; username: string; role: string }[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [selectedRecipient, setSelectedRecipient] = useState<{ id: string; username: string } | null>(null);
  
  // Save messages to localStorage as backup
  useEffect(() => {
    localStorage.setItem('mouse_gcs_messages', JSON.stringify(messages));
  }, [messages]);

  // Load messages from API on mount (filtered by user for DM privacy)
  useEffect(() => {
    const userId = session.user?.id;
    const url = userId ? `/api/messages?userId=${userId}` : '/api/messages';
    fetch(url)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages(data);
        }
      })
      .catch(() => {}); // Fail silently, use localStorage
  }, [session.user?.id]);

  // Load chat users for @ mention autocomplete
  useEffect(() => {
    fetch('/api/chat-users')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setChatUsers(data);
        }
      })
      .catch(() => {});
  }, [messages]); // Refresh when messages change to pick up new users

  // WebSocket subscription for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    const userId = session.user?.id;
    
    ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        if (type === 'new_message') {
          // Filter DMs client-side: only show if broadcast, user is sender, or user is recipient
          const isDMForMe = !data.recipientId || data.senderId === userId || data.recipientId === userId;
          if (!isDMForMe) return;
          
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
        } else if (type === 'message_updated') {
          setMessages(prev => prev.map(m => m.id === data.id ? data : m));
        } else if (type === 'message_deleted') {
          setMessages(prev => prev.map(m => 
            m.id === data.id ? { ...m, deleted: true, content: "[Message deleted]" } : m
          ));
        }
      } catch (e) {
        // Ignore parse errors
      }
    };
    
    return () => ws.close();
  }, [session.user?.id]);

  // Filter users for @ mention autocomplete
  const filteredMentionUsers = chatUsers
    .filter(u => u.id !== session.user?.id) // Exclude self
    .filter(u => u.username.toLowerCase().includes(mentionQuery.toLowerCase()));

  // Handle message input change for @ detection
  const handleMessageChange = (value: string) => {
    setNewMessage(value);
    
    // Clear selected recipient if message no longer starts with @username
    if (selectedRecipient) {
      const expectedPrefix = `@${selectedRecipient.username} `;
      if (!value.startsWith(expectedPrefix)) {
        setSelectedRecipient(null);
      }
    }
    
    // Check for @ mention
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

  // Select a user from mention dropdown
  const selectMention = (user: { id: string; username: string }) => {
    const lastAtIndex = newMessage.lastIndexOf('@');
    const beforeMention = newMessage.slice(0, lastAtIndex);
    setNewMessage(beforeMention + '@' + user.username + ' ');
    setSelectedRecipient(user);
    setShowMentions(false);
    setMentionQuery("");
    inputRef.current?.focus();
  };

  // Handle keyboard navigation in mention dropdown
  const handleMessageKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filteredMentionUsers.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(filteredMentionUsers[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !showMentions) {
      sendMessage();
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !session.user) return;
    
    // Extract recipient from message if it starts with @username
    let recipientId = selectedRecipient?.id || null;
    let recipientName = selectedRecipient?.username || null;
    let messageContent = newMessage.trim();
    
    // Check if message starts with @username pattern
    const mentionMatch = messageContent.match(/^@(\S+)\s+(.+)$/);
    if (mentionMatch) {
      const mentionedUsername = mentionMatch[1];
      const matchedUser = chatUsers.find(u => u.username.toLowerCase() === mentionedUsername.toLowerCase());
      if (matchedUser) {
        recipientId = matchedUser.id;
        recipientName = matchedUser.username;
        messageContent = mentionMatch[2]; // Content after the @mention
      }
    }
    
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: session.user.id,
          senderName: session.user.username,
          senderRole: session.user.role,
          content: messageContent,
          recipientId,
          recipientName
        })
      });
      
      if (res.ok) {
        const message = await res.json();
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
        setNewMessage("");
        setSelectedRecipient(null);
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      // Offline fallback - create local message
      const message: UserMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        senderId: session.user.id,
        senderName: session.user.username,
        senderRole: session.user.role,
        recipientId,
        recipientName,
        content: messageContent,
        timestamp: new Date().toISOString(),
        editedAt: null,
        deleted: false
      };
      setMessages(prev => [...prev, message]);
      setNewMessage("");
      setSelectedRecipient(null);
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
      
      if (res.ok) {
        const updated = await res.json();
        setMessages(prev => prev.map(m => m.id === id ? updated : m));
      }
    } catch (e) {
      // Offline fallback
      setMessages(prev => prev.map(m => 
        m.id === id ? { ...m, content: editContent.trim(), editedAt: new Date().toISOString() } : m
      ));
    }
    
    setEditingId(null);
    setEditContent("");
  };

  const deleteMessage = async (id: string) => {
    try {
      await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    } catch (e) {
      // Ignore errors - update locally anyway
    }
    setMessages(prev => prev.map(m => 
      m.id === id ? { ...m, deleted: true, content: "[Message deleted]" } : m
    ));
  };

  const startEdit = (msg: UserMessage) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };
  
  // Listen for session changes
  useEffect(() => {
    const handleSessionChange = (e: CustomEvent<UserSession>) => {
      setSession(e.detail);
    };
    window.addEventListener('session-change' as any, handleSessionChange);
    return () => window.removeEventListener('session-change' as any, handleSessionChange);
  }, []);

  // Listen for drone selection changes
  useEffect(() => {
    const handleDroneChange = (e: CustomEvent<Drone>) => {
      setSelectedDrone(e.detail);
    };
    window.addEventListener('drone-selected' as any, handleDroneChange);
    return () => window.removeEventListener('drone-selected' as any, handleDroneChange);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('mouse_gcs_session');
    localStorage.removeItem('mouse_selected_drone');
    setSession({ user: null, isLoggedIn: false });
    setSelectedDrone(null);
    window.dispatchEvent(new CustomEvent('session-change', { detail: { user: null, isLoggedIn: false } }));
    toast.info("Logged out successfully");
  };

  const handleSwitchDrone = () => {
    window.dispatchEvent(new CustomEvent('show-drone-selection'));
    toast.info("Select a different drone");
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
          onClick={() => {
            if (confirm("EMERGENCY LANDING: This will find a safe clearing and land immediately. Continue?")) {
              toast.error("EMERGENCY LANDING INITIATED - Finding safe landing zone...", { duration: 5000 });
            }
          }}
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
                      {showMentions && filteredMentionUsers.length > 0 && (
                        <div className="absolute bottom-full left-0 w-full mb-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-32 overflow-y-auto" data-testid="mention-dropdown">
                          {filteredMentionUsers.map((user, idx) => (
                            <div
                              key={user.id}
                              className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between ${
                                idx === mentionIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                              }`}
                              onClick={() => selectMention(user)}
                              data-testid={`mention-user-${user.id}`}
                            >
                              <span className="font-medium">@{user.username}</span>
                              <Badge variant="outline" className="h-4 text-[8px] px-1">{user.role}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                      {selectedRecipient && (
                        <div className="absolute -top-5 left-0 text-[10px] text-primary">
                          DM to @{selectedRecipient.username}
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
          onClick={onSettingsClick}
          data-testid="button-settings"
        >
          <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </header>
  );
}
