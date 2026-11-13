import mongoose from "mongoose";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import productSchema from "../models/productSchema.js";
import Review from "../models/reviewSchema.js";
import { Success, Fail } from "../utils/httpText.js";
import { cloudinary, getCloudinaryPublicId } from "../middlewares/multer.js";
import { getPagination } from "../utils/pagination.js";
import { localizeDocument } from "../utils/i18n.js";
import {
  buildKeywordFilter,
  buildExactMultiFieldFilter,
  buildProductSearchFields,
  buildProductFilterFields,
  buildProductPriceFields,
  parseFilterValues,
} from "../services/productSearchService.js";

import { buildVariantIndexFields, colorFamily, normalizeSizeValue, getColorAliases, getSizeAliases } from "../services/variantIndexService.js";
import { notifyPriceDrops } from "../services/priceAlertService.js";
import ProductEngagement from "../models/productEngagementSchema.js";
import parseStringList from "../utils/parseStringList.js";

const parseBoolean = (value, fieldName) => {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  throw appError.create(`${fieldName} must be true or false`, Fail, 400);
};

const parseList = (value, fieldName) => parseStringList(value, fieldName);

const readText = (value, fieldName, maxLength) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw appError.create(`Invalid ${fieldName} value`, Fail, 400);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw appError.create(`Invalid ${fieldName} value`, Fail, 400);
  return normalized;
};

const parseNumber = (value, fieldName, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) => {
  if (typeof value !== "string" && typeof value !== "number") {
    throw appError.create(`Invalid ${fieldName} value`, Fail, 400);
  }
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (normalizedValue === "") throw appError.create(`Invalid ${fieldName} value`, Fail, 400);
  const number = Number(normalizedValue);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw appError.create(`Invalid ${fieldName} value`, Fail, 400);
  }
  return number;
};

const localize = (product, locale) => {
  const output = localizeDocument(product?.toObject ? product.toObject() : product, locale);
  if (output && typeof output === "object") {
    delete output.priceValue;
    delete output.salePriceValue;
    delete output.searchIndexVersion;
    delete output.searchText;
    delete output.searchPrefixes;
    delete output.searchNgrams;
    delete output.searchCharacters;
    delete output.genderValues;
    delete output.sectionValues;
    delete output.styleValues;
    delete output.categoryValues;
  }
  return output;
};

