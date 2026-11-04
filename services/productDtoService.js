import { localizeDocument } from "../utils/i18n.js";

// Public, cart-ready product shape. Whitelisted fields only: no search internals,
// no user data. Shared by the stylist and the re-order flow.
export const toCartProduct = (product, locale) => {
  const localized = localizeDocument(product, locale);
  return {
    _id: String(product._id),
    name: localized.name || product.name,
    nameAr: product.nameAr || "",
    nameEn: product.nameEn || "",
    description: localized.description || product.description || "",
    descriptionAr: product.descriptionAr || "",
    descriptionEn: product.descriptionEn || "",
    price: Number(product.price),
    discount: Number(product.discount) || 0,
    isSale: Boolean(product.isSale),
    category: localized.category || product.category,
    categoryAr: product.categoryAr || "",
    categoryEn: product.categoryEn || "",
    section: localized.section || product.section,
    sectionAr: product.sectionAr || "",
    sectionEn: product.sectionEn || "",
    style: localized.style || product.style || "",
    styleAr: product.styleAr || "",
    styleEn: product.styleEn || "",
    gender: localized.gender || product.gender || "",
    genderAr: product.genderAr || "",
    genderEn: product.genderEn || "",
    colors: Array.isArray(product.colors) ? product.colors : [],
    size: Array.isArray(product.size) ? product.size : [],
    countInStock: Number(product.countInStock) || 0,
    ratingsAverage: Number(product.ratingsAverage) || 0,
    ratingsQuantity: Number(product.ratingsQuantity) || 0,
    photo: product.photo || "",
    images: Array.isArray(product.images) ? product.images : [],
    rating: Number(product.ratingsAverage) || 0,
    count: 1,
    isChose: true,
    reviews: [],
  };
};
