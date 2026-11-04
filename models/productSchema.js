import mongoose from "mongoose";
import {
  buildProductSearchFields,
  buildProductFilterFields,
  buildProductPriceFields,
} from "../services/productSearchService.js";
import { buildVariantIndexFields } from "../services/variantIndexService.js";

const productSchema = new mongoose.Schema(
  {
    // Keep the established model name and public price field for API compatibility.
    name: { type: String, required: true, trim: true, maxlength: 180 },
    nameAr: { type: String, trim: true, maxlength: 180 },
    nameEn: { type: String, trim: true, maxlength: 180 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    descriptionAr: { type: String, trim: true, maxlength: 10000 },
    descriptionEn: { type: String, trim: true, maxlength: 10000 },
    discount: { type: String, default: "0" },
    price: { type: String, required: true },
    // Numeric mirror keeps range filters and sorting correct without changing legacy API output.
    priceValue: { type: Number, min: 0, select: false },
    salePriceValue: { type: Number, min: 0, select: false },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    categoryAr: { type: String, trim: true, maxlength: 100 },
    categoryEn: { type: String, trim: true, maxlength: 100 },
    isSale: { type: Boolean, default: false },
    colors: { type: [String], default: [] },
    size: { type: [String], default: [] },
    gender: { type: String, trim: true, maxlength: 50 },
    genderAr: { type: String, trim: true, maxlength: 50 },
    genderEn: { type: String, trim: true, maxlength: 50 },
    section: { type: String, required: true, trim: true, maxlength: 100 },
    sectionAr: { type: String, trim: true, maxlength: 100 },
    sectionEn: { type: String, trim: true, maxlength: 100 },
    styleAr: { type: String, trim: true, maxlength: 100 },
    styleEn: { type: String, trim: true, maxlength: 100 },
    photo: { type: String, default: "" },
    images: { type: [String], default: [] },
    style: { type: String, trim: true, maxlength: 100 },
    countInStock: {
      type: Number,
      required: [true, "Product stock quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    ratingsAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingsQuantity: { type: Number, default: 0, min: 0 },
    // Internal, precomputed search fields. They are never exposed by list responses.
    searchIndexVersion: { type: Number, select: false },
    searchText: { type: String, select: false },
    searchPrefixes: { type: [String], default: [], select: false },
    searchNgrams: { type: [String], default: [], select: false },
    searchCharacters: { type: [String], default: [], select: false },
    genderValues: { type: [String], default: [], select: false },
    sectionValues: { type: [String], default: [], select: false },
    styleValues: { type: [String], default: [], select: false },
    categoryValues: { type: [String], default: [], select: false },
    colorFamilyValues: { type: [String], default: [], select: false },
    sizeValues: { type: [String], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        delete ret.priceValue;
        delete ret.salePriceValue;
        delete ret.searchIndexVersion;
        delete ret.searchText;
        delete ret.searchPrefixes;
        delete ret.searchNgrams;
        delete ret.searchCharacters;
        delete ret.genderValues;
        delete ret.sectionValues;
        delete ret.styleValues;
        delete ret.categoryValues;
        delete ret.colorFamilyValues;
        delete ret.sizeValues;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

productSchema.virtual("reviews", {
  ref: "review",
  localField: "_id",
  foreignField: "product",
});

productSchema.pre("save", function syncSearchAndPriceFields() {
  Object.assign(
    this,
    buildProductSearchFields(this),
    buildProductFilterFields(this),
    buildVariantIndexFields(this),
    buildProductPriceFields(this),
  );
});

// Target common catalog access paths; search arrays are indexed separately for partial matching.
productSchema.index({ createdAt: -1, _id: -1 });
productSchema.index({ genderValues: 1, createdAt: -1 });
productSchema.index({ sectionValues: 1, createdAt: -1 });
productSchema.index({ styleValues: 1, createdAt: -1 });
productSchema.index({ categoryValues: 1, createdAt: -1 });
productSchema.index({ colorFamilyValues: 1, createdAt: -1 });
productSchema.index({ sizeValues: 1, createdAt: -1 });
productSchema.index({ salePriceValue: 1, _id: 1 });
productSchema.index({ ratingsAverage: -1, ratingsQuantity: -1 });
productSchema.index({ searchIndexVersion: 1, searchPrefixes: 1 });
productSchema.index({ searchIndexVersion: 1, searchNgrams: 1 });
productSchema.index({ searchIndexVersion: 1, searchCharacters: 1 });
productSchema.index({ isSale: 1, countInStock: 1 });
// Supports the bounded in-stock catalogue scan used by the Personal Stylist.
productSchema.index({ countInStock: 1, ratingsAverage: -1, ratingsQuantity: -1, createdAt: -1, _id: 1 });

export default mongoose.model("product", productSchema);
