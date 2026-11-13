import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  otp: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0, min: 0, max: 5 },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

export default mongoose.model("OTP", otpSchema);
