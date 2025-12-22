import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import {
  insertSettingsSchema,
  insertMissionSchema,
  insertWaypointSchema,
  insertFlightLogSchema,
  insertSensorDataSchema,
  insertMotorTelemetrySchema,
  insertCameraSettingsSchema,
  insertDroneSchema,
  insertMediaAssetSchema,
  insertOfflineBacklogSchema,
} from "@shared/schema";
import { ZodError } from "zod";
import { syncDataToSheets, getOrCreateBackupSpreadsheet, getSpreadsheetUrl } from "./googleSheets";
import { uploadFileToDrive, listDriveFiles, checkDriveConnection, deleteFileFromDrive } from "./googleDrive";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // WebSocket server for real-time telemetry streaming
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  const clients = new Set<WebSocket>();
  
  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log("WebSocket client connected");
    
    ws.on("close", () => {
      clients.delete(ws);
      console.log("WebSocket client disconnected");
    });
  });
  
  // Broadcast function for real-time data
  const broadcast = (type: string, data: any) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Runtime config API - returns device role for Pi vs Ground Control detection
  app.get("/api/runtime-config", async (req, res) => {
    const deviceRole = process.env.DEVICE_ROLE || "GROUND";
    const mavlinkDefaults = deviceRole === "ONBOARD" ? {
      connectionString: "/dev/ttyACM0",
      baudRate: 115200,
    } : null;
    
    res.json({
      deviceRole,
      mavlinkDefaults,
      isOnboard: deviceRole === "ONBOARD",
    });
  });

  // Settings API
  app.get("/api/settings/:category", async (req, res) => {
    try {
      const settings = await storage.getSettingsByCategory(req.params.category);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validated = insertSettingsSchema.parse(req.body);
      const setting = await storage.upsertSetting(validated);
      res.json(setting);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to save setting" });
      }
    }
  });

  // Missions API
  app.get("/api/missions", async (req, res) => {
    try {
      const missions = await storage.getAllMissions();
      res.json(missions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch missions" });
    }
  });

  app.get("/api/missions/:id", async (req, res) => {
    try {
      const mission = await storage.getMission(req.params.id);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }
      res.json(mission);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch mission" });
    }
  });

  app.post("/api/missions", async (req, res) => {
    try {
      const validated = insertMissionSchema.parse(req.body);
      const mission = await storage.createMission(validated);
      res.json(mission);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create mission" });
      }
    }
  });

  app.patch("/api/missions/:id", async (req, res) => {
    try {
      const mission = await storage.updateMission(req.params.id, req.body);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }
      res.json(mission);
    } catch (error) {
      res.status(500).json({ error: "Failed to update mission" });
    }
  });

  app.delete("/api/missions/:id", async (req, res) => {
    try {
      await storage.deleteMission(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete mission" });
    }
  });

  // Waypoints API
  app.get("/api/missions/:missionId/waypoints", async (req, res) => {
    try {
      const waypoints = await storage.getWaypointsByMission(req.params.missionId);
      res.json(waypoints);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch waypoints" });
    }
  });

  app.post("/api/waypoints", async (req, res) => {
    try {
      const validated = insertWaypointSchema.parse(req.body);
      const waypoint = await storage.createWaypoint(validated);
      res.json(waypoint);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create waypoint" });
      }
    }
  });

  app.patch("/api/waypoints/:id", async (req, res) => {
    try {
      const waypoint = await storage.updateWaypoint(req.params.id, req.body);
      if (!waypoint) {
        return res.status(404).json({ error: "Waypoint not found" });
      }
      res.json(waypoint);
    } catch (error) {
      res.status(500).json({ error: "Failed to update waypoint" });
    }
  });

  app.delete("/api/waypoints/:id", async (req, res) => {
    try {
      await storage.deleteWaypoint(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete waypoint" });
    }
  });

  // Flight Logs API
  app.post("/api/flight-logs", async (req, res) => {
    try {
      const validated = insertFlightLogSchema.parse(req.body);
      const log = await storage.createFlightLog(validated);
      broadcast("telemetry", log);
      res.json(log);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create flight log" });
      }
    }
  });

  app.get("/api/flight-logs/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getRecentFlightLogs(limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight logs" });
    }
  });

  app.delete("/api/flight-logs/:id", async (req, res) => {
    try {
      await storage.deleteFlightLog(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight log" });
    }
  });

  // Motor Telemetry API
  app.post("/api/motor-telemetry", async (req, res) => {
    try {
      const validated = insertMotorTelemetrySchema.parse(req.body);
      const telemetry = await storage.createMotorTelemetry(validated);
      broadcast("motor_telemetry", telemetry);
      res.json(telemetry);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create motor telemetry" });
      }
    }
  });

  app.get("/api/motor-telemetry/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const telemetry = await storage.getRecentMotorTelemetry(limit);
      res.json(telemetry);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch motor telemetry" });
    }
  });

  // Sensor Data API
  app.post("/api/sensor-data", async (req, res) => {
    try {
      const validated = insertSensorDataSchema.parse(req.body);
      const data = await storage.createSensorData(validated);
      broadcast("sensor_data", data);
      res.json(data);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create sensor data" });
      }
    }
  });

  app.get("/api/sensor-data/:sensorType", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await storage.getRecentSensorData(req.params.sensorType, limit);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sensor data" });
    }
  });

  // Camera Settings API
  app.get("/api/camera-settings", async (req, res) => {
    try {
      const settings = await storage.getCameraSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch camera settings" });
    }
  });

  app.patch("/api/camera-settings", async (req, res) => {
    try {
      const settings = await storage.updateCameraSettings(req.body);
      broadcast("camera_settings", settings);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update camera settings" });
    }
  });

  // Geocoding API (proxy for Nominatim with proper headers)
  app.get("/api/geocode", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'User-Agent': 'MOUSE-GCS/1.0 (Ground Control Station)',
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim returned ${response.status}`);
      }

      const results = await response.json();
      res.json(results);
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: "Failed to geocode address" });
    }
  });

  // Reverse Geocoding API
  app.get("/api/reverse-geocode", async (req, res) => {
    try {
      const lat = req.query.lat as string;
      const lon = req.query.lon as string;
      
      if (!lat || !lon) {
        return res.status(400).json({ error: "lat and lon parameters are required" });
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
        {
          headers: {
            'User-Agent': 'MOUSE-GCS/1.0 (Ground Control Station)',
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Nominatim returned ${response.status}`);
      }

      const result = await response.json();
      res.json(result);
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ error: "Failed to reverse geocode" });
    }
  });

  // Google Sheets Backup API
  app.post("/api/backup/google-sheets", async (req, res) => {
    try {
      const missions = await storage.getAllMissions();
      const waypoints: any[] = [];
      for (const mission of missions) {
        const missionWaypoints = await storage.getWaypointsByMission(mission.id);
        waypoints.push(...missionWaypoints);
      }
      const flightLogs = await storage.getRecentFlightLogs(1000);
      
      const result = await syncDataToSheets({
        missions,
        waypoints,
        flightLogs,
      });

      res.json({
        success: true,
        spreadsheetUrl: getSpreadsheetUrl(result.spreadsheetId),
        syncedTables: result.syncedTables,
      });
    } catch (error: any) {
      console.error("Google Sheets backup error:", error);
      res.status(500).json({ 
        error: "Failed to backup to Google Sheets",
        message: error.message 
      });
    }
  });

  app.get("/api/backup/google-sheets/status", async (req, res) => {
    try {
      const spreadsheetId = await getOrCreateBackupSpreadsheet();
      res.json({
        connected: true,
        spreadsheetUrl: getSpreadsheetUrl(spreadsheetId),
      });
    } catch (error: any) {
      res.json({
        connected: false,
        error: error.message,
      });
    }
  });

  // Google Drive File Storage API
  app.get("/api/drive/status", async (req, res) => {
    try {
      const status = await checkDriveConnection();
      res.json(status);
    } catch (error: any) {
      res.json({ connected: false, error: error.message });
    }
  });

  app.get("/api/drive/files", async (req, res) => {
    try {
      const { sessionId, sessionName } = req.query;
      const result = await listDriveFiles(
        sessionId as string | undefined,
        sessionName as string | undefined
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/drive/upload", async (req, res) => {
    try {
      const { fileName, mimeType, sessionId, sessionName, data } = req.body;
      
      if (!fileName || !data) {
        return res.status(400).json({ success: false, error: "Missing fileName or data" });
      }

      const buffer = Buffer.from(data, 'base64');
      const result = await uploadFileToDrive(
        buffer,
        fileName,
        mimeType || 'application/octet-stream',
        sessionId,
        sessionName
      );
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/drive/files/:fileId", async (req, res) => {
    try {
      const result = await deleteFileFromDrive(req.params.fileId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Drones API
  app.get("/api/drones", async (req, res) => {
    try {
      const drones = await storage.getAllDrones();
      res.json(drones);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drones" });
    }
  });

  app.get("/api/drones/:id", async (req, res) => {
    try {
      const drone = await storage.getDrone(req.params.id);
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drone" });
    }
  });

  app.post("/api/drones", async (req, res) => {
    try {
      const validated = insertDroneSchema.parse(req.body);
      const drone = await storage.createDrone(validated);
      broadcast("drone_added", drone);
      res.json(drone);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create drone" });
      }
    }
  });

  app.patch("/api/drones/:id", async (req, res) => {
    try {
      const drone = await storage.updateDrone(req.params.id, req.body);
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      broadcast("drone_updated", drone);
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to update drone" });
    }
  });

  app.patch("/api/drones/:id/location", async (req, res) => {
    try {
      const { latitude, longitude, altitude, heading } = req.body;
      const drone = await storage.updateDroneLocation(
        req.params.id,
        latitude,
        longitude,
        altitude,
        heading
      );
      if (!drone) {
        return res.status(404).json({ error: "Drone not found" });
      }
      broadcast("drone_location", { id: drone.id, latitude, longitude, altitude, heading });
      res.json(drone);
    } catch (error) {
      res.status(500).json({ error: "Failed to update drone location" });
    }
  });

  app.delete("/api/drones/:id", async (req, res) => {
    try {
      await storage.deleteDrone(req.params.id);
      broadcast("drone_removed", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete drone" });
    }
  });

  // Media Assets API
  app.get("/api/media", async (req, res) => {
    try {
      const { droneId, sessionId, status } = req.query;
      let assets;
      
      if (droneId) {
        assets = await storage.getMediaAssetsByDrone(droneId as string);
      } else if (sessionId) {
        assets = await storage.getMediaAssetsBySession(sessionId as string);
      } else if (status === "pending") {
        assets = await storage.getPendingMediaAssets();
      } else {
        assets = await storage.getMediaAssetsByDrone("", 100);
      }
      
      res.json(assets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch media assets" });
    }
  });

  app.get("/api/media/:id", async (req, res) => {
    try {
      const asset = await storage.getMediaAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch media asset" });
    }
  });

  app.post("/api/media", async (req, res) => {
    try {
      const validated = insertMediaAssetSchema.parse(req.body);
      const asset = await storage.createMediaAsset(validated);
      broadcast("media_captured", asset);
      res.json(asset);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create media asset" });
      }
    }
  });

  app.patch("/api/media/:id", async (req, res) => {
    try {
      const asset = await storage.updateMediaAsset(req.params.id, req.body);
      if (!asset) {
        return res.status(404).json({ error: "Media asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to update media asset" });
    }
  });

  app.delete("/api/media/:id", async (req, res) => {
    try {
      await storage.deleteMediaAsset(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete media asset" });
    }
  });

  // Offline Backlog API - for syncing data when drone reconnects
  app.get("/api/backlog", async (req, res) => {
    try {
      const { droneId } = req.query;
      const backlog = await storage.getPendingBacklog(droneId as string | undefined);
      res.json(backlog);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch backlog" });
    }
  });

  app.post("/api/backlog", async (req, res) => {
    try {
      const validated = insertOfflineBacklogSchema.parse(req.body);
      const item = await storage.createBacklogItem(validated);
      res.json(item);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create backlog item" });
      }
    }
  });

  app.post("/api/backlog/sync", async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }
      
      const results = [];
      for (const item of items) {
        try {
          if (item.dataType === "telemetry") {
            await storage.createFlightLog(item.data);
          } else if (item.dataType === "sensor") {
            await storage.createSensorData(item.data);
          } else if (item.dataType === "media") {
            await storage.createMediaAsset(item.data);
          }
          
          if (item.id) {
            await storage.markBacklogSynced(item.id);
          }
          results.push({ id: item.id, status: "synced" });
        } catch (err: any) {
          results.push({ id: item.id, status: "failed", error: err.message });
        }
      }
      
      broadcast("backlog_synced", { count: results.filter(r => r.status === "synced").length });
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync backlog" });
    }
  });

  app.patch("/api/backlog/:id/synced", async (req, res) => {
    try {
      await storage.markBacklogSynced(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark as synced" });
    }
  });

  app.delete("/api/backlog/:id", async (req, res) => {
    try {
      await storage.deleteBacklogItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete backlog item" });
    }
  });

  app.delete("/api/backlog/clear", async (req, res) => {
    try {
      const { droneId } = req.query;
      await storage.clearSyncedBacklog(droneId as string | undefined);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear synced backlog" });
    }
  });

  // User Messages API (Team Communication)
  app.get("/api/messages", async (req, res) => {
    try {
      const messages = await storage.getAllMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { senderId, senderName, senderRole, content } = req.body;
      if (!senderId || !senderName || !senderRole || !content) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const message = await storage.createMessage({ senderId, senderName, senderRole, content });
      broadcast("new_message", message);
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  app.patch("/api/messages/:id", async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Content required" });
      }
      const message = await storage.updateMessage(req.params.id, content);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      broadcast("message_updated", message);
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      await storage.deleteMessage(req.params.id);
      broadcast("message_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  app.post("/api/messages/sync", async (req, res) => {
    try {
      const messages = req.body;
      if (!Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array required" });
      }
      await storage.syncMessagesToSheets(messages);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync messages" });
    }
  });

  // Trigger Google sync manually
  app.post("/api/sync/google", async (req, res) => {
    try {
      await storage.syncToGoogle();
      res.json({ success: true, message: "Sync initiated" });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to sync", message: error.message });
    }
  });

  return httpServer;
}
