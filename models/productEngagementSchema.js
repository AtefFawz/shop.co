import mongoose from "mongoose";

const productEngagementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "product", required: true, index: true },
  type: { type: String, enum: ["saved", "recent", "price-alert"], required: true },
  targetPrice: { type: Number, min: 0 },
  lastViewedAt: { type: Date },
  triggeredAt: { type: Date },
}, { timestamps: true });

productEngagementSchema.index({ user: 1, product: 1, type: 1 }, { unique: true });
productEngagementSchema.index({ type: 1, updatedAt: -1 });
export default mongoose.model("productEngagement", productEngagementSchema);
