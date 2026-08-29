const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const reviews = require("../modules/reviewsSchema");
const { Fail } = require("../utils/httpText");
const { ADMIN } = require("../utils/role");

const mongoose = require("mongoose");

const getAllReviews = Meddle(async (req, res, next) => {
  const query = req.query || {};
  const reviewId = query.product ? { product: query.product } : {};

  const page = parseInt(query.page, 10) || 1;

  const limit = parseInt(query.limit, 10) || 10;

  const skip = (page - 1) * limit;

  const allReviews = await reviews
    .find(reviewId)
    .populate("user", "fullName avatar")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  const totalReviews = await reviews.countDocuments(reviewId);

  res.status(200).json({
    status: "success",
    results: allReviews.length,
    pagination: {
      total: totalReviews,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalReviews / limit),
    },
    data: { reviews: allReviews },
  });
});

const addReview = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId) {
    return next(appError.create("User not authenticated", Fail, 401));
  }
  const { product, rating, comment } = req.body;

  if (!product || !rating || !comment) {
    return next(
      appError.create("Please provide all required fields", Fail, 400),
    );
  }

  const newReview = await reviews.create({
    product,
    user: userId,
    rating,
    comment,
  });

  res.status(201).json({ status: "success", data: { review: newReview } });
});

const deleteReview = Meddle(async (req, res, next) => {
  const reviewId = req.params.id;

  if (!reviewId || !mongoose.Types.ObjectId.isValid(reviewId)) {
    return next(appError.create("Review ID is required", Fail, 400));
  }

  const currentUserId = (req.currentUser.id || req.currentUser._id).toString();

  const deleteFilter = { _id: reviewId };

  if (req.currentUser.role !== ADMIN) {
    deleteFilter.user = currentUserId;
  }

  const deletedReview = await reviews.findOneAndDelete(deleteFilter);

  if (!deletedReview) {
    return next(
      appError.create(
        "Review not found or you are not authorized to delete it",
        Fail,
        404,
      ),
    );
  }
  res
    .status(200)
    .json({ status: "success", message: "Review deleted successfully" });
});

module.exports = {
  addReview,
  getAllReviews,
  deleteReview,
};
