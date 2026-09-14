const mongoose = require("mongoose");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const productSchema = require("../modules/productSchema");
const reviewsSchema = require("../modules/reviewsSchema");
const { Success, Error, Fail } = require("../utils/httpText");
const { cloudinary, getCloudinaryPublicId } = require("../middlewares/multer");
const getAllProducts = Meddle(async (req, res, next) => {
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

  const onSaleCount = await productSchema.countDocuments({ isSale: true });
  const lowStockCount = await productSchema.countDocuments({
    countInStock: { $lte: 5 },
  });

  const outOfStockCount = await productSchema.countDocuments({
    countInStock: 0,
  });

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
    stats: {
      onSaleCount: onSaleCount,
      lowStockCount: lowStockCount,
      outOfStockCount: outOfStockCount,
    },
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
    gender,
    style,
    countInStock,
  } = req.body;

  const images =
    req.files && req.files.length > 0 ? req.files.map((file) => file.path) : [];
  if (!images || images.length === 0) {
    return next(appError.create("Product photo is required", Fail, 400));
  }

  const parsedColors =
    typeof colors === "string"
      ? colors.split(",").map((c) => c.trim())
      : colors;
  const parsedSizes =
    typeof size === "string" ? size.split(",").map((s) => s.trim()) : size;

  const newProduct = await productSchema.create({
    name,
    description,
    price: Number(price),
    discount: discount ? Number(discount) : 0,
    isSale: isSale === "true" || isSale === true,
    category,
    section,
    gender,
    style,
    countInStock: Number(countInStock) || 0,
    colors: parsedColors,
    size: parsedSizes,
    photo: images[0],
    images: images,
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

  let preservedImages = [];
  if (req.body.existingImages) {
    preservedImages = Array.isArray(req.body.existingImages)
      ? req.body.existingImages
      : [req.body.existingImages];
  }

  const newUploadedImages =
    req.files && req.files.length > 0 ? req.files.map((file) => file.path) : [];

  if (req.body.existingImages !== undefined || newUploadedImages.length > 0) {
    const finalImages = [...preservedImages, ...newUploadedImages];
    updateData.images = finalImages;
    updateData.photo = finalImages[0] || "";
  }

  if (updateData.price) updateData.price = Number(updateData.price);
  if (updateData.discount !== undefined)
    updateData.discount = Number(updateData.discount);
  if (updateData.countInStock !== undefined)
    updateData.countInStock = Number(updateData.countInStock);
  if (updateData.isSale !== undefined)
    updateData.isSale =
      updateData.isSale === "true" || updateData.isSale === true;

  if (typeof updateData.colors === "string") {
    updateData.colors = updateData.colors
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  if (typeof updateData.size === "string") {
    updateData.size = updateData.size
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const updatedProduct = await productSchema.findByIdAndUpdate(
    productId,
    updateData,
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updatedProduct) {
    return next(appError.create("This product was not found", Fail, 404));
  }

  res.status(200).json({ status: Success, data: { Product: updatedProduct } });
});

const deleteProduct = Meddle(async (req, res, next) => {
  const { productId } = req.params;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  // 1. delete product from database
  const deletedProduct = await productSchema.findByIdAndDelete(productId);

  if (!deletedProduct) {
    return next(appError.create("This product was not found", Fail, 404));
  }

  // 2. get images
  const allImages = [
    ...(Array.isArray(deletedProduct.images) ? deletedProduct.images : []),
    ...(deletedProduct.photo ? [deletedProduct.photo] : []),
  ];

  // get public id
  const publicIds = [...new Set(allImages)]
    .map((img) => getCloudinaryPublicId(img))
    .filter(Boolean);

  // 3. delete image
  const deleteImagesPromise = Promise.allSettled(
    publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)),
  );

  // 4.   remove reviews
  const deleteReviewsPromise = reviewsSchema.deleteMany({ product: productId });

  await Promise.all([deleteReviewsPromise, deleteImagesPromise]);

  res.status(200).json({
    status: Success,
    message:
      "Product, its media assets, and associated reviews deleted successfully",
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
