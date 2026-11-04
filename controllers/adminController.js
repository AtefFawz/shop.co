import mongoose from "mongoose";
import User from "../models/authSchema.js";
import Product from "../models/productSchema.js";
import Order from "../models/orderSchema.js";
import Review from "../models/reviewSchema.js";
import Notification from "../models/notificationSchema.js";
import OTP from "../models/otpSchema.js";
import ProductEngagement from "../models/productEngagementSchema.js";
import SocketTicket from "../models/socketTicketSchema.js";
import OAuthCode from "../models/oauthCodeSchema.js";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import { Fail, Success } from "../utils/httpText.js";
import { USER, MANAGER, ADMIN } from "../utils/role.js";
import { getPagination } from "../utils/pagination.js";
import { disconnectUserSockets } from "../utils/socket.js";

const getDashboardStats = Wrapper(async (req, res) => {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [
    thisMonthRevenue,
    lastMonthRevenue,
    currentMonthOrders,
    lastMonthOrders,
    currentMonthUsers,
    lastMonthUsers,
    totalRevenue,
    totalOrders,
    totalUsers,
    totalProducts,
    pendingOrders,
    rawWeeklySales,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfThisMonth }, status: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth }, status: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
    Order.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
    Order.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } }),
    User.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
    User.countDocuments({ createdAt: { $gte: startOfLastMonth, $lt: startOfThisMonth } }),
    Order.aggregate([
      { $match: { status: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
    Order.countDocuments(),
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments({ status: "Pending" }),
    Order.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, status: "Delivered" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const weeklySales = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - index);
    const dateKey = date.toISOString().slice(0, 10);
    const locale = req.locale === "ar" ? "ar-EG" : "en-US";
    const day = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    const existing = rawWeeklySales.find((item) => item._id === dateKey);
    weeklySales.push({ day, date: dateKey, revenue: existing?.revenue || 0 });
  }

  return res.status(200).json({
    status: Success,
    data: {
      totalRevenue: totalRevenue[0]?.total || 0,
      totalOrders,
      totalUsers,
      totalProducts,
      pendingOrders,
      currentMonthRevenue: thisMonthRevenue[0]?.total || 0,
      lastMonthRevenue: lastMonthRevenue[0]?.total || 0,
      currentMonthOrders,
      lastMonthOrders,
      currentMonthUsers,
      lastMonthUsers,
      weeklySales,
    },
  });
});

const users = Wrapper(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 100) : "";
  if (req.query.keyword !== undefined && typeof req.query.keyword !== "string") {
    throw appError.create("Invalid keyword value", Fail, 400);
  }

  const conditions = [];
  if (keyword) {
    const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    conditions.push({
      $or: [
        { fullName: { $regex: safeKeyword, $options: "i" } },
        { email: { $regex: safeKeyword, $options: "i" } },
      ],
    });
  }

  const role = typeof req.query.role === "string" ? req.query.role : "all";
  if (!["all", "admin", "manager", "user"].includes(role)) {
    throw appError.create("Invalid role filter", Fail, 400);
  }
  if (role === "admin") conditions.push({ role: ADMIN });
  if (role === "manager") conditions.push({ role: { $in: [MANAGER, "MANGER"] } });
  if (role === "user") conditions.push({ role: { $nin: [ADMIN, MANAGER, "MANGER"] } });
  const filter = conditions.length ? { $and: conditions } : {};

  const sortOptions = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    "name-asc": { fullName: 1, _id: 1 },
  };
  const sortKey = typeof req.query.sort === "string" && req.query.sort ? req.query.sort : "newest";
  if (!Object.hasOwn(sortOptions, sortKey)) {
    throw appError.create("Invalid sort value", Fail, 400);
  }

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [totalUsers, allUsers, roleRows, joinedThisMonth, allUsersCount] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select("-password -token -refreshTokenHash -tokenVersion -otpDailyCount -lastOtpRequest")
      .sort(sortOptions[sortKey])
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    User.aggregate([{ $group: { _id: { $toUpper: { $ifNull: ["$role", USER] } }, total: { $sum: 1 } } }]),
    User.countDocuments({ createdAt: { $gte: startOfThisMonth } }),
    User.countDocuments(),
  ]);

  const roleCounts = Object.fromEntries(roleRows.map((row) => [row._id, row.total]));
  const admins = roleCounts[ADMIN] || 0;
  const managers = (roleCounts[MANAGER] || 0) + (roleCounts.MANGER || 0);
  const customers = Math.max(0, allUsersCount - admins - managers);

  return res.status(200).json({
    status: Success,
    results: allUsers.length,
    pagination: { total: totalUsers, totalPages: Math.ceil(totalUsers / limit), currentPage: page, limit },
    summary: { admins, managers, customers, joinedThisMonth, total: allUsersCount },
    data: { users: allUsers },
  });
});

