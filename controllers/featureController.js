import mongoose from "mongoose";
import ProductEngagement from "../models/productEngagementSchema.js";
import Product from "../models/productSchema.js";
import Order from "../models/orderSchema.js";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import { Fail, Success } from "../utils/httpText.js";
import { getEffectivePrice, notifyPriceDrops } from "../services/priceAlertService.js";

const MAX_SAVED = 500;
const MAX_PRICE_ALERTS = 100;
const MAX_RECENT = 30;
const ENGAGEMENT_TYPES = ["saved", "recent", "price-alert"];

const PRODUCT_FIELDS =
  "name nameAr nameEn description descriptionAr descriptionEn price discount isSale photo images " +
  "category categoryAr categoryEn section size colors countInStock ratingsAverage ratingsQuantity";

const currentUserId = (req) => req.currentUser?.id || req.currentUser?._id;
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const requireValidProductId = (req) => {
  if (!isValidId(req.params.productId)) {
    throw appError.create("Invalid product ID", Fail, 400);
  }
  return req.params.productId;
};

// A user can only grow these lists up to a cap, so one account cannot bloat the collection.
const assertUnderCap = async (filter, cap, label) => {
  if (await ProductEngagement.exists(filter)) return;
  const count = await ProductEngagement.countDocuments({ user: filter.user, type: filter.type });
  if (count >= cap) throw appError.create(`You can keep at most ${cap} ${label}`, Fail, 409);
};

