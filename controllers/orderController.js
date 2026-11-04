import mongoose from "mongoose";
import { Success, Fail } from "../utils/httpText.js";
import Order from "../models/orderSchema.js";
import Notification from "../models/notificationSchema.js";
import User from "../models/authSchema.js";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import Product from "../models/productSchema.js";
import { ADMIN, MANAGER, USER } from "../utils/role.js";
import { getIO } from "../utils/socket.js";
import { getPagination } from "../utils/pagination.js";
import { buildInvoice } from "../services/invoiceService.js";
import { buildReorderPlan } from "../services/reorderService.js";
import { toCartProduct } from "../services/productDtoService.js";
import { resolveVariantOption, calculateProductPricing, calculateShippingFeeCents } from "../services/orderPricingService.js";

const canManageOrders = (role) => role === ADMIN || role === MANAGER;
const ORDER_STATUS_AR = {
  Pending: "قيد الانتظار",
  Shipped: "تم الشحن",
  Delivered: "تم التوصيل",
  Cancelled: "ملغي",
};
const localizeOrder = (order, locale) => {
  if (!order || locale !== "ar") return order;
  const output = { ...order, statusLabel: ORDER_STATUS_AR[order.status] || order.status };
  output.orderItems = (order.orderItems || []).map((item) => ({
    ...item,
    name: item.nameAr || item.name || item.nameEn,
    product: item.product && typeof item.product === "object"
      ? {
          ...item.product,
          name: item.product.nameAr || item.product.name || item.product.nameEn,
        }
      : item.product,
  }));
  return output;
};

const emitSafely = (room, event, payload) => {
  try {
    getIO().to(room).emit(event, payload);
  } catch (error) {
    // Real-time delivery is best-effort; a Socket.IO issue must not undo a persisted order.
    console.error("Socket notification could not be emitted:", error.message);
  }
};

const restoreReservedStock = async (reservedItems) => {
  if (!reservedItems.length) return;
  await Product.bulkWrite(
    reservedItems.map(({ productId, quantity }) => ({
      updateOne: {
        filter: { _id: productId },
        update: { $inc: { countInStock: quantity } },
      },
    })),
    { ordered: true },
  );
};

