import mongoose from "mongoose";

const rateLimitBucketSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    hits: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "rate_limit_buckets",
    versionKey: false,
    timestamps: false,
  },
);

rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.rate_limit_bucket ||
  mongoose.model("rate_limit_bucket", rateLimitBucketSchema);