const getAllProducts = Wrapper(async (req, res, next) => {
  const conditions = [];
  if (req.query.keyword !== undefined && typeof req.query.keyword !== "string") {
    return next(appError.create("Invalid keyword value", Fail, 400));
  }
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";
  if (keyword.length > 120) return next(appError.create("Invalid keyword value", Fail, 400));
  if (keyword) {
    try {
      const keywordFilter = buildKeywordFilter(keyword);
      if (keywordFilter) {
        // Admin catalog rows expose the product ID as their SKU. Allow a full ID
        // or a safe hexadecimal fragment (for example the six-character suffix).
        const idFragment = keyword.replace(/^#/, "");
        if (/^[a-fA-F0-9]{4,24}$/.test(idFragment)) {
          const idCondition = idFragment.length === 24
            ? { _id: new mongoose.Types.ObjectId(idFragment) }
            : { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex: idFragment, options: "i" } } };
          conditions.push({ $or: [keywordFilter, idCondition] });
        } else {
          conditions.push(keywordFilter);
        }
      }
    } catch {
      return next(appError.create("Invalid keyword value", Fail, 400));
    }
  }

  const exactFilters = [
    { query: "gender", fields: ["gender", "genderAr", "genderEn"] },
    { query: "section", fields: ["section", "sectionAr", "sectionEn"] },
    { query: "style", fields: ["style", "styleAr", "styleEn"] },
    { query: "category", fields: ["category", "categoryAr", "categoryEn"] },
  ];

  for (const { query, fields } of exactFilters) {
    let values;
    try {
      values = parseFilterValues(req.query[query], query);
    } catch {
      return next(appError.create(`Invalid ${query} filter`, Fail, 400));
    }
    const condition = buildExactMultiFieldFilter(query, fields, values);
    if (condition) conditions.push(condition);
  }

  // Variant options are stored as arrays on Product. Apply these filters in MongoDB
  // as well so page totals and pagination remain correct for color/size selections.
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const query of ["color", "size"]) {
    let values;
    try {
      values = parseFilterValues(req.query[query], query);
    } catch {
      return next(appError.create(`Invalid ${query} filter`, Fail, 400));
    }
    if (!values.length) continue;

    if (query === "color") {
      const families = values.map(colorFamily).filter(Boolean);
      const legacyAliases = families.flatMap(getColorAliases);
      if (families.length) {
        conditions.push({
          $or: [
            { colorFamilyValues: { $in: families } },
            {
              colorFamilyValues: { $exists: false },
              colors: { $in: legacyAliases.map((value) => new RegExp(`^${escapeRegex(value)}$`, "i")) },
            },
          ],
        });
      }
    } else {
      const normalizedSizes = values.map(normalizeSizeValue).filter(Boolean);
      const legacyAliases = normalizedSizes.flatMap(getSizeAliases);
      conditions.push({
        $or: [
          { sizeValues: { $in: normalizedSizes } },
          {
            sizeValues: { $exists: false },
            size: { $in: legacyAliases.map((value) => new RegExp(`^${escapeRegex(value)}$`, "i")) },
          },
        ],
      });
    }
  }

  const priceBounds = {};
  if (req.query.minPrice !== undefined && req.query.minPrice !== "") {
    priceBounds.$gte = parseNumber(req.query.minPrice, "minPrice", { min: 0, max: 100000000 });
  }
  if (req.query.maxPrice !== undefined && req.query.maxPrice !== "") {
    priceBounds.$lte = parseNumber(req.query.maxPrice, "maxPrice", { min: 0, max: 100000000 });
  }
  if (priceBounds.$gte !== undefined && priceBounds.$lte !== undefined && priceBounds.$gte > priceBounds.$lte) {
    return next(appError.create("minPrice cannot be greater than maxPrice", Fail, 400));
  }

  if (Object.keys(priceBounds).length) {
    const legacyPriceExpression = { $convert: { input: "$price", to: "double", onError: null, onNull: null } };
    const legacyDiscountExpression = { $convert: { input: "$discount", to: "double", onError: 0, onNull: 0 } };
    const safeLegacyDiscount = { $min: [100, { $max: [0, legacyDiscountExpression] }] };
    const legacyEffectivePrice = {
      $cond: [
        "$isSale",
        { $round: [{ $multiply: [legacyPriceExpression, { $subtract: [1, { $divide: [safeLegacyDiscount, 100] }] }] }, 2] },
        { $round: [legacyPriceExpression, 2] },
      ],
    };
    const legacyBounds = [];
    if (priceBounds.$gte !== undefined) legacyBounds.push({ $gte: [legacyEffectivePrice, priceBounds.$gte] });
    if (priceBounds.$lte !== undefined) legacyBounds.push({ $lte: [legacyEffectivePrice, priceBounds.$lte] });
    conditions.push({
      $or: [
        { salePriceValue: priceBounds },
        { salePriceValue: { $exists: false }, $expr: { $and: legacyBounds } },
      ],
    });
  }

  if (req.query.isSale !== undefined) {
    conditions.push({ isSale: parseBoolean(req.query.isSale, "isSale") });
  }
  if (req.query.inStock !== undefined) {
    if (["true", "1"].includes(req.query.inStock)) {
      conditions.push({ countInStock: { $gt: 0 } });
    } else if (["false", "0"].includes(req.query.inStock)) {
      conditions.push({ countInStock: 0 });
    } else {
      return next(appError.create("inStock must be true or false", Fail, 400));
    }
  }

  if (req.query.stockStatus !== undefined && req.query.stockStatus !== "all") {
    const stockStatus = req.query.stockStatus;
    if (!["healthy", "low", "out", "critical"].includes(stockStatus)) {
      return next(appError.create("Invalid stock status filter", Fail, 400));
    }
    if (stockStatus === "healthy") conditions.push({ countInStock: { $gt: 5 } });
    if (stockStatus === "low") conditions.push({ countInStock: { $gt: 0, $lte: 5 } });
    if (stockStatus === "out") conditions.push({ countInStock: 0 });
    if (stockStatus === "critical") conditions.push({ countInStock: { $lte: 5 } });
  }

  const filter = conditions.length ? { $and: conditions } : {};
  const { page, limit, skip } = getPagination(req.query, { maxLimit: 60 });

  const sortOptions = {
    newest: { createdAt: -1, _id: -1 },
    latest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    price_asc: { salePriceValue: 1, _id: 1 },
    "price-asc": { salePriceValue: 1, _id: 1 },
    "price-low-to-high": { salePriceValue: 1, _id: 1 },
    "price-low-high": { salePriceValue: 1, _id: 1 },
    price_low_to_high: { salePriceValue: 1, _id: 1 },
    price: { salePriceValue: 1, _id: 1 },
    price_desc: { salePriceValue: -1, _id: -1 },
    "price-desc": { salePriceValue: -1, _id: -1 },
    "price-high-to-low": { salePriceValue: -1, _id: -1 },
    "price-high-low": { salePriceValue: -1, _id: -1 },
    price_high_to_low: { salePriceValue: -1, _id: -1 },
    "-price": { salePriceValue: -1, _id: -1 },
    rating: { ratingsAverage: -1, ratingsQuantity: -1, _id: -1 },
    popular: { ratingsQuantity: -1, ratingsAverage: -1, _id: -1 },
    name_asc: { nameEn: 1, _id: 1 },
    name_desc: { nameEn: -1, _id: -1 },
    "stock-asc": { countInStock: 1, createdAt: -1, _id: -1 },
    stock_asc: { countInStock: 1, createdAt: -1, _id: -1 },
  };
  if (req.query.sort !== undefined && typeof req.query.sort !== "string") {
    return next(appError.create("Invalid sort value", Fail, 400));
  }
  const sortKey = typeof req.query.sort === "string" && req.query.sort.trim()
    ? req.query.sort.trim().toLowerCase()
    : "newest";
  if (!Object.hasOwn(sortOptions, sortKey)) return next(appError.create("Invalid sort value", Fail, 400));

  const includeStats = req.query.includeStats === "true" || req.query.includeStats === "1";
  const query = productSchema
    .find(filter)
    .select("-priceValue -salePriceValue -searchIndexVersion -searchText -searchPrefixes -searchNgrams -searchCharacters")
    .sort(sortOptions[sortKey])
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  const statsQuery = includeStats
    ? productSchema.aggregate([{
        $group: {
          _id: null,
          onSaleCount: { $sum: { $cond: ["$isSale", 1, 0] } },
          lowStockCount: { $sum: { $cond: [{ $lte: ["$countInStock", 5] }, 1, 0] } },
          outOfStockCount: { $sum: { $cond: [{ $eq: ["$countInStock", 0] }, 1, 0] } },
        },
      }])
    : Promise.resolve(null);

  const [totalProducts, products, stats] = await Promise.all([
    productSchema.countDocuments(filter),
    query,
    statsQuery,
  ]);

  const pagination = {
    total: totalProducts,
    page,
    limit,
    totalPages: Math.ceil(totalProducts / limit),
    hasNextPage: page * limit < totalProducts,
    hasPreviousPage: page > 1,
  };

  return res.status(200).json({
    status: Success,
    results: products.length,
    pagination,
    data: { Products: products.map((product) => localize(product, req.locale)) },
    ...(includeStats ? { stats: stats?.[0] || { onSaleCount: 0, lowStockCount: 0, outOfStockCount: 0 } } : {}),
  });
});

