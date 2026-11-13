import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import Review from "../models/reviewSchema.js";
import Product from "../models/productSchema.js";
import Order from "../models/orderSchema.js";
import { Fail, Success } from "../utils/httpText.js";
import { ADMIN } from "../utils/role.js";
import mongoose from "mongoose";
import { getPagination } from "../utils/pagination.js";

const getAllReviews = Wrapper(async (req, res, next) => {
  const filter = {};
  if (req.query.product !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(req.query.product)) {
      return next(appError.create("Invalid product ID", Fail, 400));
    }
    filter.product = req.query.product;
  }

  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const [allReviews, totalReviews] = await Promise.all([
    Review.find(filter)
      .populate("user", "fullName avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Review.countDocuments(filter),
  ]);

  return res.status(200).json({
    status: Success,
    results: allReviews.length,
    pagination: { total: totalReviews, page, limit, totalPages: Math.ceil(totalReviews / limit) },
    data: { reviews: allReviews },
  });
});

const addReview = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("User not authenticated", Fail, 401));
  }

  const productId = String(req.body.product || "");
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
  if (!mongoose.Types.ObjectId.isValid(productId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || !comment || comment.length > 2000) {
    return next(appError.create("Please provide all required fields", Fail, 400));
  }

  const productExists = await Product.exists({ _id: productId });
  if (!productExists) return next(appError.create("Product with this ID does not exist", Fail, 404));

  // Verified purchase: only customers whose order containing this product was delivered.
  const hasPurchased = await Order.exists({
    user: userId,
    status: "Delivered",
    "orderItems.product": productId,
  });
  if (!hasPurchased) {
    return next(appError.create("You can only review products you have purchased and received", Fail, 403));
  }

  let review;
  try {
    // The unique {product, user} index makes this race-free; no check-then-create.
    review = await Review.create({ product: productId, user: userId, rating, comment });
  } catch (error) {
    if (error?.code === 11000) {
      return next(appError.create("You have already reviewed this product", Fail, 409));
    }
    throw error;
  }
  return res.status(201).json({ status: Success, data: { review } });
});

const deleteReview = Wrapper(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid review ID", Fail, 400));

  const userId = (req.currentUser?.id || req.currentUser?._id)?.toString();
  const filter = { _id: id };
  if (req.currentUser.role !== ADMIN) filter.user = userId;

  const deletedReview = await Review.findOneAndDelete(filter);
  if (!deletedReview) {
    return next(appError.create("Review not found or you are not authorized to delete it", Fail, 404));
  }
  return res.status(200).json({ status: Success, message: "Review deleted successfully" });
});

export { addReview, getAllReviews, deleteReview };
