import mongoose from "mongoose";

const cacheKey = "__shopCoMongoose";
const cached = globalThis[cacheKey] || (globalThis[cacheKey] = { conn: null, promise: null });

mongoose.connection.on("disconnected", () => {
  cached.conn = null;
  cached.promise = null;
});

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (mongoose.connection.readyState === 0 && cached.conn) {
    cached.conn = null;
    cached.promise = null;
  }
  if (!process.env.URL) throw new Error("URL (MongoDB connection string) is not configured");

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.URL, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
        minPoolSize: 0,
        autoIndex: process.env.NODE_ENV !== "production",
      })
      .catch((error) => {
        cached.promise = null;
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

export default connectDB;