const getProduct = Wrapper(async (req, res, next) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  const product = await productSchema
    .findById(productId)
    .populate({
      path: "reviews",
      select: "rating comment createdAt user",
      options: { sort: { createdAt: -1 }, limit: 20 },
      populate: { path: "user", select: "fullName avatar" },
    })
    .lean({ virtuals: true });

  if (!product) return next(appError.create("This product was not found", Fail, 404));
  res.status(200).json({ status: Success, data: { product: localize(product, req.locale) } });
});

const addProduct = Wrapper(async (req, res, next) => {
  const {
    name, nameAr, nameEn, description, descriptionAr, descriptionEn,
    price, category, categoryAr, categoryEn, section, sectionAr, sectionEn,
    discount = 0, isSale = false,
    colors, size, gender, genderAr, genderEn, style, styleAr, styleEn, countInStock = 0,
  } = req.body;

  const images = (req.files || []).map((file) => file.path).filter(Boolean);
  const normalizedName = readText(name, "name", 180);
  const normalizedNameAr = readText(nameAr, "nameAr", 180);
  const normalizedNameEn = readText(nameEn, "nameEn", 180);
  const normalizedDescription = readText(description, "description", 10000);
  const normalizedDescriptionAr = readText(descriptionAr, "descriptionAr", 10000);
  const normalizedDescriptionEn = readText(descriptionEn, "descriptionEn", 10000);
  const normalizedCategory = readText(category, "category", 100);
  const normalizedCategoryAr = readText(categoryAr, "categoryAr", 100);
  const normalizedCategoryEn = readText(categoryEn, "categoryEn", 100);
  const normalizedSection = readText(section, "section", 100);
  const normalizedSectionAr = readText(sectionAr, "sectionAr", 100);
  const normalizedSectionEn = readText(sectionEn, "sectionEn", 100);
  const normalizedGender = readText(gender, "gender", 50);
  const normalizedGenderAr = readText(genderAr, "genderAr", 50);
  const normalizedGenderEn = readText(genderEn, "genderEn", 50);
  const normalizedStyle = readText(style, "style", 100);
  const normalizedStyleAr = readText(styleAr, "styleAr", 100);
  const normalizedStyleEn = readText(styleEn, "styleEn", 100);

  const finalName = normalizedNameEn || normalizedName || normalizedNameAr;
  const finalNameEn = normalizedNameEn || normalizedName;
  const finalNameAr = normalizedNameAr;
  const finalDescription = normalizedDescriptionEn || normalizedDescription || normalizedDescriptionAr;
  const finalDescriptionEn = normalizedDescriptionEn || normalizedDescription;
  const finalDescriptionAr = normalizedDescriptionAr;

  const finalCategory = normalizedCategoryEn || normalizedCategory || normalizedCategoryAr;
  const finalSection = normalizedSectionEn || normalizedSection || normalizedSectionAr;
  if (!finalName || !finalDescription || !finalCategory || !finalSection || price === undefined) {
    return next(appError.create("All fields are required", Fail, 400));
  }
  if (images.length === 0) return next(appError.create("Product photo is required", Fail, 400));
  if (images.length > 4) return next(appError.create("Invalid request payload", Fail, 400));

  const numericPrice = parseNumber(price, "price", { min: 0, max: 100000000 });
  const numericDiscount = parseNumber(discount, "discount", { min: 0, max: 100 });
  const stock = parseNumber(countInStock, "countInStock", { min: 0, max: 1000000, integer: true });
  const parsedColors = parseList(colors, "colors");
  const parsedSizes = parseList(size, "size");

  const newProduct = await productSchema.create({
    name: finalName,
    ...(finalNameEn ? { nameEn: finalNameEn } : {}),
    ...(finalNameAr ? { nameAr: finalNameAr } : {}),
    description: finalDescription,
    ...(finalDescriptionEn ? { descriptionEn: finalDescriptionEn } : {}),
    ...(finalDescriptionAr ? { descriptionAr: finalDescriptionAr } : {}),
    price: String(numericPrice),
    discount: String(numericDiscount),
    isSale: parseBoolean(isSale, "isSale"),
    category: finalCategory,
    ...((normalizedCategoryEn || normalizedCategory) ? { categoryEn: normalizedCategoryEn || normalizedCategory } : {}),
    ...(normalizedCategoryAr ? { categoryAr: normalizedCategoryAr } : {}),
    section: finalSection,
    ...((normalizedSectionEn || normalizedSection) ? { sectionEn: normalizedSectionEn || normalizedSection } : {}),
    ...(normalizedSectionAr ? { sectionAr: normalizedSectionAr } : {}),
    gender: normalizedGenderEn || normalizedGender || undefined,
    ...((normalizedGenderEn || normalizedGender) ? { genderEn: normalizedGenderEn || normalizedGender } : {}),
    ...(normalizedGenderAr ? { genderAr: normalizedGenderAr } : {}),
    style: normalizedStyleEn || normalizedStyle || normalizedStyleAr || undefined,
    ...((normalizedStyleEn || normalizedStyle) ? { styleEn: normalizedStyleEn || normalizedStyle } : {}),
    ...(normalizedStyleAr ? { styleAr: normalizedStyleAr } : {}),
    countInStock: stock,
    colors: parsedColors,
    size: parsedSizes,
    photo: images[0],
    images,
  });

  res.status(201).json({ status: Success, data: { Product: localize(newProduct, req.locale) } });
});

