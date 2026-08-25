// const mongoose = require("mongoose");

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

// module.exports = connectDB;
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.URL, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 50,
    });

    console.log(`Database connected successfully: ${conn.connection.host}`);
  } catch (err) {
    console.error("Database Connection Failed:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
