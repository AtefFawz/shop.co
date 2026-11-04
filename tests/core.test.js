import test from "node:test";
import assert from "node:assert/strict";
import { localeFrom, translate, localizeDocument } from "../utils/i18n.js";
import { getPagination } from "../utils/pagination.js";
import appError from "../utils/appError.js";
import { Fail } from "../utils/httpText.js";

import {
  normalizeSearchText,
  buildProductSearchFields,
  buildProductFilterFields,
  buildKeywordFilter,
  parseFilterValues,
  buildExactMultiFieldFilter,
  getNumericPrice,
  buildProductPriceFields,
} from "../services/productSearchService.js";
import { resolveVariantOption, calculateProductPricing, calculateShippingFeeCents } from "../services/orderPricingService.js";
import { buildVariantIndexFields, colorFamily, normalizeSizeValue } from "../services/variantIndexService.js";

test("localeFrom supports Arabic and defaults to English", () => {
  assert.equal(localeFrom("ar-EG,ar;q=0.9,en;q=0.8"), "ar");
  assert.equal(localeFrom("en-US"), "en");
  assert.equal(localeFrom(undefined), "en");
});

test("API messages are translated for Arabic requests", () => {
  assert.equal(translate("All fields are required", "ar"), "جميع الحقول مطلوبة");
  assert.equal(translate("All fields are required", "en"), "All fields are required");
});

test("product data uses available language fields without dropping originals", () => {
  const product = {
    name: "Classic Shirt",
    nameEn: "Classic Shirt",
    nameAr: "قميص كلاسيكي",
    description: "Cotton shirt",
    descriptionAr: "قميص قطني",
    category: "Clothing",
    categoryAr: "ملابس",
  };
  const arabic = localizeDocument(product, "ar");
  const english = localizeDocument(product, "en");
  assert.equal(arabic.name, "قميص كلاسيكي");
  assert.equal(arabic.description, "قميص قطني");
  assert.equal(arabic.category, "ملابس");
  assert.equal(arabic.nameEn, "Classic Shirt");
  assert.equal(english.name, "Classic Shirt");
});

test("pagination clamps large limits and rejects invalid values", () => {
  assert.deepEqual(getPagination({ page: "3", limit: "10000" }), {
    page: 3,
    limit: 100,
    skip: 200,
  });
  assert.deepEqual(getPagination({ page: "-1", limit: "zero" }), {
    page: 1,
    limit: 10,
    skip: 0,
  });
  assert.equal(getPagination({ page: "999999999999", limit: "100" }).page, 100000);
});

test("appError creates independent errors instead of mutating a shared singleton", () => {
  const first = appError.create("first", Fail, 400);
  const second = appError.create("second", Fail, 404);
  assert.notEqual(first, second);
  assert.equal(first.message, "first");
  assert.equal(second.statusCode, 404);
});

test("Arabic search normalization removes diacritics and normalizes common letter variants", () => {
  assert.equal(normalizeSearchText("إِبْرَاهِيم ى"), "ابراهيم ي");
  assert.equal(normalizeSearchText("  Classic-SHIRT  "), "classic shirt");
});

test("product search index stores prefixes, partial-word ngrams, and single characters", () => {
  const index = buildProductSearchFields({
    nameEn: "Classic Shirt",
    nameAr: "قميص كلاسيكي",
    descriptionEn: "Premium cotton fabric",
  });

  assert.equal(index.searchIndexVersion, 1);
  assert.ok(index.searchText.includes("classic shirt"));
  assert.ok(index.searchPrefixes.includes("cla"));
  assert.ok(index.searchNgrams.includes("hir"));
  assert.ok(index.searchNgrams.includes("ميص"));
  assert.ok(index.searchCharacters.includes("ق"));
});

test("keyword search accepts one character, partial words, and multi-word queries", () => {
  const oneCharacter = buildKeywordFilter("ق");
  assert.deepEqual(oneCharacter.$or[0].$and[1].$and[0], { searchCharacters: "ق" });
  assert.equal(oneCharacter.$or[0].$and[1].$and[1].searchText.$regex, "ق");

  const partialWord = buildKeywordFilter("shir");
  assert.ok(partialWord.$or[0].$and[1].$and[0].$or[1].searchNgrams.$all.includes("shi"));
  assert.equal(partialWord.$or[0].$and[1].$and[1].searchText.$regex, "shir");

  const sentence = buildKeywordFilter("classic قميص");
  assert.equal(sentence.$or[0].$and.length, 3);
  assert.deepEqual(buildKeywordFilter("!!!")._id.$in, []);
  assert.throws(() => buildKeywordFilter("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen"), /Invalid keyword/);
});

