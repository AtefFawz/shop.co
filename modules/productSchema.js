const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    discount: { type: String },
    price: { type: String, required: true },
    category: { type: String, required: true },
    isSale: { type: Boolean },
    colors: { type: [String] },
    size: { type: [String] },
    gender: { type: String },
    section: { type: String, required: true },
    photo: { type: String },
    images: { type: [String] },
    style: { type: String },
    countInStock: {
      type: Number,
      required: [true, "Product stock quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    ratingsAverage: {
      type: Number,
      default: 0,
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
  },
  {
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

productSchema.virtual("reviews", {
  ref: "review",
  localField: "_id",
  foreignField: "product",
});

productSchema.index({
  name: "text",
  description: "text",
  section: "text",
  gender: "text",
});
module.exports = mongoose.model("product", productSchema);
