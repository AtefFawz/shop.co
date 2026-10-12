import mongoose from "mongoose";
import validator from "validator";
import { USER, ADMIN, MANAGER } from "../utils/role.js";
const authSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,

      validate: [validator.isEmail, "This email is not valid"],
    },

    password: {
      type: String,
      required: [
        function () {
          return !this.googleId;
        },
        "Password is required",
      ],
      trim: true,
      select: false,
    },

    otpDailyCount: { type: Number, default: 0 },
    lastOtpRequest: { type: Date, default: null },

    token: { type: String },

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
  { timestamps: true },
  {
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

authSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});
authSchema.set("toObject", { virtuals: true });
export default mongoose.model("user", authSchema);
