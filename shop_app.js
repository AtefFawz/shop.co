require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Mongoose Data Base Connecting
mongoose
  .connect(process.env.URL)
  .then(() => console.log("Connecting With Database "))
  .catch((err) => console.log("Database Connection Error:", err.message));

const app = express();

const { productRoutes } = require("./routes/productRoutes");

const { userRouts } = require("./routes/userRouts");

const { orderRouter } = require("./routes/orderRoutes");

const { adminRoute } = require("./routes/adminRoutes");

const { reviewsRouter } = require("./routes/reviewsRoutes");

const { profileRouts } = require("./routes/profileRoutes");

const { Error } = require("./utils/httpText");

app.use(express.json());

app.use(cors());

// Image Product
app.use("/uploads", express.static("uploads"));

// Products
app.use("/api/product", productRoutes);

// Users
app.use("/api/user", userRouts);

// Orders
app.use("/api/order", orderRouter);

// Admin
app.use("/api/admin", adminRoute);

// Reviews
app.use("/api/review", reviewsRouter);

// Profile
app.use("/api/profile", profileRouts);

// Middleware Handler any routes is not found
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: err.statusText || Error,
    data: err.errorText || "Internal Server Error",
    code: statusCode,
  });
});

app.listen(process.env.PORT || 4000, () => {
  console.log("Server is run");
});
module.exports = app;
