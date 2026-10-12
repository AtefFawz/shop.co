// const mongoose from("mongoose");

// let cachedConnection = null;

// const connectDB = async () => {
//   if (cachedConnection) {
//     return cachedConnection;
//   }

//   try {
//     const connection = await mongoose.connect(process.env.URL, {
//       serverSelectionTimeoutMS: 5000,
//     });

//     cachedConnection = connection;

//     console.log("Database connected successfully");

//     return cachedConnection;
//   } catch (err) {
//     console.error("Database Connection Failed:", err.message);
//     throw err;
//   }
// };

// export default connectDB;
import mongoose from "mongoose";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose
      .connect(process.env.URL, opts)
      .then((mongoose) => {
        return mongoose;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
};

export default connectDB;