const createOrder = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("User authentication failed", Fail, 401));
  }

  const { orderItems, shippingAddress } = req.body;
  const paymentMethod = req.body.paymentMethod ?? "cod";
  if (!["cod", "card"].includes(paymentMethod)) {
    return next(appError.create("Invalid payment method", Fail, 400));
  }
  // No payment gateway is wired up yet (nothing ever sets isPaid), so card orders
  // would be accepted without being paid. Enable only once a gateway is integrated.
  if (paymentMethod === "card" && process.env.CARD_PAYMENTS_ENABLED !== "true") {
    return next(appError.create("Card payments are not available yet", Fail, 400));
  }

  const rawIdempotencyKey = req.get("idempotency-key");
  const idempotencyKey = rawIdempotencyKey ? rawIdempotencyKey.trim() : "";
  if (rawIdempotencyKey && !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) {
    return next(appError.create("Invalid Idempotency-Key header", Fail, 400));
  }
  if (!Array.isArray(orderItems) || orderItems.length === 0 || orderItems.length > 50) {
    return next(appError.create("No order items provided", Fail, 400));
  }
  if (
    !shippingAddress ||
    typeof shippingAddress.address !== "string" ||
    !shippingAddress.address.trim() ||
    typeof shippingAddress.city !== "string" ||
    !shippingAddress.city.trim() ||
    typeof shippingAddress.phone !== "string" ||
    !/^[+\d٠-٩۰-۹()\s-]{7,24}$/.test(shippingAddress.phone.trim())
  ) {
    return next(appError.create("Shipping address is required", Fail, 400));
  }

  const orderLines = [];
  const stockTotals = new Map();

  for (const item of orderItems) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return next(appError.create("Invalid request payload", Fail, 400));
    }

    const productReference = item.productId || item.product?._id || item.product;
    const productId = String(productReference || "").toLowerCase();
    const quantity = Number(item.quantity);
    if (!mongoose.Types.ObjectId.isValid(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return next(appError.create("Invalid request payload", Fail, 400));
    }

    const combinedQuantity = (stockTotals.get(productId) || 0) + quantity;
    if (combinedQuantity > 100) {
      return next(appError.create("Invalid request payload", Fail, 400));
    }

    const readVariant = (value, fieldName, maxLength) => {
      if (value === undefined || value === null || value === "") return null;
      if (typeof value !== "string" || value.trim().length > maxLength) {
        throw appError.create(`Invalid ${fieldName} value`, Fail, 400);
      }
      return value.trim();
    };

    let size;
    let color;
    try {
      size = readVariant(item.size, "size", 40);
      color = readVariant(item.color, "color", 60);
    } catch (error) {
      return next(error);
    }

    orderLines.push({ productId, quantity, size, color });
    stockTotals.set(productId, combinedQuantity);
  }

  const replayExistingOrder = async () => {
    if (!idempotencyKey) return null;
    const existing = await Order.findOne({ user: userId, idempotencyKey }).lean({ virtuals: true });
    if (!existing) return null;
    return res.status(200).json({
      status: Success,
      data: { order: localizeOrder(existing, req.locale) },
      idempotentReplay: true,
    });
  };

  // Same Idempotency-Key from the same user => return the order already created.
  const replay = await replayExistingOrder();
  if (replay) return replay;

  let newOrder;
  const session = await mongoose.startSession();
  try {
    // Stock reservation and order creation commit together or not at all, so a
    // timeout/crash between them can no longer leak stock. Everything that happens
    // inside the callback is rolled back automatically if anything throws.
    await session.withTransaction(async () => {
      newOrder = null;
      const productMap = new Map();

      for (const [productId, quantity] of stockTotals.entries()) {
        const reservedProduct = await Product.findOneAndUpdate(
          { _id: productId, countInStock: { $gte: quantity } },
          { $inc: { countInStock: -quantity } },
          { new: true, session },
        )
          .select("name nameAr nameEn price discount isSale photo images size colors countInStock")
          .lean();

        if (!reservedProduct) {
          const productExists = await Product.exists({ _id: productId }).session(session);
          if (!productExists) throw appError.create("Product with this ID does not exist", Fail, 404);
          throw appError.create("Product is out of stock or requested quantity is unavailable", Fail, 409);
        }
        productMap.set(productId, reservedProduct);
      }

      const formattedOrderItems = [];
      let calculatedTotalCents = 0;

      for (const line of orderLines) {
        const product = productMap.get(line.productId);
        if (!product) throw appError.create("Product with this ID does not exist", Fail, 404);

        let size;
        let color;
        let pricing;
        try {
          size = resolveVariantOption(line.size, product.size, "size", 40);
          color = resolveVariantOption(line.color, product.colors, "color", 60);
          pricing = calculateProductPricing(product);
        } catch (error) {
          throw appError.create(error.message, Fail, 400);
        }
        calculatedTotalCents += pricing.unitPriceCents * line.quantity;

        formattedOrderItems.push({
          name: product.nameEn || product.nameAr || product.name,
          nameEn: product.nameEn || product.name,
          ...(product.nameAr ? { nameAr: product.nameAr } : {}),
          quantity: line.quantity,
          image: product.photo || product.images?.[0] || "",
          price: pricing.unitPrice,
          ...(size ? { size } : {}),
          ...(color ? { color } : {}),
          product: product._id,
        });
      }

      const shippingFeeCents = calculateShippingFeeCents(calculatedTotalCents);
      const [created] = await Order.create(
        [
          {
            user: userId,
            orderItems: formattedOrderItems,
            shippingAddress: {
              address: shippingAddress.address.trim(),
              city: shippingAddress.city.trim(),
              phone: shippingAddress.phone.trim(),
            },
            shippingFee: shippingFeeCents / 100,
            totalPrice: (calculatedTotalCents + shippingFeeCents) / 100,
            paymentMethod,
            statusHistory: [{ status: "Pending", changedAt: new Date(), changedBy: userId }],
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        ],
        { session },
      );
      newOrder = created;
    });
  } catch (error) {
    // A concurrent request with the same key won: its order is the answer, and
    // this transaction's stock reservation was rolled back.
    if (error?.code === 11000 && idempotencyKey) {
      const raced = await replayExistingOrder();
      if (raced) return raced;
    }
    if (error?.code === 20 || /replica set|Transaction numbers/i.test(error?.message || "")) {
      return next(
        appError.create("Database must support transactions (MongoDB Atlas or a replica set)", Fail, 500),
      );
    }
    return next(error);
  } finally {
    await session.endSession();
  }

  // Notifications are best-effort: they must never refund stock after a committed order.
  try {
    const user = await User.findById(userId).select("fullName").lean();
    const notification = await Notification.create({
      user: userId,
      recipientRole: ADMIN,
      type: "ORDER_CREATED",
      title: "New Order",
      titleAr: "طلب جديد",
      message: `New Order From User: ${user?.fullName || "Customer"}`,
      messageAr: `طلب جديد من المستخدم: ${user?.fullName || "عميل"}`,
      order: newOrder._id,
    });
    emitSafely("admin", "new_notification", notification);
  } catch (notificationError) {
    console.error("Order notification could not be created:", notificationError.message);
  }

  return res.status(201).json({ status: Success, data: { order: localizeOrder(newOrder.toObject(), req.locale) } });
});

