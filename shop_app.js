require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { socketConnection } = require("./sockets/index");

// Config
const connectDB = require("./config/db");

// Socket
const { socketHandler } = require("./middlewares/socketHandler");
const { setIO } = require("./utils/socket");

// Routes
const { productRoutes } = require("./routes/productRoutes");
const { userRouts } = require("./routes/userRouts");
const { orderRouter } = require("./routes/orderRoutes");
const { adminRoute } = require("./routes/adminRoutes");
const { reviewsRouter } = require("./routes/reviewsRoutes");
const { profileRouts } = require("./routes/profileRoutes");
const { notificationRouter } = require("./routes/notificationRoutes");

// Utils
// const { Error } = require("./utils/httpText");

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
app.use("/api/auth", userRouts);
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

const PORT = process.env.PORT || 4000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
