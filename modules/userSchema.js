const mongoose = require("mongoose");
let validator = require("validator");
const { USER, ADMIN, MANGER } = require("../utils/role");
const userSchema = new mongoose.Schema(
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
      required: [true, "Password is required"],
      trim: true,
      select: false,
    },
    token: { type: String },
    role: {
      type: String,
      enum: [USER, ADMIN, MANGER],
      default: USER,
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
userSchema.virtual("orders", {
  ref: "order",
  localField: "_id",
  foreignField: "user",
});

userSchema.virtual("reviews", {
  ref: "review",
  localField: "_id",
  foreignField: "user",
});

userSchema.set(
  "toJSON",
  { virtuals: true },
  {
    transform: (doc, ret) => {
      delete ret.__v;
      delete ret.password;
      return ret;
    },
  },
);
userSchema.set("toObject", { virtuals: true });
module.exports = mongoose.model("user", userSchema);