const updateOrderStatus = Wrapper(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid order ID", Fail, 400));
  if (!["Pending", "Shipped", "Delivered", "Cancelled"].includes(status)) {
    return next(appError.create("Invalid status value", Fail, 400));
  }

  const order = await Order.findById(id);
  if (!order) return next(appError.create("Order not found", Fail, 404));
  if (order.status === status) {
    return res.status(200).json({ status: Success, data: { order: localizeOrder(order.toObject(), req.locale) } });
  }

  const allowedTransitions = {
    Pending: ["Shipped", "Cancelled"],
    Shipped: ["Delivered"],
    Delivered: [],
    Cancelled: [],
  };
  if (!allowedTransitions[order.status]?.includes(status)) {
    return next(appError.create(`Cannot change order status from ${order.status} to ${status}`, Fail, 409));
  }

  const updatedOrder = await Order.findOneAndUpdate(
    { _id: id, status: order.status },
    {
      $set: {
        status,
        ...(status === "Delivered" ? { deliveredAt: new Date() } : {}),
        // Cash on delivery is collected at the door, so delivery is when it becomes paid.
        ...(status === "Delivered" && order.paymentMethod === "cod" && !order.isPaid
          ? { isPaid: true, paidAt: new Date() }
          : {}),
      },
      $push: { statusHistory: { status, changedAt: new Date(), changedBy: req.currentUser.id } },
    },
    { new: true, runValidators: true },
  );
  if (!updatedOrder) return next(appError.create("Order status was changed by another request", Fail, 409));

  if (status === "Cancelled") {
    try {
      await restoreReservedStock(
        updatedOrder.orderItems.map((item) => ({ productId: item.product, quantity: item.quantity })),
      );
    } catch (error) {
      await Order.updateOne({ _id: id, status: "Cancelled" }, { $set: { status: "Pending" }, $unset: { deliveredAt: 1 }, $pop: { statusHistory: 1 } });
      throw error;
    }
  }

  try {
    const notification = await Notification.create({
      user: updatedOrder.user,
      recipient: updatedOrder.user,
      recipientRole: USER,
      type: "ORDER_STATUS_CHANGED",
      title: "Order Status Updated",
      titleAr: "تم تحديث حالة الطلب",
      message: `Your order status has been changed to ${status}`,
      messageAr: `تم تغيير حالة طلبك إلى ${ORDER_STATUS_AR[status] || status}`,
      order: updatedOrder._id,
    });
    emitSafely(`user:${updatedOrder.user}`, "notification", notification);
  } catch (notificationError) {
    console.error("Order status notification could not be created:", notificationError.message);
  }

  return res.status(200).json({ status: Success, data: { order: localizeOrder(updatedOrder.toObject(), req.locale) } });
});

