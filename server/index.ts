import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pool } from "./db";

// Server version for debugging deployments
const SERVER_VERSION = "V5_20260202";
console.log(`[SERVER] Starting AuditGuard ${SERVER_VERSION} in ${process.env.NODE_ENV || 'development'} mode`);

const app = express();
const httpServer = createServer(app);

// Trust proxy for production (Railway/Replit infrastructure)
// Must be set before session middleware for secure cookies to work behind reverse proxy
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
  }
}

// Configure session store - use PostgreSQL in production if available, otherwise memory
const PgSession = connectPgSimple(session);
let sessionStore: InstanceType<typeof PgSession> | undefined = undefined;

if (pool) {
  try {
    sessionStore = new PgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
      errorLog: (err) => {
        console.error('[Session Store Error]', err);
      },
    });
    console.log('[SERVER] Using PostgreSQL session store');
  } catch (err) {
    console.error('[SERVER] Failed to create PostgreSQL session store:', err);
    console.log('[SERVER] Falling back to in-memory session store');
  }
} else {
  console.log('[SERVER] Using in-memory session store (not recommended for production)');
}

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || "auditguard-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Health check endpoints - MUST be before any routes that depend on database
// These work even if database connection fails
app.get("/_health", (_req, res) => {
  res.status(200).json({ status: "ok", version: SERVER_VERSION });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", version: SERVER_VERSION, time: new Date().toISOString() });
});

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
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
