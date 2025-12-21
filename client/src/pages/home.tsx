import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TelemetryPanel } from "@/components/telemetry/TelemetryPanel";
import { MapInterface } from "@/components/map/MapInterface";
import { ControlDeck } from "@/components/controls/ControlDeck";
import { VideoFeed } from "@/components/video/VideoFeed";

export default function Home() {
  const [activeTab, setActiveTab] = useState("map");

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden relative">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none z-0" />

      <TopBar />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {/* Main Map Area */}
          <div className="flex-1 relative">
            <MapInterface />
            
            {/* Draggable/Overlay Video Feed */}
            <VideoFeed />
          </div>

          {/* Bottom Control Deck */}
          <ControlDeck />
        </main>

        {/* Right Side Telemetry Panel */}
        <TelemetryPanel />
      </div>
    </div>
  );
}
