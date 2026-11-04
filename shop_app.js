import "dotenv/config";
import passport from "./config/passport.js";
import express from "express";
import serverless from "serverless-http";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { socketConnection } from "./sockets/index.js";
import connectDB from "./config/db.js";
import { socketHandler } from "./middlewares/socketHandler.js";
import { setIO } from "./utils/socket.js";
import localeMiddleware from "./middlewares/locale.js";
import securityHeaders from "./middlewares/securityHeaders.js";
import { createRateLimit } from "./middlewares/rateLimit.js";
import requireTrustedOrigin from "./middlewares/requireTrustedOrigin.js";
import { productRoutes } from "./routes/productRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { orderRouter } from "./routes/orderRoutes.js";
import { adminRoute } from "./routes/adminRoutes.js";
import { reviewsRouter } from "./routes/reviewsRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { notificationRouter } from "./routes/notificationRoutes.js";
import featureRoutes from "./routes/featureRoutes.js";

const assertProductionSecurityConfig = () => {
  if (process.env.NODE_ENV !== "production") return;

  const accessSecret = process.env.SECRET_ACCESS_KEY || "";
  const refreshSecret = process.env.REFRESH_SECRET || "";
  if (accessSecret.length < 32 || refreshSecret.length < 32 || accessSecret === refreshSecret) {
    throw new Error("Production requires two different JWT secrets of at least 32 characters");
  }

  const configuredOrigins = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(","),
  ].map((value) => value?.trim()).filter(Boolean);

  if (!configuredOrigins.length) {
    throw new Error("Production requires CLIENT_URL, FRONTEND_URL, or CORS_ORIGINS");
  }

  for (const value of configuredOrigins) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Invalid production CORS origin: ${value}`);
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("Production CORS origins must be HTTPS origins without paths, queries, or fragments");
    }
  }

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1 || trustProxyHops > 5) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 1 and 5 in production");
  }

  const googleSettings = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL,
  ];
  const googleConfiguredCount = googleSettings.filter(Boolean).length;
  if (googleConfiguredCount !== 0 && googleConfiguredCount !== googleSettings.length) {
    throw new Error("Configure all Google OAuth settings or leave all of them empty");
  }
  if (googleSettings[2]) {
    const callbackUrl = new URL(googleSettings[2]);
    if (callbackUrl.protocol !== "https:") {
      throw new Error("GOOGLE_CALLBACK_URL must use HTTPS in production");
    }
  }
};

assertProductionSecurityConfig();

const app = express();
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
}

const configuredOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000", "https://shop-co-eta-henna.vercel.app"]),
]
  .map((origin) => origin?.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedOrigins = [...new Set(configuredOrigins)];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }
    return callback(Object.assign(new Error("Origin is not allowed by CORS"), { statusCode: 403 }));
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Locale", "Accept-Language", "Idempotency-Key"],
  maxAge: 86400,
};

app.use(securityHeaders);
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) req.body = {};
  next();
});
app.use(cookieParser());
// Enforce trusted browser origins on unsafe requests. Bearer-only clients can
// still use server-to-server/native requests without browser cookies.
app.use(requireTrustedOrigin);
app.use(passport.initialize());
app.use(localeMiddleware);
// Coarse per-instance burst protection only. Authentication and upload routes
// use the shared MongoDB rate-limit store to work across serverless instances.
app.use(
  createRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    namespace: "api-global-local-burst",
    store: "memory",
  }),
);

// Lightweight liveness endpoint. It deliberately does not require MongoDB.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "success", data: { service: "shop.co-api", alive: true } });
});

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection error:", error.message);
    next(Object.assign(new Error("Database Connection Error"), { statusCode: 503 }));
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/product", productRoutes);
app.use("/api/order", orderRouter);
app.use("/api/admin", adminRoute);
app.use("/api/review", reviewsRouter);
app.use("/api/profile", profileRoutes);
app.use("/api/notifications", notificationRouter);
app.use("/api/features", featureRoutes);

app.use((req, res) => {
  res.status(404).json({ status: "Error", message: "Route not found", code: 404 });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  let statusCode = Number(err.statusCode || err.status) || 500;
  let message = err.errorText || err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Invalid request payload";
  } else if (err.name === "CastError" || err.name === "SyntaxError") {
    statusCode = 400;
    message = "Invalid request payload";
  } else if (err.code === 11000) {
    statusCode = 409;
    message = err.keyPattern?.email ? "Email already registered." : "This resource already exists.";
  } else if (err.name === "MulterError") {
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Uploaded file is too large" : "Invalid request payload";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large";
  } else if (err.message === "Origin is not allowed by CORS") {
    statusCode = 403;
    message = "Access Denied: You do not have the required permissions";
  }

  if (statusCode >= 500) {
    console.error("API error:", process.env.NODE_ENV === "production" ? err.message : err);
    message = "Internal Server Error";
  }

  return res.status(statusCode).json({
    status: statusCode >= 500 ? "error" : "fail",
    message,
    code: statusCode,
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions, transports: ["websocket", "polling"] });
io.use(socketHandler);
socketConnection(io);
setIO(io);

// Vercel runs the exported serverless handler and must not open a local listener.
// Other hosts should listen normally, including when NODE_ENV=production.
if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "test") {
  const PORT = Number(process.env.PORT) || 4000;
  connectDB()
    .then(() => {
      server.listen(PORT, "0.0.0.0", () => console.log(`Shop.co API listening on port ${PORT}`));
    })
    .catch((error) => {
      console.error("Unable to start API:", error.message);
      process.exitCode = 1;
    });
}

export default app;
export const handler = serverless(app);
