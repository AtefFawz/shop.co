import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { timestamps: true },
);

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

reviewSchema.statics.calcAverageRatings = async function (productId) {
  const [stats] = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId) } },
    {
      $group: {
        _id: "$product",
        nRating: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
  ]);

  await mongoose.model("product").findByIdAndUpdate(productId, {
    ratingsQuantity: stats?.nRating || 0,
    ratingsAverage: stats ? Math.round(stats.avgRating * 10) / 10 : 0,
  });
};

reviewSchema.post("save", async function (doc) {
  await doc.constructor.calcAverageRatings(doc.product);
});

reviewSchema.post(/^findOneAnd/, async function (doc) {
  if (doc) await doc.constructor.calcAverageRatings(doc.product);
});

export default mongoose.model("review", reviewSchema);
