import mongoose from "mongoose";
import Wrapper from "../middlewares/wrapper.js";
import User from "../models/authSchema.js";
import Order from "../models/orderSchema.js";
import Review from "../models/reviewSchema.js";
import appError from "../utils/appError.js";
import { Success, Fail } from "../utils/httpText.js";
import { getPagination } from "../utils/pagination.js";

const getCurrentUserId = (req) => req.currentUser?.id || req.currentUser?._id;
const ORDER_STATUS_AR = {
  Pending: "قيد الانتظار",
  Shipped: "تم الشحن",
  Delivered: "تم التوصيل",
  Cancelled: "ملغي",
};
const localizeOrders = (orders, locale) => {
  if (locale !== "ar") return orders;
  return orders.map((order) => ({
    ...order,
    statusLabel: ORDER_STATUS_AR[order.status] || order.status,
    orderItems: (order.orderItems || []).map((item) => ({
      ...item,
      name: item.nameAr || item.name || item.nameEn,
      product: item.product && typeof item.product === "object"
        ? { ...item.product, name: item.product.nameAr || item.product.name || item.product.nameEn }
        : item.product,
    })),
  }));
};

const getMe = Wrapper(async (req, res, next) => {
  const userId = getCurrentUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Authentication failed, please login again", Fail, 401));
  }

  const user = await User.findById(userId)
    .select("-password -token -refreshTokenHash -tokenVersion -otpDailyCount -lastOtpRequest")
    .lean({ virtuals: true });
  if (!user) return next(appError.create("User not found", Fail, 404));

  return res.status(200).json({ status: Success, data: { user } });
});

const getMyOrders = Wrapper(async (req, res, next) => {
  const userId = getCurrentUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Authentication failed, please login again", Fail, 401));
  }

  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const orderFilter = { user: userId };
  if (req.query.status !== undefined && req.query.status !== "") {
    if (!["Pending", "Shipped", "Delivered", "Cancelled"].includes(req.query.status)) {
      return next(appError.create("Invalid status value", Fail, 400));
    }
    orderFilter.status = req.query.status;
  }
  const [totalOrders, orders, expenseStats] = await Promise.all([
    Order.countDocuments(orderFilter),
    Order.find(orderFilter)
      .populate("orderItems.product", "name nameAr nameEn photo price")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Order.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), status: { $ne: "Cancelled" } } },
      { $group: { _id: null, totalSpent: { $sum: "$totalPrice" } } },
    ]),
  ]);

  return res.status(200).json({
    status: Success,
    pagination: {
      total: totalOrders,
      totalExpenses: expenseStats[0]?.totalSpent || 0,
      page,
      limit,
      totalPages: Math.ceil(totalOrders / limit),
    },
    data: { orders: localizeOrders(orders, req.locale) },
  });
});

const getMyReviews = Wrapper(async (req, res, next) => {
  const userId = getCurrentUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Authentication failed, please login again", Fail, 401));
  }

  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const [totalReviews, reviews] = await Promise.all([
    Review.countDocuments({ user: userId }),
    Review.find({ user: userId })
      .populate("product", "name nameAr nameEn photo price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
  ]);

  if (req.locale === "ar") {
    for (const review of reviews) {
      if (review.product) {
        review.product.name = review.product.nameAr || review.product.name || review.product.nameEn;
      }
    }
  }

  return res.status(200).json({
    status: Success,
    pagination: { total: totalReviews, page, limit, totalPages: Math.ceil(totalReviews / limit) },
    data: { reviews },
  });
});

const updateUser = Wrapper(async (req, res, next) => {
  const userId = getCurrentUserId(req);
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const updateData = {};
  if (req.body.fullName !== undefined) {
    if (typeof req.body.fullName !== "string" || req.body.fullName.trim().length < 2 || req.body.fullName.trim().length > 100) {
      return next(appError.create("Invalid request payload", Fail, 400));
    }
    updateData.fullName = req.body.fullName.trim();
  }
  if (req.file?.path) updateData.avatar = req.file.path;
  if (Object.keys(updateData).length === 0) {
    return next(appError.create("No valid fields provided for update", Fail, 400));
  }

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -token -refreshTokenHash -tokenVersion -otpDailyCount -lastOtpRequest");
  if (!updatedUser) return next(appError.create("User not found", Fail, 404));

  return res.status(200).json({
    status: Success,
    message: "Profile updated successfully",
    data: { user: updatedUser },
  });
});

export { getMe, updateUser, getMyOrders, getMyReviews };
