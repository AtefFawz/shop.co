const Order = require("../modules/orderSchema");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");

const createOrder = Meddle(async (req, res, next) => {
  const userId = req.currentUser._id || req.currentUser.id;

  if (!userId) {
    return next(appError.create("User authentication failed", Fail, 401));
  }

  const { orderItems, shippingAddress, totalPrice } = req.body;

  const formattedOrderItems = orderItems.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    image: item.image,
    price: item.price,
    product: item.productId || item.product,
  }));

  // ٢. استخدم Order للموديل و newOrder للمتغير
  const newOrder = new Order({
    user: userId,
    orderItems: formattedOrderItems,
    shippingAddress,
    totalPrice,
  });

  const saveItem = await newOrder.save();
  res.status(201).json({ status: "Success", data: { order: saveItem } });
});

const getOrder = Meddle(async (req, res, next) => {
  console.log("Logged in user:", req.currentUser);
  const userId = req.currentUser._id || req.currentUser.id;
  if (!req.currentUser) {
    return next(
      appError.create("Unauthorized: User not found in request", "Fail", 401),
    );
  }

  const orders = await Order.find({ user: userId })
    .populate("orderItems.product", "name image price")
    .sort({ createdAt: -1 });

  if (orders.length === 0) {
    return res.status(200).json({
      status: "Success",
      message: "No orders yet",
      data: { orders: [] },
    });
  }

  res.status(200).json({ status: "Success", data: { orders } });
});

// Update Order Status
const updateOrderStatus = Meddle(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["Pending", "Shipped", "Delivered", "Cancelled"];
  if (!validStatuses.includes(status)) {
    return next(appError.create("Invalid status value", "Fail", 400));
  }

  // استخدم الموديل Order (كبير) والنتيجة في متغير updatedOrder
  const updatedOrder = await Order.findByIdAndUpdate(
    id,
    { status },
    { new: true },
  );

  if (!updatedOrder) {
    return next(appError.create("Order not found", "Fail", 404));
  }

  res.status(200).json({ status: "Success", data: { order: updatedOrder } });
});

const getOrders = Meddle(async (req, res, next) => {
  const orders = await Order.find()
    .populate("user", "fullName email")
    .populate("orderItems.product", "name price image")
    .sort({ createdAt: -1 });

  if (orders.length === 0) {
    return res.status(200).json({
      status: "Success",
      message: "No orders found",
      data: { orders: [] },
    });
  }
  res.status(200).json({ status: "Success", data: { orders } });
});

// Delete Order
const deleteOrder = Meddle(async (req, res, next) => {
  const { id } = req.params;
  console.log("Deleting order with ID:", id);
  const deletedOrder = await Order.findByIdAndDelete(id);
  console.log("Deleted order:", deletedOrder);
  if (!deletedOrder) {
    return next(appError.create("Order not found", Fail, 404));
  }

  res.status(200).json({ status: "Success", message: "Order deleted" });
});

module.exports = {
  createOrder,
  getOrder,
  getOrders,
  updateOrderStatus,
  deleteOrder,
};
