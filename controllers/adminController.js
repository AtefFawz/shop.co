const mongoose = require("mongoose");
const User = require("../modules/userSchema");
const Product = require("../modules/productSchema");
const Order = require("../modules/orderSchema");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const { Fail, Success } = require("../utils/httpText");
const { USER, MANAGER, ADMIN } = require("../utils/role");

const getAdminStats = Meddle(async (req, res, next) => {
  console.log("getAdminStats");
  const [userCount, productCount, orderCount, revenueData] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.aggregate([
      { $match: { status: "Delivered" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]),
  ]);

  const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;
  console.log([userCount, productCount, orderCount, revenueData]);
  res.status(200).json({
    status: Success,
    data: {
      users: userCount,
      products: productCount,
      orders: orderCount,
      revenue: totalRevenue,
    },
  });
});

//  User List for Admin
const users = Meddle(async (req, res, next) => {
  // Pagination parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [totalUsers, allUsers] = await Promise.all([
    User.countDocuments(),
    User.find({}, "-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
  ]);

  res.status(200).json({
    status: Success,
    results: allUsers.length,
    pagination: {
      total: totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      limit,
    },
    data: { users: allUsers },
  });
});

// Get User Details for Admin

const getUser = Meddle(async (req, res, next) => {
  const { userId } = req.params; // Destructuring userId from req.params

  // 1. Validate userId format
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Invalid user ID format", Fail, 400));
  }

  // 2. get user details along with their orders and reviews (if any)
  const user = await User.findById(userId, "-password")
    .populate({
      path: "orders",
      select: "totalPrice status createdAt", // get only essential order fields
      options: { sort: { createdAt: -1 } }, // sort orders by most recent
    })
    .populate({
      path: "reviews",
      select: "rating comment product",
      populate: { path: "product", select: "name" },
    })
    .lean({ virtuals: true });

  if (!user) {
    return next(appError.create("User was not found", Fail, 404));
  }

  // 3. Adding memberSince field based on ObjectId timestamp

  user.memberSince = new mongoose.Types.ObjectId(userId).getTimestamp();

  res.status(200).json({
    status: Success,
    data: { user },
  });
});

// Delete User (Admin Only) - Optional, not implemented in routes yet

const deleteUser = Meddle(async (req, res, next) => {
  const { userId } = req.params;
  const currentUser = (req.currentUser?._id || req.currentUser?.id)?.toString();

  // Validate userId format
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Invalid user ID format", Fail, 400));
  }

  if (currentUser === userId.toString()) {
    appError.create(
      "Forbidden: You cannot delete your own admin account",
      Fail,
      403,
    );
  }
  const deletedUser = await User.findByIdAndDelete(userId);

  if (!deletedUser) {
    return next(appError.create("User not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    message: "User deleted successfully",
    data: null,
  });
});

// Update User Role (Admin Only)
const UpdateUserRole = Meddle(async (req, res, next) => {
  const userId = req.params.userId;
  const currentUserId = (
    req.currentUser?._id || req.currentUser?.id
  )?.toString();

  const role = req.body.role ? req.body.role.toUpperCase() : null;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Invalid user ID format", Fail, 400));
  }

  //  Validate role value
  const allowedRoles = [ADMIN, MANAGER, USER];
  if (!role || !allowedRoles.includes(role)) {
    return next(appError.create("Invalid role value", Fail, 400));
  }

  // check if the manager is trying to update their own role
  if (userId.toString() === currentUserId) {
    return next(
      appError.create(
        "Managers/Admins cannot update their own role",
        Fail,
        400,
      ),
    );
  }

  const targetUser = await User.findById(userId).select("-password");
  if (!targetUser) {
    return next(appError.create("User was not found", Fail, 404));
  }

  // Prevent non-admins from modifying admin accounts
  if (targetUser.role === ADMIN && req.currentUser?.role !== ADMIN) {
    return next(
      appError.create("Only Admins can modify Admin accounts", Fail, 403),
    );
  }

  // Update the user's role
  targetUser.role = role;
  await targetUser.save();

  res.status(200).json({
    status: Success,
    message: "User role updated successfully",
    data: { user: targetUser },
  });
});

module.exports = { getAdminStats, users, UpdateUserRole, getUser, deleteUser };