const getUser = Wrapper(async (req, res, next) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Invalid user ID format", Fail, 400));
  }

  const user = await User.findById(userId)
    .select("-password -token -refreshTokenHash -tokenVersion -otpDailyCount -lastOtpRequest")
    .populate({ path: "orders", select: "totalPrice status createdAt", options: { sort: { createdAt: -1 }, limit: 50 } })
    .populate({
      path: "reviews",
      select: "rating comment product createdAt",
      options: { sort: { createdAt: -1 }, limit: 50 },
      populate: { path: "product", select: "name nameAr nameEn" },
    })
    .lean({ virtuals: true });
  if (!user) return next(appError.create("User not found", Fail, 404));

  user.memberSince = user.createdAt || new mongoose.Types.ObjectId(userId).getTimestamp();
  if (req.locale === "ar") {
    user.reviews = (user.reviews || []).map((review) => ({
      ...review,
      product: review.product
        ? { ...review.product, name: review.product.nameAr || review.product.name || review.product.nameEn }
        : review.product,
    }));
  }

  return res.status(200).json({ status: Success, data: { user } });
});

const deleteUser = Wrapper(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = (req.currentUser?.id || req.currentUser?._id)?.toString();
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Invalid user ID format", Fail, 400));
  }
  if (currentUserId === userId.toString()) {
    return next(appError.create("Forbidden: You cannot delete your own admin account", Fail, 403));
  }

  const deletedUser = await User.findByIdAndDelete(userId);
  if (!deletedUser) return next(appError.create("User not found", Fail, 404));
  disconnectUserSockets(deletedUser._id);

  // Pending orders would otherwise keep their stock reserved forever with nobody to
  // fulfil them. Shipped/delivered orders stay as financial records.
  const pendingOrders = await Order.find({ user: userId, status: "Pending" }).select("orderItems").lean();
  for (const order of pendingOrders) {
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, status: "Pending" },
      {
        $set: { status: "Cancelled" },
        $push: { statusHistory: { status: "Cancelled", changedAt: new Date(), changedBy: currentUserId } },
      },
    ).select("_id");
    if (!claimed) continue;
    await Product.bulkWrite(
      order.orderItems.map((item) => ({
        updateOne: { filter: { _id: item.product }, update: { $inc: { countInStock: item.quantity } } },
      })),
      { ordered: false },
    );
  }

  const userReviews = await Review.find({ user: userId }).select("product").lean();
  const affectedProductIds = [...new Set(userReviews.map((review) => review.product.toString()))];
  await Promise.all([
    Review.deleteMany({ user: userId }),
    Notification.deleteMany({ $or: [{ user: userId }, { recipient: userId }] }),
    OTP.deleteMany({ email: deletedUser.email }),
    ProductEngagement.deleteMany({ user: userId }),
    SocketTicket.deleteMany({ user: userId }),
    OAuthCode.deleteMany({ user: userId }),
  ]);
  await Promise.all(affectedProductIds.map((productId) => Review.calcAverageRatings(productId)));

  return res.status(200).json({ status: Success, message: "User deleted successfully", data: null });
});

const UpdateUserRole = Wrapper(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = (req.currentUser?.id || req.currentUser?._id)?.toString();
  const role = typeof req.body.role === "string" ? req.body.role.trim().toUpperCase() : null;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Invalid user ID format", Fail, 400));
  }
  if (![ADMIN, MANAGER, USER].includes(role)) {
    return next(appError.create("Invalid role value", Fail, 400));
  }
  if (userId.toString() === currentUserId) {
    return next(appError.create("Managers/Admins cannot update their own role", Fail, 400));
  }

  const targetUser = await User.findById(userId).select("+tokenVersion +refreshTokenHash");
  if (!targetUser) return next(appError.create("User not found", Fail, 404));
  if (targetUser.role === ADMIN && req.currentUser?.role !== ADMIN) {
    return next(appError.create("Only Admins can modify Admin accounts", Fail, 403));
  }

  targetUser.role = role;
  targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
  targetUser.refreshTokenHash = null;
  await targetUser.save({ validateBeforeSave: true });
  disconnectUserSockets(targetUser._id);

  return res.status(200).json({
    status: Success,
    message: "User role updated successfully",
    data: { user: targetUser },
  });
});

export { users, UpdateUserRole, getUser, deleteUser, getDashboardStats };
