import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";

function loadEnvFile(filePath = ".env") {
  try {
    const abs = path.resolve(process.cwd(), filePath);
    if (!existsSync(abs)) return;
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || process.env[key] != null) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore .env parse/load failures; system env still applies
  }
}

loadEnvFile();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    // Default is 100kb which is too small for legitimate payloads we accept,
    // notably license-plate captures (cap 1.5MB base64) and small mission
    // exports. Route-level Zod schemas still enforce their own per-field caps
    // so this just raises the body-parser ceiling.
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "2mb" }));

async function ensureRuntimeDependencies() {
  const runningInCloud =
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
    String(process.env.PORT || "") === "8080";
  if (runningInCloud) {
    log("runtime deps bootstrap skipped in cloud runtime", "bootstrap");
    return;
  }

  const pythonExec = process.env.PYTHON_PATH ?? "python3";
  const scriptPath = path.resolve(process.cwd(), "scripts", "runtime_bootstrap.py");
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const proc = spawn(pythonExec, [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
    });

    const timeout = setTimeout(() => {
      log("runtime deps bootstrap timed out; continuing startup", "bootstrap");
      try {
        proc.kill("SIGTERM");
      } catch {}
      done();
    }, 8000);

    let out = "";
    let err = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (err += d.toString()));
    proc.on("error", (e: any) => {
      clearTimeout(timeout);
      log(`runtime deps bootstrap skipped (${e?.message || "spawn error"})`, "bootstrap");
      done();
    });
    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        log(`runtime deps ready: ${out.trim()}`, "bootstrap");
      } else {
        log(`runtime deps bootstrap warning (continuing): ${out.trim() || err.trim()}`, "bootstrap");
      }
      done();
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

const SENSITIVE_LOG_KEY_RE = /pass(word)?|secret|token|auth|cookie|session|credential|api[-_]?key/i;

function sanitizeLogPayload(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 4) return "[truncated]";

  if (Array.isArray(value)) {
    if (value.length > 20) {
      return [
        ...value.slice(0, 20).map((item) => sanitizeLogPayload(item, depth + 1)),
        `[+${value.length - 20} more]`,
      ];
    }
    return value.map((item) => sanitizeLogPayload(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitized: Record<string, unknown> = {};
    for (const [key, raw] of entries) {
      if (SENSITIVE_LOG_KEY_RE.test(key)) {
        sanitized[key] = "[redacted]";
        continue;
      }
      sanitized[key] = sanitizeLogPayload(raw, depth + 1);
    }
    return sanitized;
  }

  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}...[truncated]`;
  }

  return value;
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
      const shouldLogResponseBody =
        process.env.NODE_ENV !== "production" &&
        capturedJsonResponse &&
        path !== "/api/auth/login" &&
        path !== "/api/auth/session";
      if (shouldLogResponseBody) {
        const sanitized = sanitizeLogPayload(capturedJsonResponse);
        const rendered = JSON.stringify(sanitized);
        logLine += ` :: ${rendered.length > 1500 ? `${rendered.slice(0, 1500)}...[truncated]` : rendered}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await ensureRuntimeDependencies();
  // Run DB migrations before any DB access (needed for automation_recipes even when USE_DB is false)
  const { runMigrations } = await import("./db/migrate");
  runMigrations();
  const { registerRoutes } = await import("./routes");
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