const getOrders = Wrapper(async (req, res, next) => {
  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const filter = {};

  if (req.query.status !== undefined && req.query.status !== "") {
    if (!["Pending", "Shipped", "Delivered", "Cancelled"].includes(req.query.status)) {
      return next(appError.create("Invalid status value", Fail, 400));
    }
    filter.status = req.query.status;
  }

  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 100) : "";
  if (req.query.keyword !== undefined && typeof req.query.keyword !== "string") {
    return next(appError.create("Invalid keyword value", Fail, 400));
  }
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(escaped, "i");
    const matchingUsers = await User.find({
      $or: [
        { fullName: expression },
        { email: expression },
      ],
    }).select("_id").limit(200).lean();
    const or = [
      { "orderItems.name": expression },
      { "orderItems.nameAr": expression },
      { "orderItems.nameEn": expression },
      { "shippingAddress.phone": expression },
      { "shippingAddress.city": expression },
    ];
    if (matchingUsers.length) or.push({ user: { $in: matchingUsers.map((user) => user._id) } });
    // Admin order labels display a leading # and often only the last six ID chars.
    const orderIdKeyword = keyword.replace(/^#/, "");
    if (/^[a-fA-F0-9]{24}$/.test(orderIdKeyword)) {
      or.push({ _id: new mongoose.Types.ObjectId(orderIdKeyword) });
    } else if (/^[a-fA-F0-9]{4,23}$/.test(orderIdKeyword)) {
      or.push({ $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: orderIdKeyword, options: "i" } } });
    }
    filter.$or = or;
  }

  const sortOptions = {
    newest: { createdAt: -1, _id: -1 },
    "total-desc": { totalPrice: -1, createdAt: -1, _id: -1 },
    "total-asc": { totalPrice: 1, createdAt: -1, _id: -1 },
  };
  const sortKey = typeof req.query.sort === "string" && req.query.sort ? req.query.sort : "newest";
  if (![...Object.keys(sortOptions), "items-desc"].includes(sortKey)) {
    return next(appError.create("Invalid sort value", Fail, 400));
  }

  const [totalOrders, summaryRows] = await Promise.all([
    Order.countDocuments(filter),
    Order.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        revenue: { $sum: "$totalPrice" },
        averageOrderValue: { $avg: "$totalPrice" },
        pendingCount: { $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] } },
        shippedCount: { $sum: { $cond: [{ $eq: ["$status", "Shipped"] }, 1, 0] } },
        deliveredCount: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0] } },
      } },
    ]),
  ]);

  let orders;
  if (sortKey === "items-desc") {
    const pageRows = await Order.aggregate([
      { $match: filter },
      { $addFields: { __itemsCount: { $size: { $ifNull: ["$orderItems", []] } } } },
      { $sort: { __itemsCount: -1, createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _id: 1 } },
    ]);
    const ids = pageRows.map((row) => row._id);
    const populated = await Order.find({ _id: { $in: ids } })
      .populate("user", "fullName email")
      .populate("orderItems.product", "name nameAr nameEn price photo")
      .lean({ virtuals: true });
    const orderMap = new Map(populated.map((order) => [String(order._id), order]));
    orders = ids.map((id) => orderMap.get(String(id))).filter(Boolean);
  } else {
    orders = await Order.find(filter)
      .populate("user", "fullName email")
      .populate("orderItems.product", "name nameAr nameEn price photo")
      .sort(sortOptions[sortKey])
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true });
  }

  const summary = summaryRows[0] || {
    revenue: 0, averageOrderValue: 0, pendingCount: 0, shippedCount: 0, deliveredCount: 0,
  };

  return res.status(200).json({
    status: Success,
    results: orders.length,
    pagination: { total: totalOrders, page, limit, totalPages: Math.ceil(totalOrders / limit) },
    data: {
      orders: orders.map((order) => localizeOrder(order, req.locale)),
      summary: {
        revenue: summary.revenue || 0,
        averageOrderValue: Math.round(summary.averageOrderValue || 0),
        pendingCount: summary.pendingCount || 0,
        shippedCount: summary.shippedCount || 0,
        deliveredCount: summary.deliveredCount || 0,
      },
    },
  });
});

