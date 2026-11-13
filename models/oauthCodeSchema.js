import mongoose from "mongoose";

const oauthCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true, select: false },
    clientStateHash: { type: String, required: true, select: false },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

oauthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
oauthCodeSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.oauthcode || mongoose.model("oauthcode", oauthCodeSchema);