const upsertEngagement = (filter, set = {}) =>
  ProductEngagement.findOneAndUpdate(
    filter,
    { ...(Object.keys(set).length ? { $set: set } : {}), $setOnInsert: filter },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

const getEngagements = Wrapper(async (req, res) => {
  const { type } = req.query;
  if (type !== undefined && !ENGAGEMENT_TYPES.includes(type)) {
    throw appError.create("Invalid feature type", Fail, 400);
  }

  const isRecent = type === "recent";
  const records = await ProductEngagement.find({ user: currentUserId(req), ...(type ? { type } : {}) })
    .populate("product", PRODUCT_FIELDS)
    .sort(isRecent ? { lastViewedAt: -1 } : { updatedAt: -1 })
    .limit(isRecent ? MAX_RECENT : 100)
    .lean();

  const items = records.filter((record) => record.product);
  return res.status(200).json({ status: Success, results: items.length, data: { items } });
});

const saveProduct = Wrapper(async (req, res) => {
  const productId = requireValidProductId(req);
  if (!(await Product.exists({ _id: productId }))) throw appError.create("Product not found", Fail, 404);

  const filter = { user: currentUserId(req), product: productId, type: "saved" };
  await assertUnderCap(filter, MAX_SAVED, "saved products");
  const item = await upsertEngagement(filter);
  return res.status(200).json({ status: Success, data: { item } });
});

const removeSavedProduct = Wrapper(async (req, res) => {
  const productId = requireValidProductId(req);
  await ProductEngagement.deleteOne({ user: currentUserId(req), product: productId, type: "saved" });
  return res.status(200).json({ status: Success, message: "Saved item removed" });
});

const recordProductView = Wrapper(async (req, res) => {
  const productId = requireValidProductId(req);
  if (!(await Product.exists({ _id: productId }))) throw appError.create("Product not found", Fail, 404);

  const userId = currentUserId(req);
  await upsertEngagement({ user: userId, product: productId, type: "recent" }, { lastViewedAt: new Date() });

  // Trim only when the history actually overflowed, instead of querying on every view.
  const total = await ProductEngagement.countDocuments({ user: userId, type: "recent" });
  if (total > MAX_RECENT) {
    const overflow = await ProductEngagement.find({ user: userId, type: "recent" })
      .sort({ lastViewedAt: -1 })
      .skip(MAX_RECENT)
      .select("_id")
      .lean();
    if (overflow.length) {
      await ProductEngagement.deleteMany({ _id: { $in: overflow.map((item) => item._id) } });
    }
  }
  return res.status(204).end();
});

const createPriceAlert = Wrapper(async (req, res) => {
  const productId = requireValidProductId(req);
  const targetPrice = Number(req.body?.targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0 || targetPrice > 100000000) {
    throw appError.create("A valid target price is required", Fail, 400);
  }

  const product = await Product.findById(productId).select(PRODUCT_FIELDS).lean();
  if (!product) throw appError.create("Product not found", Fail, 404);

  const filter = { user: currentUserId(req), product: productId, type: "price-alert" };
  await assertUnderCap(filter, MAX_PRICE_ALERTS, "price alerts");
  const item = await upsertEngagement(filter, { targetPrice, triggeredAt: null });

  await notifyPriceDrops(product).catch((error) =>
    console.error("Price alert notification failed:", error.message),
  );
  return res.status(200).json({ status: Success, data: { item, currentPrice: getEffectivePrice(product) } });
});

const removePriceAlert = Wrapper(async (req, res) => {
  const productId = requireValidProductId(req);
  await ProductEngagement.deleteOne({ user: currentUserId(req), product: productId, type: "price-alert" });
  return res.status(200).json({ status: Success, message: "Price alert removed" });
});

const IN_STOCK = { countInStock: { $gt: 0 } };

const getRecommendations = Wrapper(async (req, res) => {
  const userId = currentUserId(req);
  const [interests, orders] = userId
    ? await Promise.all([
        ProductEngagement.find({ user: userId, type: { $in: ["recent", "saved"] } })
          .sort({ updatedAt: -1 })
          .limit(20)
          .populate("product", "category section")
          .lean(),
        Order.find({ user: userId, status: { $ne: "Cancelled" } })
          .select("orderItems.product")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ])
    : [[], []];

  const categories = new Set();
  const seenProducts = new Set();
  for (const row of interests) {
    if (!row.product) continue;
    seenProducts.add(String(row.product._id));
    if (row.product.category) categories.add(row.product.category);
  }
  for (const order of orders) {
    for (const line of order.orderItems || []) {
      if (line.product) seenProducts.add(String(line.product));
    }
  }

  const exclude = [...seenProducts];
  const query = {
    ...IN_STOCK,
    _id: { $nin: exclude },
    ...(categories.size ? { category: { $in: [...categories] } } : {}),
  };
  let products = await Product.find(query)
    .select(PRODUCT_FIELDS)
    .sort({ ratingsAverage: -1, ratingsQuantity: -1, createdAt: -1 })
    .limit(12)
    .lean();

  if (products.length < 6) {
    const fill = await Product.find({ ...IN_STOCK, _id: { $nin: [...exclude, ...products.map((p) => p._id)] } })
      .select(PRODUCT_FIELDS)
      .sort({ createdAt: -1 })
      .limit(12 - products.length)
      .lean();
    products = [...products, ...fill];
  }

  return res.status(200).json({
    status: Success,
    results: products.length,
    data: { products, strategy: categories.size ? "interest-and-popularity" : "popular-and-new" },
  });
});

const getAdminFeatureInsights = Wrapper(async (req, res) => {
  // Role is enforced by allowedRoles(ADMIN, MANAGER) on the route.
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [savedProducts, activePriceAlerts, recentlyViewed, popularSaved] = await Promise.all([
    ProductEngagement.countDocuments({ type: "saved" }),
    ProductEngagement.countDocuments({ type: "price-alert", triggeredAt: null }),
    ProductEngagement.countDocuments({ type: "recent", updatedAt: { $gte: weekAgo } }),
    ProductEngagement.aggregate([
      { $match: { type: "saved" } },
      { $group: { _id: "$product", saves: { $sum: 1 } } },
      { $sort: { saves: -1 } },
      { $limit: 5 },
      { $lookup: { from: Product.collection.name, localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { _id: 1, saves: 1, name: "$product.name", photo: "$product.photo" } },
    ]),
  ]);

  return res.status(200).json({
    status: Success,
    data: { savedProducts, activePriceAlerts, recentlyViewed, popularSaved },
  });
});

export {
  getEngagements,
  saveProduct,
  removeSavedProduct,
  recordProductView,
  createPriceAlert,
  removePriceAlert,
  getRecommendations,
  getAdminFeatureInsights,
};
