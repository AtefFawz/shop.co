const mongoose = require("mongoose");
const Meddle = require("../middlewares/meddle");
const User = require("../modules/userSchema");
const Order = require("../modules/orderSchema");
const Review = require("../modules/reviewsSchema");
const appError = require("../utils/appError");
const { Success, Fail } = require("../utils/httpText");

const getMe = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(
      appError.create("Authentication failed, please login again", Fail, 401),
    );
  }

  const result = await User.findById(userId).lean({ virtuals: true });

  if (!result) {
    return next(appError.create("user not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    data: {
      user: result,
    },
  });
});

// controllers/orderController.js

const getMyOrders = Meddle(async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
  const skip = (page - 1) * limit;
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(
      appError.create("Authentication failed, please login again", Fail, 401),
    );
  }

  const totalOrders = await Order.countDocuments({ user: userId });

  //   Total Price
  const expenseStats = await Order.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: null, totalSpent: { $sum: "$totalPrice" } } },
  ]);

  const totalExpenses = expenseStats[0]?.totalSpent || 0;

  const orders = await Order.find({ user: userId })
    .populate("orderItems.product", "name image price")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  const totalPages = Math.ceil(totalOrders / limit) || 1;

  res.status(200).json({
    status: Success,
    pagination: {
      total: totalOrders,
      totalExpenses,
      page,
      limit,
      totalPages,
    },
    data: {
      orders,
    },
  });
});

const getMyReviews = Meddle(async (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
  const skip = (page - 1) * limit;
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(
      appError.create("Authentication failed, please login again", Fail, 401),
    );
  }

  const totalReviews = await Review.countDocuments({ user: userId });
  console.log("totalReviews: ", totalReviews);
  const reviews = await Review.find({ user: userId })
    .populate("product", "name photo price")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  const totalPages = Math.ceil(totalReviews / limit) || 1;

  res.status(200).json({
    status: Success,
    pagination: {
      total: totalReviews,
      page,
      limit,
      totalPages,
    },
    data: {
      reviews,
    },
  });
});

const updateUser = Meddle(async (req, res, next) => {
  const currentUserId = req.currentUser?._id || req.currentUser?.id;

  if (!currentUserId || !mongoose.Types.ObjectId.isValid(currentUserId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  let { fullName } = req.body;
  let updateData = {};

  if (fullName && fullName.trim() !== "") {
    updateData.fullName = fullName.trim();
  }

  if (req.file) {
    updateData.avatar = req.file.path;
  }

  if (Object.keys(updateData).length == 0) {
    return next(
      appError.create("No valid fields provided for update", Fail, 400),
    );
  }

  const updatedUser = await User.findByIdAndUpdate(currentUserId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  console.log(updatedUser);
  if (!updatedUser) {
    return next(appError.create("User was not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    message: "Profile updated successfully",
    data: { user: updatedUser },
  });
});

module.exports = { getMe, updateUser, getMyOrders, getMyReviews };
