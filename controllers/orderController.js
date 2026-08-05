const mongoose = require("mongoose");
const { Success, Fail } = require("../utils/httpText");
const Order = require("../modules/orderSchema");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const productSchema = require("../modules/productSchema");
const { ADMIN, MANAGER } = require("../utils/role");

const createOrder = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("User authentication failed", Fail, 401));
  }

  const { orderItems, shippingAddress } = req.body;

  if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    return next(appError.create("No order items provided", Fail, 400));
  }

  if (!shippingAddress) {
    return next(appError.create("Shipping address is required", Fail, 400));
  }

  const productIds = orderItems.map((item) => item.productId || item.product);
  const dbProducts = await productSchema
    .find({ _id: { $in: productIds } })
    .select("name price photo")
    .lean({ virtuals: true });

  let calculatedTotalPrice = 0;
  const formattedOrderItems = [];

  for (const item of orderItems) {
    const targetProductId = (item.productId || item.product)?.toString();
    const dbProduct = dbProducts.find(
      (p) => p._id.toString() === targetProductId,
    );
    if (!dbProduct) {
      return next(
        appError.create(
          `Product with ID ${targetProductId} not found`,
          Fail,
          404,
        ),
      );
    }
    const realPrice = Number(dbProduct.price);
    const quantity = Number(item.quantity) || 1;

    calculatedTotalPrice += realPrice * quantity;

    formattedOrderItems.push({
      name: dbProduct.name,
      quantity,
      image: dbProduct.photo || item.image,
      price: realPrice,
      product: dbProduct._id,
    });
  }

  const newOrder = await Order.create({
    user: userId,
    orderItems: formattedOrderItems,
    shippingAddress,
    totalPrice: calculatedTotalPrice,
  });

  res.status(201).json({
    status: Success,
    data: { order: newOrder },
  });
});

const getOrder = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(
      appError.create("Unauthorized: User not found in request", Fail, 401),
    );
  }

  const orders = await Order.find({ user: userId })
    .populate("orderItems.product", "name image price")
    .sort({ createdAt: -1 })
    .lean({ virtuals: true });

  res.status(200).json({
    status: Success,
    results: orders.length,
    data: { orders },
  });
});

// Update Order Status
const updateOrderStatus = Meddle(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const userId = req.currentUser?._id || req.currentUser?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(appError.create("Invalid order ID", Fail, 400));
  }

  const validStatuses = ["Pending", "Shipped", "Delivered", "Cancelled"];
  if (!validStatuses.includes(status)) {
    return next(appError.create("Invalid status value", Fail, 400));
  }

  const updatedOrder = await Order.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true },
  );

  if (!updatedOrder) {
    return next(appError.create("Order not found", Fail, 404));
  }

  res.status(200).json({ status: Success, data: { order: updatedOrder } });
});

const getOrders = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const query = req.query;
  const limit = parseInt(query.limit) || 10;
  const page = parseInt(query.page) || 1;
  const skip = (page - 1) * limit;

  const orders = await Order.find()
    .populate("user", "fullName email")
    .populate("orderItems.product", "name price image")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  const totalOrders = await Order.countDocuments();
  res.status(200).json({
    status: Success,
    results: orders.length,
    pagination: {
      total: totalOrders,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalOrders / limit),
    },
    data: { orders },
  });
});

// Delete Order
const deleteOrder = Meddle(async (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(appError.create("Invalid order ID", Fail, 400));
  }

  const userId = req.currentUser?._id || req.currentUser?.id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const roleUser = req.currentUser?.role;
  if (roleUser !== ADMIN && roleUser !== MANAGER) {
    return next(
      appError.create("Forbidden: Only admins can delete orders", Fail, 403),
    );
  }
  const deletedOrder = await Order.findByIdAndDelete(id);

  if (!deletedOrder) {
    return next(appError.create("Order not found", Fail, 404));
  }

  res
    .status(200)
    .json({ status: Success, message: "Order deleted successfully" });
});

module.exports = {
  createOrder,
  getOrder,
  getOrders,
  updateOrderStatus,
  deleteOrder,
};