test("product filters safely support multiple values and exact matching across localized fields", () => {
  assert.deepEqual(parseFilterValues("Men,Women", "gender"), ["Men", "Women"]);
  const filter = buildExactMultiFieldFilter("section", ["section", "sectionAr"], ["Men's", "رجالي"]);
  assert.deepEqual(filter.$or[0].sectionValues.$in, ["men s", "رجالي"]);
  assert.equal(filter.$or[1].$and[0].sectionValues.$exists, false);
  assert.equal(filter.$or[1].$and[1].$or[0].section.$in[0].test("men's"), true);
  assert.equal(filter.$or[1].$and[1].$or[1].sectionAr.$in[1].test("رجالي"), true);

  const stored = buildProductFilterFields({ sectionEn: "Men's", sectionAr: "رجالي" });
  assert.deepEqual(stored.sectionValues, ["رجالي", "men s"]);
});

test("numeric product prices are validated before filtering or order calculations", () => {
  assert.equal(getNumericPrice("125.50"), 125.5);
  assert.equal(getNumericPrice("-1"), null);
  assert.equal(getNumericPrice("free"), null);
  assert.equal(getNumericPrice("   "), null);
  assert.deepEqual(buildProductPriceFields({ price: "199.99", discount: "20", isSale: true }), {
    priceValue: 199.99,
    salePriceValue: 159.99,
  });
  assert.deepEqual(buildProductPriceFields({ price: "199.99", discount: "20", isSale: false }), {
    priceValue: 199.99,
    salePriceValue: 199.99,
  });
});

test("order variants are matched to configured product options without trusting client labels", () => {
  assert.equal(resolveVariantOption(" m ", ["S", "M", "L"], "size", 40), "M");
  assert.equal(resolveVariantOption("Black", ["Black", "White"], "color"), "Black");
  assert.equal(resolveVariantOption(undefined, ["S", "M"], "size"), undefined);
  assert.throws(() => resolveVariantOption("XXL", ["S", "M", "L"], "size"), /not available/);
});

test("order pricing is calculated from database price and discount with currency-safe rounding", () => {
  assert.deepEqual(calculateProductPricing({ price: "199.99", discount: "10", isSale: true }), {
    unitPriceCents: 17999,
    unitPrice: 179.99,
  });
  assert.deepEqual(calculateProductPricing({ price: "99.90", discount: "90", isSale: false }), {
    unitPriceCents: 9990,
    unitPrice: 99.9,
  });
  assert.throws(() => calculateProductPricing({ price: "not-a-price" }), /Invalid product price/);
  assert.throws(() => calculateProductPricing({ price: "100", discount: "Infinity", isSale: true }), /Invalid product discount/);
  assert.throws(() => calculateProductPricing({ price: "100", discount: "120", isSale: true }), /Invalid product discount/);
  assert.deepEqual(calculateProductPricing({ price: "100", isSale: true }), {
    unitPriceCents: 10000,
    unitPrice: 100,
  });
});


test("shipping fee follows the storefront threshold and is calculated in integer cents", () => {
  assert.equal(calculateShippingFeeCents(19999), 1500);
  assert.equal(calculateShippingFeeCents(20000), 0);
  assert.equal(calculateShippingFeeCents(0), 0);
});


test("colour and size filters use the same canonical families as the storefront", () => {
  assert.equal(colorFamily("#101010"), "#000000");
  assert.equal(colorFamily("black"), "#000000");
  assert.equal(colorFamily("أسود"), "#000000");
  assert.equal(normalizeSizeValue("Medium"), "M");
  assert.equal(normalizeSizeValue("XX-Large"), "2XL");

  assert.deepEqual(
    buildVariantIndexFields({ colors: ["black", "#101010", "blue"], size: ["Medium", "XX-Large"] }),
    { colorFamilyValues: ["#000000", "#193cb8"], sizeValues: ["M", "2XL"] },
  );
});