const deleteOrder = Wrapper(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid order ID", Fail, 400));

  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const filter = { _id: id };
  if (!canManageOrders(req.currentUser.role)) filter.user = userId;
  const order = await Order.findOne(filter);
  if (!order) return next(appError.create("Order not found", Fail, 404));
  if (!canManageOrders(req.currentUser.role) && order.status !== "Pending") {
    return next(appError.create("Only pending orders can be deleted by customers", Fail, 403));
  }

  // Shipped/Delivered orders are financial records: they feed revenue, invoices and
  // verified-purchase reviews, so nobody (admins included) may erase them.
  if (!["Pending", "Cancelled"].includes(order.status)) {
    return next(appError.create("Shipped or delivered orders are kept for records and cannot be deleted", Fail, 409));
  }

  if (order.status === "Pending") {
    // Claim the pending order before restoring stock so concurrent delete requests cannot refund twice.
    const claimedOrder = await Order.findOneAndUpdate(
      { ...filter, status: "Pending" },
      { $set: { status: "Cancelled" } },
      { new: true },
    );
    if (!claimedOrder) return next(appError.create("Order status was changed by another request", Fail, 409));
    try {
      await restoreReservedStock(
        claimedOrder.orderItems.map((item) => ({ productId: item.product, quantity: item.quantity })),
      );
    } catch (error) {
      await Order.updateOne({ _id: id, status: "Cancelled" }, { $set: { status: "Pending" } });
      throw error;
    }
    await Order.deleteOne({ _id: id, status: "Cancelled" });
  } else {
    await Order.findOneAndDelete({ ...filter, status: order.status });
  }

  return res.status(200).json({ status: Success, message: "Order deleted successfully" });
});

const getOrderById = Wrapper(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid order ID", Fail, 400));
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const order = await Order.findById(id)
    .populate("user", "fullName email")
    .populate("orderItems.product", "name nameAr nameEn price photo")
    .lean({ virtuals: true });
  if (!order) return next(appError.create("Order not found", Fail, 404));

  const orderOwnerId = order.user?._id?.toString() || order.user?.toString();
  if (!canManageOrders(req.currentUser.role) && orderOwnerId !== userId.toString()) {
    return next(appError.create("You are not authorized to view this order", Fail, 403));
  }

  return res.status(200).json({ status: Success, data: { order: localizeOrder(order, req.locale) } });
});


const getOrderInvoice = Wrapper(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid order ID", Fail, 400));

  const order = await Order.findById(id).populate("user", "fullName email").lean();
  if (!order) return next(appError.create("Order not found", Fail, 404));

  const ownerId = order.user?._id?.toString() || order.user?.toString();
  if (!canManageOrders(req.currentUser.role) && ownerId !== String(userId)) {
    return next(appError.create("You are not authorized to view this invoice", Fail, 403));
  }

  return res.status(200).json({ status: Success, data: { invoice: buildInvoice(order) } });
});

const REORDER_PRODUCT_FIELDS =
  "name nameAr nameEn description descriptionAr descriptionEn price discount isSale category categoryAr categoryEn section sectionAr sectionEn style styleAr styleEn gender genderAr genderEn colors size countInStock ratingsAverage ratingsQuantity photo images";

// "Order again": rebuilds a past order against today's catalogue. Owner only (an admin
// has no reason to fill a customer's cart), and it changes nothing: the customer still
// goes through the normal cart and checkout, where price and stock are enforced.
const getReorderItems = Wrapper(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid order ID", Fail, 400));

  const order = await Order.findOne({ _id: id, user: userId }).select("orderItems").lean();
  if (!order) return next(appError.create("Order not found", Fail, 404));

  const productIds = [...new Set(order.orderItems.map((line) => String(line.product)).filter(Boolean))];
  const products = await Product.find({ _id: { $in: productIds } }).select(REORDER_PRODUCT_FIELDS).lean();
  const plan = buildReorderPlan(order, new Map(products.map((product) => [String(product._id), product])));

  return res.status(200).json({
    status: Success,
    data: {
      items: plan.items.map(({ product, ...line }) => ({ ...line, product: toCartProduct(product, req.locale) })),
      unavailable: plan.unavailable,
    },
  });
});

export { getReorderItems, createOrder, getOrders, updateOrderStatus, deleteOrder, getOrderById, getOrderInvoice };
