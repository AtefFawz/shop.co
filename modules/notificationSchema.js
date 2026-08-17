const mongoose = require("mongoose");
const { USER, ADMIN } = require("../utils/role");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: false,
    },

    type: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "order",
    },

    read: {
      type: Boolean,
      default: false,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: false,
    },

    recipientRole: {
      type: String,
      enum: [USER, ADMIN],
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("notification", notificationSchema);
