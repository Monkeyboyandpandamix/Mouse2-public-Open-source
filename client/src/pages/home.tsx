import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { TelemetryPanel } from "@/components/telemetry/TelemetryPanel";
import { MapInterface } from "@/components/map/MapInterface";
import { ControlDeck } from "@/components/controls/ControlDeck";
import { VideoFeed } from "@/components/video/VideoFeed";
import { SettingsPanel } from "@/components/panels/SettingsPanel";
import { MissionPlanningPanel } from "@/components/panels/MissionPlanningPanel";
import { TrackingPanel } from "@/components/panels/TrackingPanel";
import { SpeakerPanel } from "@/components/panels/SpeakerPanel";
import { FlightLogsPanel } from "@/components/panels/FlightLogsPanel";

export default function Home() {
  const [activeTab, setActiveTab] = useState("map");

  const renderMainContent = () => {
    switch (activeTab) {
      case "map":
        return (
          <div className="flex-1 relative">
            <MapInterface />
            <VideoFeed />
          </div>
        );
      case "mission":
        return (
          <div className="flex-1 relative overflow-hidden">
            <MissionPlanningPanel />
          </div>
        );
      case "tracking":
        return (
          <div className="flex-1 relative overflow-hidden">
            <TrackingPanel />
          </div>
        );
      case "payload":
        return (
          <div className="flex-1 relative overflow-hidden">
            <SpeakerPanel />
          </div>
        );
      case "feeds":
        return (
          <div className="flex-1 relative bg-background p-6">
            <h2 className="text-2xl font-bold mb-4">Camera Feeds</h2>
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="bg-black rounded-lg border-2 border-primary/50" />
              <div className="bg-black rounded-lg border-2 border-primary/50" />
            </div>
          </div>
        );
      case "logs":
        return (
          <div className="flex-1 relative overflow-hidden">
            <FlightLogsPanel />
          </div>
        );
      case "settings":
        return (
          <div className="flex-1 relative overflow-hidden">
            <SettingsPanel />
          </div>
        );
      default:
        return (
          <div className="flex-1 relative">
            <MapInterface />
            <VideoFeed />
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden relative">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20 pointer-events-none z-0" />

      <TopBar onSettingsClick={() => setActiveTab("settings")} />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="flex-1 relative flex flex-col overflow-hidden">
          {renderMainContent()}
          
          {/* Only show control deck on map view */}
          {activeTab === "map" && <ControlDeck />}
        </main>

        {/* Right Side Telemetry Panel - show on map and tracking views */}
        {(activeTab === "map" || activeTab === "tracking") && <TelemetryPanel />}
      </div>
    </div>
  );
}
