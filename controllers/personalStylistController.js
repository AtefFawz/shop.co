import Product from "../models/productSchema.js";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import { Fail, Success } from "../utils/httpText.js";
import { toCartProduct } from "../services/productDtoService.js";
import { buildPersonalizedLook, STYLIST_OPTIONS } from "../services/personalStylistService.js";

const cleanChoice = (value, allowed, field, optional = false) => {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string") throw appError.create(`Invalid ${field} value`, Fail, 400);
  const normalized = value.trim().toLowerCase();
  if (!allowed.includes(normalized.toUpperCase()) && !allowed.includes(normalized)) {
    throw appError.create(`Invalid ${field} value`, Fail, 400);
  }
  return allowed.find((item) => item.toLowerCase() === normalized) || allowed.find((item) => item === normalized.toUpperCase());
};

const CATALOGUE_TTL_MS = 60 * 1000;
const CATALOGUE_FIELDS =
  "name nameAr nameEn description descriptionAr descriptionEn price discount isSale category categoryAr categoryEn section sectionAr sectionEn style styleAr styleEn gender genderAr genderEn colors size countInStock ratingsAverage ratingsQuantity photo images";

// The endpoint is public, so cap its database cost: all requests on one instance share
// one catalogue snapshot for a minute instead of each reading 500 products. Stock can be
// up to a minute stale here; checkout re-validates stock and price atomically anyway.
let catalogueCache = { rows: null, loadedAt: 0 };
let catalogueInflight = null;
const loadCatalogue = () => {
  if (catalogueCache.rows && Date.now() - catalogueCache.loadedAt < CATALOGUE_TTL_MS) {
    return Promise.resolve(catalogueCache.rows);
  }
  catalogueInflight ||= Product.find({ countInStock: { $gt: 0 } })
    .select(CATALOGUE_FIELDS)
    .sort({ ratingsAverage: -1, ratingsQuantity: -1, createdAt: -1, _id: 1 })
    .limit(500)
    .lean()
    .then((rows) => {
      catalogueCache = { rows, loadedAt: Date.now() };
      return rows;
    })
    .finally(() => {
      catalogueInflight = null;
    });
  return catalogueInflight;
};

export const getPersonalStylistLook = Wrapper(async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const budget = Number(body.budget);
  if (!Number.isFinite(budget) || budget < 100 || budget > 10000000) {
    throw appError.create("Invalid budget value", Fail, 400);
  }

  const preferences = {
    gender: cleanChoice(body.gender, STYLIST_OPTIONS.genders, "gender"),
    style: cleanChoice(body.style, STYLIST_OPTIONS.styles, "style"),
    occasion: cleanChoice(body.occasion, STYLIST_OPTIONS.occasions, "occasion"),
    color: cleanChoice(body.color, STYLIST_OPTIONS.colors, "color", true),
    budget: Math.round(budget * 100) / 100,
  };

  // The query never incorporates customer-provided strings. It returns a capped
  // set of public, in-stock catalogue records for deterministic scoring.
  const catalogue = await loadCatalogue();

  const look = buildPersonalizedLook(catalogue, preferences);
  const items = look.items.map((entry) => ({
    slot: entry.slot,
    effectivePrice: entry.effectivePrice,
    product: toCartProduct(entry.product, req.locale),
  }));

  res.status(200).json({
    status: Success,
    data: {
      items,
      total: look.total,
      remaining: look.remaining,
      budget: preferences.budget,
      isComplete: look.isComplete,
      missingSlots: look.missingSlots,
      strategy: "catalogue-fit-v1",
    },
  });
});