const updateProduct = Wrapper(async (req, res, next) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  const allowedFields = [
    "name", "nameAr", "nameEn", "description", "descriptionAr", "descriptionEn",
    "category", "categoryAr", "categoryEn", "section", "sectionAr", "sectionEn",
    "gender", "genderAr", "genderEn", "style", "styleAr", "styleEn",
  ];
  const updateData = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (typeof req.body[field] !== "string" || req.body[field].trim().length === 0) {
        return next(appError.create(`Invalid ${field} value`, Fail, 400));
      }
      updateData[field] = req.body[field].trim();
    }
  }

  if (req.body.price !== undefined) updateData.price = String(parseNumber(req.body.price, "price", { min: 0, max: 100000000 }));
  if (req.body.discount !== undefined) updateData.discount = String(parseNumber(req.body.discount, "discount", { min: 0, max: 100 }));
  if (req.body.countInStock !== undefined) updateData.countInStock = parseNumber(req.body.countInStock, "countInStock", { min: 0, max: 1000000, integer: true });
  if (req.body.isSale !== undefined) updateData.isSale = parseBoolean(req.body.isSale, "isSale");
  if (req.body.colors !== undefined) updateData.colors = parseList(req.body.colors, "colors");
  if (req.body.size !== undefined) updateData.size = parseList(req.body.size, "size");

  if (updateData.nameEn && !updateData.name) updateData.name = updateData.nameEn;
  if (updateData.categoryEn && !updateData.category) updateData.category = updateData.categoryEn;
  if (updateData.category && !updateData.categoryEn) updateData.categoryEn = updateData.category;
  if (updateData.sectionEn && !updateData.section) updateData.section = updateData.sectionEn;
  if (updateData.section && !updateData.sectionEn) updateData.sectionEn = updateData.section;
  if (updateData.styleEn && !updateData.style) updateData.style = updateData.styleEn;
  if (updateData.style && !updateData.styleEn) updateData.styleEn = updateData.style;
  if (updateData.genderEn && !updateData.gender) updateData.gender = updateData.genderEn;
  if (updateData.gender && !updateData.genderEn) updateData.genderEn = updateData.gender;
  if (updateData.name && !updateData.nameEn) updateData.nameEn = updateData.name;
  if (updateData.descriptionEn && !updateData.description) updateData.description = updateData.descriptionEn;
  if (updateData.description && !updateData.descriptionEn) updateData.descriptionEn = updateData.description;

  const existingProduct = await productSchema.findById(productId)
    .select("countInStock images photo name nameAr nameEn description descriptionAr descriptionEn category categoryAr categoryEn section sectionAr sectionEn style styleAr styleEn gender genderAr genderEn price discount isSale")
    .lean();
  if (!existingProduct) return next(appError.create("This product was not found", Fail, 404));

  const previousImages = [...new Set([
    ...(Array.isArray(existingProduct.images) ? existingProduct.images : []),
    ...(existingProduct.photo ? [existingProduct.photo] : []),
  ])];
  let preservedImages = [];
  if (req.body.existingImages !== undefined) {
    // Cloudinary URLs can exceed the 100-character limit used by variant lists.
    // Keep the image list tightly bounded and only accept URLs already attached
    // to this product; never let a client nominate an arbitrary Cloudinary asset.
    preservedImages = parseStringList(req.body.existingImages, "existingImages", {
      maxItems: 4,
      maxItemLength: 2048,
    });

    if (preservedImages.some((image) => !previousImages.includes(image))) {
      return next(appError.create("Invalid existing image selection", Fail, 400));
    }
  }
  const newUploadedImages = (req.files || []).map((file) => file.path).filter(Boolean);
  if (req.body.existingImages !== undefined || newUploadedImages.length > 0) {
    const finalImages = [...new Set([...preservedImages, ...newUploadedImages])];
    if (finalImages.length > 4) return next(appError.create("Invalid request payload", Fail, 400));
    updateData.images = finalImages;
    updateData.photo = finalImages[0] || "";
  }

  if (Object.keys(updateData).length === 0) {
    return next(appError.create("Invalid request payload", Fail, 400));
  }

  const mergedProduct = { ...existingProduct, ...updateData };
  Object.assign(
    updateData,
    buildProductSearchFields(mergedProduct),
    buildProductFilterFields(mergedProduct),
    buildVariantIndexFields(mergedProduct),
    buildProductPriceFields(mergedProduct),
  );

  // The admin form sends an absolute stock number. Writing it blindly would erase
  // orders placed after the form was loaded (overselling), so apply only the
  // difference with $inc and keep every concurrent sale.
  const { countInStock: requestedStock, ...fieldsToSet } = updateData;
  const stockDelta =
    requestedStock === undefined ? 0 : requestedStock - (Number(existingProduct.countInStock) || 0);
  const updateFilter = { _id: productId, ...(stockDelta < 0 ? { countInStock: { $gte: -stockDelta } } : {}) };

  const updatedProduct = await productSchema.findOneAndUpdate(
    updateFilter,
    { $set: fieldsToSet, ...(stockDelta ? { $inc: { countInStock: stockDelta } } : {}) },
    { new: true, runValidators: true, context: "query" },
  );
  if (!updatedProduct) {
    const stillExists = await productSchema.exists({ _id: productId });
    if (!stillExists) return next(appError.create("This product was not found", Fail, 404));
    return next(appError.create("Stock changed while you were editing. Reload and try again.", Fail, 409));
  }

  const retainedImages = new Set([
    ...(Array.isArray(updatedProduct.images) ? updatedProduct.images : []),
    ...(updatedProduct.photo ? [updatedProduct.photo] : []),
  ]);
  const removedPublicIds = [...new Set(
    previousImages
      .filter((image) => !retainedImages.has(image))
      .map(getCloudinaryPublicId)
      .filter(Boolean),
  )];
  if (removedPublicIds.length) {
    await Promise.allSettled(removedPublicIds.map((publicId) => cloudinary.uploader.destroy(publicId)));
  }

  await notifyPriceDrops(updatedProduct.toObject()).catch((error) => console.error("Price alert delivery failed:", error.message));
  res.status(200).json({ status: Success, data: { Product: localize(updatedProduct, req.locale) } });
});

const deleteProduct = Wrapper(async (req, res, next) => {
  const { productId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return next(appError.create("Invalid product ID", Fail, 400));
  }

  const deletedProduct = await productSchema.findByIdAndDelete(productId);
  if (!deletedProduct) return next(appError.create("This product was not found", Fail, 404));

  const allImages = [
    ...(Array.isArray(deletedProduct.images) ? deletedProduct.images : []),
    ...(deletedProduct.photo ? [deletedProduct.photo] : []),
  ];
  const publicIds = [...new Set(allImages.map(getCloudinaryPublicId).filter(Boolean))];

  const [, , imageResults] = await Promise.all([
    Review.deleteMany({ product: productId }),
    ProductEngagement.deleteMany({ product: productId }),
    Promise.allSettled(publicIds.map((publicId) => cloudinary.uploader.destroy(publicId))),
  ]);
  const failedImageDeletes = imageResults.filter((result) => result.status === "rejected").length;

  res.status(200).json({
    status: Success,
    message: failedImageDeletes
      ? "Product deleted; some remote images could not be removed"
      : "Product, its media assets, and associated reviews deleted successfully",
    data: null,
  });
});

export { getAllProducts, getProduct, updateProduct, deleteProduct, addProduct };
