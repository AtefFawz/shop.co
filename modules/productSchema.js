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
    type: { type: String },
    section: { type: String, required: true },
    photo: { type: String },

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

module.exports = mongoose.model("product", productSchema);
