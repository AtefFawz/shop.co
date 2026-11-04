import mongoose from "mongoose";
import validator from "validator";
import { USER, ADMIN, MANAGER } from "../utils/role.js";

const authSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "This email is not valid"],
      maxlength: 254,
    },
    password: {
      type: String,
      required: [
        function () {
          return !this.googleId;
        },
        "Password is required",
      ],
      select: false,
    },
    otpDailyCount: { type: Number, default: 0, min: 0, select: false },
    lastOtpRequest: { type: Date, default: null, select: false },
    token: { type: String, select: false },
    refreshTokenHash: { type: String, select: false, default: null },
    tokenVersion: { type: Number, default: 0, min: 0, select: false },
    // Previous refresh-token hash kept for a short grace window so two tabs that
    // refresh at the same moment do not log the user out.
    prevRefreshTokenHash: { type: String, select: false, default: null },
    prevRefreshRotatedAt: { type: Date, select: false, default: null },
    // Legacy users have no value here and are treated as verified; only new
    // password sign-ups are created with emailVerified:false.
    emailVerified: { type: Boolean, default: true },
    emailVerificationHash: { type: String, select: false, default: null },
    emailVerificationExpires: { type: Date, select: false, default: null },
    emailVerificationAttempts: { type: Number, default: 0, min: 0, select: false },
    emailVerificationSentAt: { type: Date, select: false, default: null },
    role: {
      type: String,
      enum: [USER, ADMIN, MANAGER],
      default: USER,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    avatar: {
      type: String,
      default:
        "https://res.cloudinary.com/dudit0nty/image/upload/q_auto/f_auto/v1777336486/shop-co-uploads/cwmwfgwrwxxqlk65grw4.png",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

authSchema.virtual("orders", {
  ref: "order",
  localField: "_id",
  foreignField: "user",
});

authSchema.virtual("reviews", {
  ref: "review",
  localField: "_id",
  foreignField: "user",
});

const PRIVATE_FIELDS = [
  "password",
  "token",
  "refreshTokenHash",
  "prevRefreshTokenHash",
  "prevRefreshRotatedAt",
  "tokenVersion",
  "otpDailyCount",
  "lastOtpRequest",
  "emailVerificationHash",
  "emailVerificationExpires",
  "emailVerificationAttempts",
  "emailVerificationSentAt",
];

const stripPrivateFields = (doc, ret) => {
  for (const field of PRIVATE_FIELDS) delete ret[field];
  delete ret.__v;
  return ret;
};

authSchema.set("toJSON", { virtuals: true, transform: stripPrivateFields });
authSchema.set("toObject", { virtuals: true, transform: stripPrivateFields });

export default mongoose.model("user", authSchema);
