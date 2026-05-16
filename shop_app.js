require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

// Database Connection Middleware
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res
      .status(500)
      .json({ status: "Error", message: "Database Connection Error" });
  }
});

// Middle wares
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(cookieParser());

const { productRoutes } = require("./routes/productRoutes");
const { userRouts } = require("./routes/userRouts");
const { orderRouter } = require("./routes/orderRoutes");
const { adminRoute } = require("./routes/adminRoutes");
const { reviewsRouter } = require("./routes/reviewsRoutes");
const { profileRouts } = require("./routes/profileRoutes");
const { Error } = require("./utils/httpText");

// Routes
app.use("/api/product", productRoutes);
app.use("/api/auth", userRouts);
app.use("/api/order", orderRouter);
app.use("/api/admin", adminRoute);
app.use("/api/review", reviewsRouter);
app.use("/api/profile", profileRouts);

// Global Error Handler
// Middleware Handler any routes is not found

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: err.statusText || Error,
    message: err.errorText || "Internal Server Error",
    code: statusCode,
  });
});
app.listen(process.env.PORT || 5000, () => {
  console.log(`Server is running on port ${process.env.PORT || 5000}`);
});

module.exports = app;
