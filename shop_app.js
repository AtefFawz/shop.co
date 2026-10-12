import "dotenv/config";
import "./config/passport.js";
import passport from "./config/passport.js";
import express from "express";
import serverless from "serverless-http";
import cookieParser from "cookie-parser";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { socketConnection } from "./sockets/index.js";

// Config
import connectDB from "./config/db.js";

// Socket
import { socketHandler } from "./middlewares/socketHandler.js";
import { setIO } from "./utils/socket.js";

// Routes
import { productRoutes } from "./routes/productRoutes.js";
import { authRouts } from "./routes/authRouts.js";
import { orderRouter } from "./routes/orderRoutes.js";
import { adminRoute } from "./routes/adminRoutes.js";
import { reviewsRouter } from "./routes/reviewsRoutes.js";
import { profileRouts } from "./routes/profileRoutes.js";
import { notificationRouter } from "./routes/notificationRoutes.js";

// Utils

const app = express();

/* CORS */
const allowedOrigins = [
  "http://localhost:3000",
  "https://shop-co-eta-henna.vercel.app",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

/* Middlewares */
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));
app.use(passport.initialize());

/* Database Connection */
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({
      status: "Error",
      message: "Database Connection Error",
      code: 500,
    });
  }
});

/* Routes */
app.use("/api/product", productRoutes);
app.use("/api/auth", authRouts);
app.use("/api/order", orderRouter);
app.use("/api/admin", adminRoute);
app.use("/api/review", reviewsRouter);
app.use("/api/profile", profileRouts);
app.use("/api/notifications", notificationRouter);

/* 404 - Route Not Found */
app.use((req, res) => {
  res.status(404).json({
    status: "Error",
    message: "Route not found",
    code: 404,
  });
});

/* Global Error Handler */
app.use((err, req, res, next) => {
  console.error("Global Error:", err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    status: err.statusText || "Error",
    message: err.errorText || "Internal Server Error",
    code: statusCode,
  });
});

/* HTTP Server */
const server = http.createServer(app);

/* Socket.IO */
const io = new Server(server, {
  cors: corsOptions,
});

io.use(socketHandler);

// io.on("connection", (socket) => {
//   socket.join(`user:${socket.userId}`);

//   socket.on("disconnect", () => {
//     console.log(`User disconnected: ${socket.userId}`);
//   });
// });

socketConnection(io);

/* Set Socket.IO Instance */
setIO(io);

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 4000;
  connectDB().then(() => {
    server.listen(PORT, () => {
      console.log(`Server running locally on port ${PORT}`);
    });
  });
}

export default app;
export const handler = serverless(app);

// connectDB().then(() => {
//   server.listen(PORT, "0.0.0.0", () => {
//     console.log(`Server running on port ${PORT}`);
//   });
// });
