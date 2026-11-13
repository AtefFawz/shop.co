import mongoose from "mongoose";

const socketTicketSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    tokenVersion: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

socketTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
socketTicketSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.socket_ticket ||
  mongoose.model("socket_ticket", socketTicketSchema);
