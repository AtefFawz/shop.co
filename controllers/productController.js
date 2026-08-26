const mongoose = require("mongoose");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const productSchema = require("../modules/productSchema");
const reviewsSchema = require("../modules/reviewsSchema");
const { Success, Error, Fail } = require("../utils/httpText");

const getAllProducts = Meddle(async (req, res) => {
  const { keyword } = req.query;
  let filter = {};
  if (keyword) {
    filter = { $text: { $search: keyword } };
  }
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const totalProducts = await productSchema.countDocuments(filter);
  const products = await productSchema
    .find(filter, { __v: false })
    .populate("reviews")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });
    
  res.status(200).json({
    status: Success,
    results: products.length,
    pagination: {
      total: totalProducts,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalProducts / limit),
    },
    data: { Products: products },
  });
});

const getProduct = Meddle(async (req, res, next) => {
  const productId = req.params.productId;
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  const productFound = await productSchema
    .findById(productId)
    .populate({
      path: "reviews",
      populate: {
        path: "user",
        select: "fullName avatar",
      },
    })
    .lean({ virtuals: true });

  if (!productFound) {
    return next(appError.create("This product was not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    data: { product: productFound },
  });
});

const addProduct = Meddle(async (req, res, next) => {
  const {
    name,
    description,
    price,
    category,
    section,
    discount,
    isSale,
    colors,
    size,
    type,
  } = req.body;

  if (!req.file) {
    return next(appError.create("Product photo is required", Fail, 400));
  }

  const newProduct = await productSchema.create({
    name,
    description,
    price,
    category,
    section,
    discount,
    isSale,
    colors,
    size,
    type,
    photo: req.file.path,
  });

  res.status(201).json({
    status: Success,
    data: { Product: newProduct },
  });
});

const updateProduct = Meddle(async (req, res, next) => {
  const productId = req.params.productId;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  const updateData = { ...req.body };

  if (req.file) {
    updateData.photo = req.file.path;
  }

  const update = await productSchema.findByIdAndUpdate(productId, updateData, {
    new: true,
    runValidators: true,
  });

  if (!update) {
    return next(appError.create("This product was not found", Fail, 404));
  }

  res.status(200).json({ status: Success, data: { Product: update } });
});

const deleteProduct = Meddle(async (req, res, next) => {
  const productId = req.params.productId;
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  const deleted = await productSchema.findByIdAndDelete(productId);

  if (!deleted) {
    return next(appError.create("This product was not found", Fail, 404));
  }

  await reviewsSchema.deleteMany({ product: productId });

  res.status(200).json({
    status: Success,
    message: "Product and its associated reviews deleted successfully",
    data: null,
  });
});

module.exports = {
  getAllProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  addProduct,
};
