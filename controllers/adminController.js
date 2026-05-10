const User = require("../modules/userSchema");
const Product = require("../modules/productSchema");
const Order = require("../modules/orderSchema");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");
const { USER, MANGER, ADMIN } = require("../utils/role");

const getAdminStats = Meddle(async (req, res, next) => {
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

  res.status(200).json({
    status: "Success",
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
  // بنجيب كل اليوزرز بس بنخفي الـ Password للأمان
  const allUsers = await User.find({}, "-password").sort({ createdAt: -1 });

  if (!allUsers) {
    return next(appError.create("Failed to retrieve users", Fail, 500));
  }
  console.log(allUsers);

  if (allUsers.length === 0) {
    return res.status(200).json({
      status: Success,
      message: "No users found",
      data: { users: [] },
    });
  }

  res.status(200).json({
    status: "Success",
    data: { users: allUsers },
  });
});

// Update User Role (MANAGER Only)
const UpdateUserRole = Meddle(async (req, res, next) => {
  const userId = req.params.userId;
  const currentUserId = req.currentUser._id || req.currentUser.id;
  const role = req.body.role ? req.body.role.toUpperCase() : null;

  // Check if the user exists
  const targetUser = await User.findById(userId);
  if (!targetUser) {
    return next(appError.create("User not found", Fail, 404));
  }

  // check if the manager is trying to update their own role
  if (userId === currentUserId) {
    return next(
      appError.create(
        "Managers/Admins cannot update their own role",
        Fail,
        400,
      ),
    );
  }

  // Prevent non-admins from modifying admin accounts
  if (targetUser.role === ADMIN && req.currentUser.role !== ADMIN) {
    return next(
      appError.create("Only Admins can modify Admin accounts", Fail, 403),
    );
  }

  //  Validate role value
  const allowedRoles = [ADMIN, MANGER, USER];
  if (!role || !allowedRoles.includes(role)) {
    return next(appError.create("Invalid role value", Fail, 400));
  }

  // Update the user's role
  const user = await User.findByIdAndUpdate(
    userId,
    { role: role },
    { new: true, runValidators: true },
  ).select("-password");

  return res.status(200).json({
    status: "Success",
    message: "User role updated successfully",
    user,
  });
});

module.exports = { getAdminStats, users, UpdateUserRole };
