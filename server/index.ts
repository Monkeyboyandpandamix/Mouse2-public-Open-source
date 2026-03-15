import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import { spawn } from "child_process";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

async function ensureRuntimeDependencies() {
  const pythonExec = process.env.PYTHON_PATH ?? "/usr/bin/python3";
  const scriptPath = path.resolve(process.cwd(), "scripts", "runtime_bootstrap.py");
  await new Promise<void>((resolve) => {
    const proc = spawn(pythonExec, [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) {
        log(`runtime deps ready: ${out.trim()}`, "bootstrap");
      } else {
        log(`runtime deps bootstrap warning (continuing): ${out.trim() || err.trim()}`, "bootstrap");
      }
      resolve();
    });
  });
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await ensureRuntimeDependencies();
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[express]", err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  const runningFromDist = process.argv[1]?.includes(`${path.sep}dist${path.sep}`);
  if (process.env.NODE_ENV === "production" || runningFromDist) {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Serve the app on PORT when provided, otherwise default to 5000.
  // If default port is busy, automatically move to the next available port.
  const requestedPort = parseInt(process.env.PORT || "5000", 10);
  const portExplicitlySet = Boolean(process.env.PORT);
  const maxAutoPort = portExplicitlySet ? requestedPort : requestedPort + 20;
  // Use 127.0.0.1 for Electron to avoid conflicts with Mac AirPlay on 0.0.0.0:5000
  const host = process.env.ELECTRON_APP ? "127.0.0.1" : "0.0.0.0";

  const startListening = (port: number) => {
    const onListenError = (error: any) => {
      if (error?.code === "EADDRINUSE" && !portExplicitlySet && port < maxAutoPort) {
        log(`port ${port} is in use, retrying on ${port + 1}`);
        startListening(port + 1);
        return;
      }
      throw error;
    };

    httpServer.once("error", onListenError);
    httpServer.listen(
      {
        port,
        host,
        reusePort: true,
      },
      () => {
        httpServer.off("error", onListenError);
        if (port !== requestedPort) {
          log(`default port ${requestedPort} unavailable, serving on ${host}:${port}`);
        } else {
          log(`serving on ${host}:${port}`);
        }
      },
    );
  };

  startListening(requestedPort);
})();
