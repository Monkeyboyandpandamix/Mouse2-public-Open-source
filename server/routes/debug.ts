import type { Express } from "express";

/**
 * Registers debug/health routes.
 * /api/health is intentionally unauthenticated for load balancers and Electron startup detection.
 */
export function registerDebugRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok", timestamp: Date.now() });
  });
}
