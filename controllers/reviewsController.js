const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const reviews = require("../modules/reviewsSchema");
const { Fail } = require("../utils/httpText");
const { ADMIN } = require("../utils/role");

const mongoose = require("mongoose");

const getAllReviews = Meddle(async (req, res, next) => {
  const allReviews = await reviews.find({}).populate("user", "fullName avatar");

  res.status(200).json({
    status: "success",
    results: allReviews.length,
    data: { reviews: allReviews },
  });
});

const addReview = Meddle(async (req, res, next) => {
  const userId = req.currentUser._id || req.currentUser.id;

  console.log(userId);

  if (!userId) {
    return next(appError.create("User not authenticated", Fail, 401));
  }
  console.log(mongoose.Types.ObjectId);
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

  if (!reviewId) {
    return next(appError.create("Review ID is required", Fail, 400));
  }

  const review = await reviews.findById(reviewId);

  if (!review) {
    return next(appError.create("Review not found", Fail, 404));
  }

  const currentUserId = req.currentUser.id.toString();

  if (
    review.user.toString() !== currentUserId &&
    req.currentUser.role !== ADMIN
  ) {
    return next(
      appError.create(
        "You are not authorized to delete this review",
        Fail,
        403,
      ),
    );
  }

  await reviews.findByIdAndDelete(reviewId);

  res
    .status(200)
    .json({ status: "success", message: "Review deleted successfully" });
});

// const getReviewById = Meddle(async (req, res, next) => {
//   const reviewId = req.params.id;

//   if (!reviewId) {
//     return next(appError.create("Review ID is required", Fail, 400));
//   }

//   const review = await reviews.findById(reviewId);

//   if (!review) {
//     return next(appError.create("Review not found", Fail, 404));
//   }

//   res.status(200).json({ status: "success", data: { review } });
// });

module.exports = {
  addReview,
  getAllReviews,
  // getReviewById,
  deleteReview,
};
