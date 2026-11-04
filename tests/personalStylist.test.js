import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonalizedLook, classifyStylistSlot, getEffectiveProductPrice } from "../services/personalStylistService.js";

const product = (id, name, price, category = name, extra = {}) => ({
  _id: id, name, category, price: String(price), discount: "0", countInStock: 5, isSale: false,
  colors: [], size: [], ...extra,
});
const preferences = { gender: "MEN", style: "casual", occasion: "everyday", color: "", budget: 3000 };

test("effective price uses only valid sale discounts", () => {
  assert.equal(getEffectiveProductPrice(product("1", "Shirt", 1000, "Tops", { isSale: true, discount: "20" })), 800);
  assert.equal(getEffectiveProductPrice(product("2", "Shirt", "invalid")), null);
  assert.equal(getEffectiveProductPrice(product("3", "Shirt", -10)), null);
});

test("stylist classifies Arabic and English catalogue labels", () => {
  assert.equal(classifyStylistSlot(product("1", "Basic T-Shirt", 300, "Tops")), "top");
  assert.equal(classifyStylistSlot(product("2", "بنطلون جينز", 700, "ملابس")), "bottom");
  assert.equal(classifyStylistSlot(product("3", "حذاء رياضي", 900, "أحذية")), "shoes");
  assert.equal(classifyStylistSlot(product("4", "فستان سهرة", 1200, "فساتين")), "one-piece");
});

test("outfit contains only in-stock real products and remains within budget", () => {
  const catalogue = [
    product("top", "Casual T-Shirt", 500, "Tops", { gender: "MEN", style: "casual", ratingsAverage: 4.5 }),
    product("bottom", "Casual Jeans", 900, "Jeans", { gender: "MEN", style: "casual" }),
    product("shoes", "Casual Sneakers", 1100, "Shoes", { gender: "UNISEX", style: "casual" }),
    product("sold", "Casual Shirt", 250, "Tops", { countInStock: 0 }),
    product("expensive", "Casual Pants", 5000, "Pants"),
  ];
  const look = buildPersonalizedLook(catalogue, preferences);
  assert.deepEqual(look.items.map((item) => item.slot), ["top", "bottom", "shoes"]);
  assert.equal(look.total, 2500);
  assert.equal(look.isComplete, true);
  assert.ok(look.items.every((item) => item.product.countInStock > 0));
  assert.ok(look.total <= preferences.budget);
});

test("one-piece looks do not double-select a top and bottom", () => {
  const catalogue = [
    product("dress", "Elegant Evening Dress", 1400, "Dresses", { gender: "WOMEN" }),
    product("heels", "Elegant Heels", 800, "Shoes", { gender: "WOMEN" }),
  ];
  const look = buildPersonalizedLook(catalogue, { ...preferences, gender: "WOMEN", style: "elegant", occasion: "evening", budget: 3000 });
  assert.deepEqual(look.items.map((item) => item.slot), ["onePiece", "shoes"]);
  assert.equal(look.isComplete, true);
});

test("missing catalogue categories are reported instead of invented", () => {
  const look = buildPersonalizedLook([product("top", "Basic T-Shirt", 300, "Tops")], preferences);
  assert.equal(look.items.length, 1);
  assert.deepEqual(look.missingSlots, ["bottom", "shoes"]);
  assert.equal(look.isComplete, false);
});
