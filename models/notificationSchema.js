import mongoose from "mongoose";
import { USER, ADMIN, MANAGER } from "../utils/role.js";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    type: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    titleAr: { type: String, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    messageAr: { type: String, trim: true, maxlength: 1000 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "order" },
    read: { type: Boolean, default: false, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "user", index: true },
    recipientRole: { type: String, enum: [USER, ADMIN, MANAGER], required: true, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientRole: 1, recipient: 1, createdAt: -1 });
// Notifications are transient; without a TTL the collection grows forever.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("notification", notificationSchema);
