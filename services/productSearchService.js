const SEARCHABLE_FIELDS = [
  "name", "nameAr", "nameEn",
  "description", "descriptionAr", "descriptionEn",
  "category", "categoryAr", "categoryEn",
  "section", "sectionAr", "sectionEn",
  "style", "styleAr", "styleEn",
  "gender", "genderAr", "genderEn",
];

const normalizeSearchText = (value = "") => String(value)
  .normalize("NFKC")
  .toLocaleLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[إأآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ؤ/g, "و")
  .replace(/ئ/g, "ي")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const unique = (values) => [...new Set(values.filter(Boolean))];

const getProductSearchText = (product = {}) => SEARCHABLE_FIELDS
  .map((field) => {
    const value = product[field];
    if (typeof value !== "string") return "";
    // Keep searchable descriptions useful without creating huge multikey indexes.
    return field.startsWith("description") ? value.slice(0, 1600) : value;
  })
  .filter((value) => value.trim())
  .join(" ");

const PREFIX_FIELDS = [
  "name", "nameAr", "nameEn", "category", "categoryAr", "categoryEn",
  "section", "sectionAr", "sectionEn", "style", "styleAr", "styleEn",
  "gender", "genderAr", "genderEn",
];

const FILTER_VALUE_FIELDS = {
  gender: { storageField: "genderValues", sourceFields: ["gender", "genderAr", "genderEn"] },
  section: { storageField: "sectionValues", sourceFields: ["section", "sectionAr", "sectionEn"] },
  style: { storageField: "styleValues", sourceFields: ["style", "styleAr", "styleEn"] },
  category: { storageField: "categoryValues", sourceFields: ["category", "categoryAr", "categoryEn"] },
};

const buildProductFilterFields = (product = {}) => Object.fromEntries(
  Object.entries(FILTER_VALUE_FIELDS).map(([key, config]) => [
    config.storageField,
    unique(config.sourceFields
      .map((field) => product[field])
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => normalizeSearchText(value))),
  ]),
);

const getNgrams = (token, size) => {
  const chars = Array.from(token);
  if (chars.length < size) return [];
  const grams = [];
  for (let index = 0; index <= chars.length - size; index += 1) {
    grams.push(chars.slice(index, index + size).join(""));
  }
  return grams;
};

const buildProductSearchFields = (product = {}) => {
  const normalizedText = normalizeSearchText(getProductSearchText(product));
  const tokens = unique(normalizedText.split(/\s+/));
  const prefixText = normalizeSearchText(PREFIX_FIELDS.map((field) => product[field] || "").join(" "));
  const prefixes = [];
  const ngrams = [];

  for (const token of unique(prefixText.split(/\s+/))) {
    const chars = Array.from(token);
    for (let length = 1; length <= chars.length; length += 1) {
      prefixes.push(chars.slice(0, length).join(""));
    }
  }
  for (const token of tokens) {
    ngrams.push(...getNgrams(token, 2), ...getNgrams(token, 3));
  }

  return {
    searchIndexVersion: 1,
    searchText: normalizedText,
    searchPrefixes: unique(prefixes),
    searchNgrams: unique(ngrams),
    searchCharacters: unique(Array.from(normalizedText.replace(/\s/g, ""))),
  };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildKeywordFilter = (keyword) => {
  const normalizedKeyword = normalizeSearchText(keyword);
  const tokens = unique(normalizedKeyword.split(/\s+/));
  if (tokens.length > 16) throw new Error("Invalid keyword value");
  if (!tokens.length) return { _id: { $in: [] } };

  const indexedConditions = tokens.map((token) => {
    const chars = Array.from(token);
    const substringCheck = { searchText: { $regex: escapeRegex(token) } };

    if (chars.length === 1) {
      return { $and: [{ searchCharacters: token }, substringCheck] };
    }
    if (chars.length === 2) {
      return { $and: [{ searchNgrams: { $all: [token] } }, substringCheck] };
    }

    const grams = getNgrams(token, 3);
    return {
      $and: [
        {
          $or: [
            { searchPrefixes: token },
            { searchNgrams: { $all: grams } },
          ],
        },
        substringCheck,
      ],
    };
  });

  const legacyConditions = tokens.map((token) => ({
    $or: SEARCHABLE_FIELDS.map((field) => ({
      [field]: { $regex: escapeRegex(token), $options: "i" },
    })),
  }));

  // The legacy branch keeps search working for old product documents until the backfill script runs.
  return {
    $or: [
      { $and: [{ searchIndexVersion: 1 }, ...indexedConditions] },
      { $and: [{ searchIndexVersion: { $exists: false } }, ...legacyConditions] },
    ],
  };
};

const parseFilterValues = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return [];
  const values = Array.isArray(value) ? value : String(value).split(",");
  const cleaned = values.map((item) => String(item).trim()).filter(Boolean);
  if (cleaned.length > 20 || cleaned.some((item) => item.length > 100)) {
    throw new Error(`Invalid ${fieldName} filter`);
  }
  return unique(cleaned);
};

const buildExactMultiFieldFilter = (filterName, fields, values) => {
  if (!values.length) return null;
  const config = FILTER_VALUE_FIELDS[filterName];
  if (!config) throw new Error("Unsupported product filter");

  const normalizedValues = unique(values.map((value) => normalizeSearchText(value)));
  const patterns = values.map((value) => new RegExp(`^${escapeRegex(value)}$`, "i"));
  return {
    $or: [
      { [config.storageField]: { $in: normalizedValues } },
      {
        $and: [
          { [config.storageField]: { $exists: false } },
          { $or: fields.map((field) => ({ [field]: { $in: patterns } })) },
        ],
      },
    ],
  };
};

const getNumericPrice = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const price = Number(typeof value === "string" ? value.trim() : value);
  return Number.isFinite(price) && price >= 0 ? price : null;
};

const buildProductPriceFields = (product = {}) => {
  const numericPrice = getNumericPrice(product.price);
  if (numericPrice === null) return {};

  const priceCents = Math.round(numericPrice * 100);
  let salePriceCents = priceCents;
  if (product.isSale) {
    const rawDiscount = product.discount;
    const discount = rawDiscount === undefined || rawDiscount === null || rawDiscount === ""
      ? 0
      : Number(rawDiscount);
    // Invalid legacy discounts must never turn into a zero-price product in catalog filters.
    if (Number.isFinite(discount) && discount >= 0 && discount <= 100) {
      salePriceCents = Math.round(priceCents * (1 - discount / 100));
    }
  }

  return {
    priceValue: priceCents / 100,
    salePriceValue: salePriceCents / 100,
  };
};

export {
  SEARCHABLE_FIELDS,
  normalizeSearchText,
  buildProductSearchFields,
  buildProductFilterFields,
  buildKeywordFilter,
  parseFilterValues,
  buildExactMultiFieldFilter,
  getNumericPrice,
  buildProductPriceFields,
};
