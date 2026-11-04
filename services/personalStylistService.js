import { calculateProductPricing } from "./orderPricingService.js";

const STYLE_LABELS = {
  casual: ["casual", "كاجوال", "يومي", "everyday"],
  streetwear: ["streetwear", "ستريت", "oversized", "street"],
  minimal: ["minimal", "minimalist", "بسيط", "مينيمال", "basic"],
  classic: ["classic", "كلاسيك", "كلاسيكي", "timeless"],
  formal: ["formal", "رسمي", "business", "office", "workwear"],
  sporty: ["sporty", "sportswear", "رياضي", "gym", "activewear"],
  elegant: ["elegant", "أنيق", "انيق", "chic", "party"],
};

const OCCASION_LABELS = {
  everyday: ["everyday", "daily", "يومي", "يومية", "casual"],
  work: ["work", "office", "business", "عمل", "شغل", "رسمي"],
  evening: ["evening", "dinner", "مساء", "سهرة", "night"],
  party: ["party", "event", "حفلة", "مناسبة", "احتفال"],
  sport: ["sport", "gym", "workout", "رياضة", "تمرين"],
  travel: ["travel", "trip", "سفر", "رحلة", "مريح"],
};

const COLOR_ALIASES = {
  black: ["black", "أسود", "اسود"],
  white: ["white", "أبيض", "ابيض"],
  beige: ["beige", "بيج", "cream"],
  gray: ["gray", "grey", "رمادي"],
  navy: ["navy", "كحلي", "dark blue"],
  blue: ["blue", "أزرق", "ازرق"],
  brown: ["brown", "بني"],
  green: ["green", "أخضر", "اخضر"],
  red: ["red", "أحمر", "احمر"],
  pink: ["pink", "وردي"],
};

const SLOT_RULES = [
  { id: "one-piece", label: "onePiece", weight: 0.58, keywords: ["dress", "jumpsuit", "abaya", "gown", "فستان", "عباية", "جمبسوت"] },
  { id: "top", label: "top", weight: 0.34, keywords: ["top", "shirt", "t-shirt", "tee", "blouse", "sweater", "hoodie", "jacket", "قميص", "تيشيرت", "بلوزة", "سويتشيرت", "جاكيت"] },
  { id: "bottom", label: "bottom", weight: 0.28, keywords: ["pants", "trouser", "jean", "shorts", "skirt", "bottom", "بنطلون", "جينز", "شورت", "تنورة"] },
  { id: "shoes", label: "shoes", weight: 0.25, keywords: ["shoe", "sneaker", "boot", "sandal", "footwear", "حذاء", "كوتشي", "جزمة", "صندل"] },
  { id: "accessory", label: "accessory", weight: 0.09, keywords: ["bag", "belt", "cap", "hat", "watch", "wallet", "accessory", "شنطة", "حزام", "كاب", "ساعة", "محفظة", "إكسسوار", "اكسسوار"] },
];

const normalize = (value) => String(value ?? "")
  .toLocaleLowerCase("en")
  .normalize("NFKC")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const containsAny = (haystack, needles) => {
  const words = normalize(haystack).split(" ").filter(Boolean);
  return needles.some((needle) => {
    const tokens = normalize(needle).split(" ").filter(Boolean);
    if (!tokens.length) return false;
    // Accept ordinary English plural/inflected catalogue labels (jeans, sneakers)
    // while retaining whole-word matching for short terms to avoid noisy matches.
    return tokens.every((token) => words.some((word) =>
      word === token || (token.length >= 4 && word.startsWith(token)) || (word.length >= 5 && token.startsWith(word))
    ));
  });
};

// Same rule the checkout charges, so a look never shows a price the customer will not pay.
export function getEffectiveProductPrice(product) {
  try {
    const { unitPrice } = calculateProductPricing(product);
    return unitPrice > 0 ? unitPrice : null;
  } catch {
    return null;
  }
}

export function classifyStylistSlot(product) {
  const searchable = [product?.name, product?.nameAr, product?.nameEn, product?.category, product?.categoryAr, product?.categoryEn, product?.section, product?.sectionAr, product?.sectionEn, product?.style, product?.styleAr, product?.styleEn].filter(Boolean).join(" ");
  for (const rule of SLOT_RULES) {
    if (containsAny(searchable, rule.keywords)) return rule.id;
  }
  return "other";
}

