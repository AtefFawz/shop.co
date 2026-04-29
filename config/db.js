const mongoose = require("mongoose");

let cachedConnection = null;

const connectDB = async () => {
  if (cachedConnection) return cachedConnection;

  try {
    const db = await mongoose.connect(process.env.URL, {
      serverSelectionTimeoutMS: 5000,
    });
    cachedConnection = db;
    return db;
  } catch (err) {
    console.error("Database Connection Failed:", err.message);
    throw err;
  }
};

module.exports = connectDB;
