import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { existsSync } from "fs";

// Use system Python to ensure Adafruit libraries are available
// On Raspberry Pi, venv may not have the hardware libraries but system Python does
const PYTHON_EXEC = process.env.PYTHON_PATH ?? "/usr/bin/python3";
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
  insertBme688ReadingSchema,
} from "@shared/schema";
import { ZodError } from "zod";
import { syncDataToSheets, getOrCreateBackupSpreadsheet, getSpreadsheetUrl } from "./googleSheets";
import { uploadFileToDrive, listDriveFiles, checkDriveConnection, deleteFileFromDrive } from "./googleDrive";
import { 
  getAuthUrl, 
  handleOAuthCallback, 
  checkConnectionStatus, 
  getAllAccounts, 
  switchAccount, 
  removeAccount,
  isOAuthConfigured 
} from "./googleAuth";

// Server-side session store for authenticated users
// Key: session token, Value: { userId, role, name, createdAt }
interface ServerSession {
  userId: string;
  role: string;
  name: string;
  createdAt: number;
}
const activeSessions = new Map<string, ServerSession>();

import { randomBytes } from 'crypto';

// Generate a cryptographically secure random token
function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars, 256 bits of entropy
}

// Validate session token and return session info
function validateSession(token: string | undefined): ServerSession | null {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  // Session expires after 24 hours
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // WebSocket server for real-time telemetry streaming
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Track clients with their user IDs for DM privacy
  interface ClientInfo {
    ws: WebSocket;
    userId: string | null;
  }
  const clients = new Map<WebSocket, ClientInfo>();
  
  wss.on("connection", (ws) => {
    // Initially, user is not authenticated
    const clientInfo: ClientInfo = { ws, userId: null };
    clients.set(ws, clientInfo);
    console.log("WebSocket client connected");
    
    // Handle incoming messages to register user ID
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth" && msg.sessionToken) {
          // Validate token against server session store
          const session = validateSession(msg.sessionToken);
          if (session) {
            clientInfo.userId = session.userId;
            console.log(`WebSocket client authenticated as user: ${session.userId} (${session.name})`);
          } else {
            console.log("WebSocket auth failed: invalid or expired session token");
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    ws.on("close", () => {
      clients.delete(ws);
      console.log("WebSocket client disconnected");
    });
  });
  
  // Broadcast function for real-time data (non-DM messages)
  const broadcast = (type: string, data: any) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.send(message);
      }
    });
  };

  // Send to specific users only (for DMs)
  const sendToUsers = (type: string, data: any, userIds: string[]) => {
    const message = JSON.stringify({ type, data });
    clients.forEach((clientInfo) => {
      if (clientInfo.ws.readyState === WebSocket.OPEN && 
          clientInfo.userId && 
          userIds.includes(clientInfo.userId)) {
        clientInfo.ws.send(message);
      }
    });
  };

  // Smart broadcast - handles DMs privately, broadcasts public messages
  const smartBroadcast = (type: string, data: any) => {
    // Check if this is a DM (has recipientId)
    if (data.recipientId) {
      // Only send to sender and recipient
      const targetUsers = [data.senderId, data.recipientId].filter(Boolean);
      sendToUsers(type, data, targetUsers);
    } else {
      // Public message - broadcast to all
      broadcast(type, data);
    }
  };

  // Health check endpoint for Electron app startup detection
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });

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

  // Authentication: Create server-side session on login
  // SECURITY MODEL: This GCS is designed for closed network deployment with trusted team members.
  // Users are managed client-side (localStorage). The server validates that:
  // 1. Login requests generate cryptographically secure session tokens (256-bit entropy)
  // 2. Session tokens are required for WebSocket DM routing
  // 3. Session tokens are required for admin-only API endpoints
  // For internet-facing deployments, implement server-side credential validation.
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { userId, username, role, name } = req.body;
      
      // Generate a secure session token
      const sessionToken = generateSessionToken();
      
      // Store session on server
      activeSessions.set(sessionToken, {
        userId,
        role: role || 'viewer',
        name: name || username || 'Unknown',
        createdAt: Date.now()
      });
      
      console.log(`User ${name} (${userId}) logged in with role: ${role}`);
      
      res.json({ 
        success: true, 
        sessionToken,
        message: 'Login successful' 
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Authentication: Logout - invalidate session
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const sessionToken = req.headers['x-session-token'] as string;
      if (sessionToken) {
        activeSessions.delete(sessionToken);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
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

  // GUI Config Backup API - backs up tabs, panels, widgets, and theme
  app.post("/api/backup/gui-config", async (req, res) => {
    try {
      const { tabs, panels, widgets, theme } = req.body;
      
      const result = await syncDataToSheets({
        guiConfig: { tabs, panels, widgets, theme }
      });

      res.json({
        success: true,
        spreadsheetUrl: getSpreadsheetUrl(result.spreadsheetId),
        syncedTables: result.syncedTables,
      });
    } catch (error: any) {
      console.error("GUI Config backup error:", error);
      res.status(500).json({ 
        error: "Failed to backup GUI configuration",
        message: error.message 
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

  // Google OAuth API for standalone account management
  app.get("/api/google/status", async (req, res) => {
    try {
      const status = await checkConnectionStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/google/auth-url", (req, res) => {
    const result = getAuthUrl();
    if ('error' in result) {
      res.status(400).json({ error: result.error });
    } else {
      res.json(result);
    }
  });

  app.get("/api/google/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }
    
    const result = await handleOAuthCallback(code);
    
    if (result.success) {
      // Redirect back to settings with success message
      res.redirect('/?google_auth=success');
    } else {
      res.redirect(`/?google_auth=error&message=${encodeURIComponent(result.error || 'Unknown error')}`);
    }
  });

  app.get("/api/google/accounts", (req, res) => {
    const accounts = getAllAccounts();
    res.json(accounts);
  });

  app.post("/api/google/switch", (req, res) => {
    const { accountId } = req.body;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID required' });
    }
    const success = switchAccount(accountId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Account not found' });
    }
  });

  app.delete("/api/google/accounts/:id", (req, res) => {
    const success = removeAccount(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Account not found' });
    }
  });

  app.get("/api/google/configured", (req, res) => {
    res.json({ configured: isOAuthConfigured() });
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
      const userId = req.query.userId as string | undefined;
      // Server-side filtering: if userId provided, filter to only show:
      // - Broadcast messages (no recipientId)
      // - Messages sent by the user
      // - Messages where user is recipient
      const messages = userId 
        ? await storage.getMessagesForUser(userId)
        : await storage.getAllMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/chat-users", async (req, res) => {
    try {
      const users = await storage.getChatUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Admin endpoint: Get all messages with full history (including original content)
  // Security: Validates admin role from server-side session store
  app.get("/api/messages/history", async (req, res) => {
    try {
      // Validate session token from header against server session store
      const sessionToken = req.headers['x-session-token'] as string | undefined;
      const session = validateSession(sessionToken);
      let isAdmin = session?.role === 'admin';
      
      // Also allow if ADMIN_API_KEY is provided (for API access)
      const adminKey = process.env.ADMIN_API_KEY;
      const authHeader = req.headers.authorization;
      if (adminKey && authHeader === `Bearer ${adminKey}`) {
        isAdmin = true;
      }
      
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const messages = await storage.getAllMessagesWithHistory();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch message history" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { senderId, senderName, senderRole, content, recipientId, recipientName } = req.body;
      if (!senderId || !senderName || !senderRole || !content) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const message = await storage.createMessage({ 
        senderId, 
        senderName, 
        senderRole, 
        content,
        recipientId: recipientId || null,
        recipientName: recipientName || null
      });
      smartBroadcast("new_message", message);
      res.json(message);
      
      // Sync messages to Google Sheets in background (non-blocking)
      setImmediate(async () => {
        try {
          const allMessages = await storage.getAllMessages();
          await storage.syncMessagesToSheets(allMessages);
        } catch (err: any) {
          console.log('Background sync to Sheets failed:', err.message);
        }
      });
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
      // Use smartBroadcast for DM privacy
      smartBroadcast("message_updated", message);
      res.json(message);
      
      // Sync messages to Google Sheets in background (non-blocking)
      setImmediate(async () => {
        try {
          const allMessages = await storage.getAllMessages();
          await storage.syncMessagesToSheets(allMessages);
        } catch (err: any) {
          console.log('Background sync to Sheets failed:', err.message);
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      // Get message first to know who should receive the delete notification
      const messages = await storage.getAllMessages();
      const msg = messages.find(m => m.id === req.params.id);
      
      await storage.deleteMessage(req.params.id);
      
      // Use smartBroadcast for DM privacy
      if (msg) {
        smartBroadcast("message_deleted", { id: req.params.id, senderId: msg.senderId, recipientId: msg.recipientId });
      } else {
        broadcast("message_deleted", { id: req.params.id });
      }
      res.json({ success: true });
      
      // Sync messages to Google Sheets in background (non-blocking)
      setImmediate(async () => {
        try {
          const allMessages = await storage.getAllMessages();
          await storage.syncMessagesToSheets(allMessages);
        } catch (err: any) {
          console.log('Background sync to Sheets failed:', err.message);
        }
      });
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

  // Diagnostic endpoint to verify Google integrations
  // Access controlled: dev mode only OR requires ADMIN_API_KEY environment variable
  app.get("/api/integrations/verify", async (req, res) => {
    const isDev = process.env.NODE_ENV === 'development';
    
    // In production, require ADMIN_API_KEY environment variable
    if (!isDev) {
      const adminKey = process.env.ADMIN_API_KEY;
      if (!adminKey) {
        return res.status(503).json({ error: "Diagnostic endpoint disabled - ADMIN_API_KEY not configured" });
      }
      
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${adminKey}`) {
        return res.status(401).json({ error: "Unauthorized - valid admin key required" });
      }
    }
    
    const results: any = { driveConnected: false, sheetsConnected: false };
    
    try {
      const driveStatus = await checkDriveConnection();
      results.driveConnected = driveStatus.connected;
    } catch (e: any) {
      results.driveError = "Connection failed";
    }
    
    try {
      await getOrCreateBackupSpreadsheet();
      results.sheetsConnected = true;
    } catch (e: any) {
      results.sheetsError = "Connection failed";
    }
    
    const fs = await import('fs');
    const dataDir = process.env.DATA_DIR || './data';
    results.localDataFilesCount = 0;
    try {
      if (fs.existsSync(dataDir)) {
        results.localDataFilesCount = fs.readdirSync(dataDir).length;
      }
    } catch (e) {}
    
    res.json({
      success: results.driveConnected || results.sheetsConnected,
      ...results
    });
  });

  // Endpoint to record flight telemetry (called when drone is armed)
  app.post("/api/telemetry/record", async (req, res) => {
    try {
      const { 
        sessionId, missionId, droneId, latitude, longitude, altitude, relativeAltitude,
        heading, groundSpeed, verticalSpeed, airSpeed, batteryVoltage, batteryCurrent, 
        batteryPercent, batteryTemp, gpsFixType, gpsSatellites, gpsHdop, flightMode, 
        armed, pitch, roll, yaw, motor1Rpm, motor2Rpm, motor3Rpm, motor4Rpm,
        motor1Current, motor2Current, motor3Current, motor4Current, cpuTemp,
        vibrationX, vibrationY, vibrationZ, distanceFromHome, windSpeed, windDirection
      } = req.body;

      const flightLog = await storage.createFlightLog({
        sessionId,
        missionId,
        droneId,
        latitude,
        longitude,
        altitude,
        relativeAltitude,
        heading,
        groundSpeed,
        verticalSpeed,
        airSpeed,
        batteryVoltage,
        batteryCurrent,
        batteryPercent,
        batteryTemp,
        gpsFixType,
        gpsSatellites,
        gpsHdop,
        flightMode,
        armed: armed || false,
        pitch,
        roll,
        yaw,
        motor1Rpm,
        motor2Rpm,
        motor3Rpm,
        motor4Rpm,
        motor1Current,
        motor2Current,
        motor3Current,
        motor4Current,
        cpuTemp,
        vibrationX,
        vibrationY,
        vibrationZ,
        distanceFromHome,
        windSpeed,
        windDirection
      });

      broadcast("telemetry_recorded", flightLog);
      res.json({ success: true, flightLog });
    } catch (error) {
      res.status(500).json({ error: "Failed to record telemetry" });
    }
  });

  // Flight Session Management - Auto-start recording on takeoff
  app.post("/api/flight-sessions/start", async (req, res) => {
    try {
      const { missionId, droneId } = req.body;
      
      // Check if there's already an active session for this drone
      const existingSession = await storage.getActiveFlightSession(droneId);
      if (existingSession) {
        return res.json({ success: true, session: existingSession, message: "Session already active" });
      }

      const session = await storage.createFlightSession({
        droneId: droneId || null,
        missionId: missionId || null,
        startTime: new Date().toISOString(),
        status: "active",
        totalFlightTime: null,
        maxAltitude: null,
        totalDistance: null,
        videoFilePath: null,
        logFilePath: null,
        model3dFilePath: null,
      });

      broadcast("flight_session_started", session);
      console.log(`[FLIGHT] Session ${session.id} started for drone ${droneId}`);
      res.json({ success: true, session });
    } catch (error) {
      console.error("Failed to start flight session:", error);
      res.status(500).json({ error: "Failed to start flight session" });
    }
  });

  app.post("/api/flight-sessions/end", async (req, res) => {
    try {
      const { sessionId, droneId, maxAltitude, totalDistance, totalFlightTime } = req.body;
      
      let session;
      if (sessionId) {
        session = await storage.endFlightSession(sessionId, { maxAltitude, totalDistance, totalFlightTime });
      } else if (droneId) {
        const activeSession = await storage.getActiveFlightSession(droneId);
        if (activeSession) {
          session = await storage.endFlightSession(activeSession.id, { maxAltitude, totalDistance, totalFlightTime });
        }
      }

      if (!session) {
        return res.status(404).json({ error: "No active session found" });
      }

      // Trigger Google sync after flight ends
      try {
        const flightLogs = await storage.getFlightLogsBySession(session.id);
        const allSessions = await storage.getAllFlightSessions();
        await syncDataToSheets({
          flightSessions: allSessions,
          flightLogs: flightLogs.slice(-1000), // Last 1000 logs from this session
        });
        console.log(`[FLIGHT] Session ${session.id} synced to Google Sheets`);
      } catch (syncError) {
        console.error("Failed to sync to Google:", syncError);
      }

      broadcast("flight_session_ended", session);
      console.log(`[FLIGHT] Session ${session.id} ended`);
      res.json({ success: true, session });
    } catch (error) {
      console.error("Failed to end flight session:", error);
      res.status(500).json({ error: "Failed to end flight session" });
    }
  });

  app.get("/api/flight-sessions", async (req, res) => {
    try {
      const sessions = await storage.getAllFlightSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get flight sessions" });
    }
  });

  app.get("/api/flight-sessions/active", async (req, res) => {
    try {
      const droneId = req.query.droneId as string | undefined;
      const session = await storage.getActiveFlightSession(droneId);
      res.json({ session: session || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to get active session" });
    }
  });

  app.get("/api/flight-sessions/:id", async (req, res) => {
    try {
      const session = await storage.getFlightSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.get("/api/flight-sessions/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getFlightLogsBySession(req.params.id);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to get session logs" });
    }
  });

  app.delete("/api/flight-sessions/:id", async (req, res) => {
    try {
      await storage.deleteFlightSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // Servo/Gripper control endpoints (for Raspberry Pi deployment)
  app.post("/api/servo/control", async (req, res) => {
    try {
      const { action, angle } = req.body;
      
      if (!action || !['open', 'close', 'angle'].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Use 'open', 'close', or 'angle'" });
      }
      
      // Check if running on Raspberry Pi
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      // Helper to return simulated response
      const returnSimulated = () => {
        return res.json({ 
          success: true, 
          simulated: true,
          action,
          angle: action === 'open' ? 180 : action === 'close' ? 0 : angle,
          message: `Gripper ${action} (simulated - not on Raspberry Pi)`
        });
      };
      
      // If not on Pi, return simulation
      if (!isRaspberryPi) {
        return returnSimulated();
      }
      
      // On Pi, try to call Python script
      const args = ['scripts/servo_control.py', action, '--json'];
      if (action === 'angle' && angle !== undefined) {
        args.push('--value', String(angle));
      }
      
      const python = spawn(PYTHON_EXEC, args);
      let output = '';
      let errorOutput = '';
      let responded = false;
      
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      python.on('error', (err) => {
        if (!responded) {
          responded = true;
          // Python not available, return simulated
          returnSimulated();
        }
      });
      
      python.on('close', (code: number) => {
        if (responded) return;
        responded = true;
        
        if (code !== 0) {
          return res.status(500).json({ 
            error: "Servo control failed", 
            details: errorOutput || output,
            code 
          });
        }
        
        try {
          const result = JSON.parse(output);
          res.json(result);
        } catch (e) {
          res.json({ success: true, message: output.trim() });
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: "Servo control error", details: String(error) });
    }
  });

  app.get("/api/servo/status", async (req, res) => {
    try {
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      res.json({
        available: isRaspberryPi,
        platform: isRaspberryPi ? 'raspberry_pi' : 'other',
        gpio_pin: 4,
        message: isRaspberryPi ? 'Servo controller available' : 'Servo control simulated (not on Raspberry Pi)'
      });
    } catch (error) {
      res.status(500).json({ error: "Status check failed" });
    }
  });

  // BME688 Environmental Sensor endpoints
  app.get("/api/bme688/read", async (req, res) => {
    try {
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      // Helper to return simulated data
      const returnSimulated = () => {
        const temp = 68 + (Math.random() * 10 - 5);
        const humidity = 45 + (Math.random() * 20 - 10);
        const pressure = 1013.25 + (Math.random() * 10 - 5);
        const iaq = Math.floor(50 + Math.random() * 100);
        return res.json({
          success: true,
          simulated: true,
          timestamp: new Date().toISOString(),
          temperature_f: Math.round(temp * 10) / 10,
          temperature_c: Math.round((temp - 32) * 5/9 * 10) / 10,
          humidity: Math.round(humidity * 10) / 10,
          pressure: Math.round(pressure * 100) / 100,
          altitude: Math.round((1013.25 - pressure) * 8.43 * 10) / 10,
          gas_resistance: 50000 + Math.random() * 100000,
          iaq_score: iaq,
          iaq_level: iaq < 50 ? 'Excellent' : iaq < 100 ? 'Good' : iaq < 150 ? 'Moderate' : 'Poor',
          voc_level: Math.round(Math.random() * 500) / 1000,
          vsc_level: Math.round(Math.random() * 100) / 1000,
          co2_level: 400 + Math.floor(Math.random() * 200),
          h2_level: Math.round(Math.random() * 50) / 100,
          co_level: Math.round(Math.random() * 10) / 100,
          ethanol_level: Math.round(Math.random() * 100) / 1000,
          health_risk_level: 'GOOD',
          health_risk_description: 'Air quality is good. No health concerns.'
        });
      };
      
      // For non-Pi environments, return simulated data directly
      if (!isRaspberryPi) {
        return returnSimulated();
      }
      
      // On Pi, call the Python script
      const args = ['scripts/bme688_monitor.py', 'read', '--json'];
      
      const python = spawn(PYTHON_EXEC, args);
      let output = '';
      let errorOutput = '';
      let responded = false;
      
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });
      
      python.on('error', (err) => {
        if (!responded) {
          responded = true;
          returnSimulated();
        }
      });
      
      python.on('close', (code: number) => {
        if (responded) return;
        responded = true;
        
        if (code !== 0) {
          return res.status(500).json({ 
            error: "BME688 read failed", 
            details: errorOutput || output,
            code 
          });
        }
        
        try {
          const result = JSON.parse(output);
          res.json(result);
        } catch (e) {
          res.status(500).json({ error: "Invalid sensor response" });
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: "BME688 read error", details: String(error) });
    }
  });

  app.get("/api/bme688/status", async (req, res) => {
    try {
      const isRaspberryPi = process.env.DEVICE_ROLE === 'ONBOARD' || 
                           existsSync('/sys/firmware/devicetree/base/model');
      
      // For non-Pi environments, return status directly
      if (!isRaspberryPi) {
        return res.json({
          success: true,
          sensorAvailable: false,
          platform: 'other',
          message: 'BME688 sensor simulated (not on Raspberry Pi)'
        });
      }
      
      const python = spawn(PYTHON_EXEC, ['scripts/bme688_monitor.py', 'status']);
      let output = '';
      let responded = false;
      
      python.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      python.on('error', (err) => {
        if (!responded) {
          responded = true;
          res.json({
            success: true,
            sensorAvailable: false,
            platform: 'raspberry_pi',
            message: 'Failed to check sensor status'
          });
        }
      });
      
      python.on('close', (code: number) => {
        if (responded) return;
        responded = true;
        
        try {
          const result = JSON.parse(output);
          result.platform = 'raspberry_pi';
          res.json(result);
        } catch (e) {
          res.json({
            success: true,
            sensorAvailable: false,
            platform: 'raspberry_pi',
            message: 'BME688 sensor status check failed'
          });
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: "Status check failed" });
    }
  });

  return httpServer;
}
