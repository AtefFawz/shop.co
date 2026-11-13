import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 180 },
    nameAr: { type: String, trim: true, maxlength: 180 },
    nameEn: { type: String, trim: true, maxlength: 180 },
    quantity: { type: Number, required: true, min: 1, max: 100 },
    image: { type: String, required: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    // Immutable order-time variant snapshots. They remain readable if product options later change.
    size: { type: String, trim: true, maxlength: 40 },
    color: { type: String, trim: true, maxlength: 60 },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
  },
);

const ORDER_STATUSES = ["Pending", "Shipped", "Delivered", "Cancelled"];

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    orderItems: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0 && items.length <= 50,
        message: "An order must contain between 1 and 50 item lines",
      },
    },
    shippingAddress: {
      address: { type: String, required: true, trim: true, maxlength: 500 },
      city: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true, maxlength: 24 },
    },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    totalPrice: { type: Number, required: true, min: 0, default: 0 },
    paymentMethod: { type: String, enum: ["cod", "card"], default: "cod" },
    status: {
      type: String,
      required: true,
      enum: ORDER_STATUSES,
      default: "Pending",
    },
    idempotencyKey: { type: String, trim: true, maxlength: 128 },
    isPaid: { type: Boolean, required: true, default: false },
    paidAt: { type: Date },
    deliveredAt: { type: Date },
    // Written explicitly by the controllers. No default, so legacy orders do not
    // get an invented history entry stamped with the current time.
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, createdAt: -1 });
// One order per (user, Idempotency-Key). Partial so orders without a key are unaffected.
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "orderItems.product": 1, createdAt: -1 });

export default mongoose.model("order", orderSchema);
