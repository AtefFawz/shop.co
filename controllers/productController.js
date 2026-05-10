const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const productSchema = require("../modules/productSchema");
const { Success, Error, Fail } = require("../utils/httpText");

const getAllProducts = Meddle(async (req, res) => {
  const { keyword } = req.query;
  let filter = {};
  if (keyword) {
    filter = {
      $or: [
        { name: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { section: { $regex: keyword, $options: "i" } },
        { type: { $regex: keyword, $options: "i" } },
      ],
    };
  }

  const products = await productSchema
    .find(filter, { __v: false })
    .populate("reviews");

  res.status(200).json({
    status: "Success",
    results: products.length,
    data: { Products: products },
  });
});

const getProduct = Meddle(async (req, res, next) => {
  const productFound = await productSchema
    .findById(req.params.productId)
    .populate({
      path: "reviews",
      populate: {
        path: "user",
        select: "fullName avatar",
      },
    });

  if (!productFound) {
    return next(appError.create("This product was not found", "Fail", 404));
  }

  res.status(200).json({
    status: "Success",
    data: { product: productFound },
  });
});

const addProduct = Meddle(async (req, res) => {
  const add = await productSchema.create(req.body);
  add.photo = req.file.path;
  await add.save();
  res.status(201).json({ status: Success, data: { Product: add } });
});

const updateProduct = Meddle(async (req, res, next) => {
  const productId = req.params.productId;
  const updateData = { ...req.body };

  if (req.file) {
    updateData.photo = req.file.path;
  }

  const update = await productSchema.findByIdAndUpdate(productId, updateData, {
    new: true,
    runValidators: true,
    returnDocument: "after",
  });

  if (!update) {
    const Error = appError.create("This product not found", Fail, 404);
    return next(Error);
  }

  res.status(200).json({ status: Success, data: { Product: update } });
});

const deleteProduct = Meddle(async (req, res, next) => {
  const productId = req.params.productId;
  const deleted = await productSchema.findByIdAndDelete(productId);
  if (!deleted) {
    const Error = appError.create("This product is not define", Fail, 400);
    return next(Error);
  }
  res.status(200).json({ status: Success, data: { Product: null } });
});

module.exports = {
  getAllProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  addProduct,
};