function preferenceScore(product, preferences) {
  const text = [product.name, product.nameAr, product.nameEn, product.description, product.descriptionAr, product.descriptionEn, product.category, product.categoryAr, product.categoryEn, product.section, product.sectionAr, product.sectionEn, product.style, product.styleAr, product.styleEn].filter(Boolean).join(" ");
  let score = 0;

  const gender = normalize(product.gender || product.genderEn || "");
  const wantedGender = preferences.gender;
  if (wantedGender && wantedGender !== "UNISEX") {
    if (gender === normalize(wantedGender) || normalize(product.genderEn) === normalize(wantedGender)) score += 18;
    else if (gender === "unisex") score += 8;
    else if (gender && gender !== "unisex") score -= 24;
  }

  const styleTerms = STYLE_LABELS[preferences.style] || [];
  if (styleTerms.length && containsAny(text, styleTerms)) score += 22;
  const occasionTerms = OCCASION_LABELS[preferences.occasion] || [];
  if (occasionTerms.length && containsAny(text, occasionTerms)) score += 12;

  const preferredColors = COLOR_ALIASES[preferences.color] || [];
  if (preferredColors.length && containsAny([...(product.colors || []), text].join(" "), preferredColors)) score += 10;
  if (product.isSale) score += 2;
  score += Math.min(10, Math.max(0, Number(product.ratingsAverage) || 0) * 2);
  score += Math.min(4, Math.log10(Math.max(0, Number(product.ratingsQuantity) || 0) + 1) * 2);
  return score;
}

function chooseBest(products, slot, preferences, budgetRemaining, totalBudget) {
  const matching = products.filter((product) => product.slot === slot && product.price <= budgetRemaining);
  if (!matching.length) return null;
  const rule = SLOT_RULES.find((item) => item.id === slot);
  const target = totalBudget * (rule?.weight ?? 0.1);

  return matching
    .map((product) => {
      const priceFit = Math.max(-10, 8 - Math.abs(product.price - target) / Math.max(target, 1) * 8);
      return { ...product, score: preferenceScore(product.raw, preferences) + priceFit };
    })
    .sort((a, b) => b.score - a.score || a.price - b.price || a.id.localeCompare(b.id))[0];
}

/**
 * Creates an explainable look from the live catalogue. This is intentionally
 * deterministic and does not send customer preferences or catalogue data to
 * an unconfigured third-party model.
 */
export function buildPersonalizedLook(products, preferences) {
  const budget = preferences.budget;
  const candidates = products
    .filter((product) => Number(product.countInStock) > 0)
    .map((raw) => {
      const price = getEffectiveProductPrice(raw);
      if (price === null || price > budget) return null;
      return { id: String(raw._id), price, slot: classifyStylistSlot(raw), raw };
    })
    .filter(Boolean);

  const onePiece = chooseBest(candidates, "one-piece", preferences, budget, budget);
  const selected = [];
  let remaining = budget;

  if (onePiece) {
    selected.push({ slot: "onePiece", product: onePiece.raw, effectivePrice: onePiece.price });
    remaining -= onePiece.price;
    for (const slot of ["shoes", "accessory"]) {
      const best = chooseBest(candidates.filter((item) => !selected.some((entry) => String(entry.product._id) === item.id)), slot, preferences, remaining, budget);
      if (best) {
        selected.push({ slot: slot === "shoes" ? "shoes" : "accessory", product: best.raw, effectivePrice: best.price });
        remaining -= best.price;
      }
    }
  } else {
    for (const slot of ["top", "bottom", "shoes", "accessory"]) {
      const best = chooseBest(candidates.filter((item) => !selected.some((entry) => String(entry.product._id) === item.id)), slot, preferences, remaining, budget);
      if (best) {
        selected.push({ slot, product: best.raw, effectivePrice: best.price });
        remaining -= best.price;
      }
    }
  }

  const required = onePiece ? ["onePiece", "shoes"] : ["top", "bottom", "shoes"];
  const present = new Set(selected.map((item) => item.slot));
  const missingSlots = required.filter((slot) => !present.has(slot));
  const total = Math.round(selected.reduce((sum, item) => sum + item.effectivePrice, 0) * 100) / 100;

  return {
    items: selected,
    total,
    remaining: Math.max(0, Math.round((budget - total) * 100) / 100),
    missingSlots,
    isComplete: missingSlots.length === 0,
  };
}

export const STYLIST_OPTIONS = {
  genders: ["MEN", "WOMEN", "KIDS", "UNISEX"],
  styles: Object.keys(STYLE_LABELS),
  occasions: Object.keys(OCCASION_LABELS),
  colors: Object.keys(COLOR_ALIASES),
};
