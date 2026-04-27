const User = require("../modules/userSchema");
const Product = require("../modules/productSchema");
const Order = require("../modules/orderSchema");
const Meddle = require("../middlewares/meddle");

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

module.exports = { getAdminStats };
