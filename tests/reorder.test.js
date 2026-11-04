import test from "node:test";
import assert from "node:assert/strict";
import { buildReorderPlan } from "../services/reorderService.js";
import { getEffectiveProductPrice } from "../services/personalStylistService.js";
import { translate } from "../utils/i18n.js";

const line = (product, extra = {}) => ({ product, name: `Item ${product}`, quantity: 2, price: 100, ...extra });
const live = (id, extra = {}) => ({ _id: id, price: "100", isSale: false, countInStock: 10, size: ["M", "L"], colors: ["Black"], ...extra });
const catalogue = (...products) => new Map(products.map((product) => [String(product._id), product]));

test("reorder uses today's price and keeps the customer's variant", () => {
  const plan = buildReorderPlan(
    { orderItems: [line("a", { size: "m", color: "black", price: 80 })] },
    catalogue(live("a", { price: "120", isSale: true, discount: 50 })),
  );
  assert.equal(plan.unavailable.length, 0);
  const [item] = plan.items;
  assert.equal(item.unitPrice, 60);
  assert.equal(item.previousPrice, 80);
  assert.equal(item.priceChanged, true);
  assert.equal(item.size, "M");
  assert.equal(item.color, "Black");
});

test("reorder caps the quantity at the stock that exists now", () => {
  const plan = buildReorderPlan({ orderItems: [line("a", { quantity: 5 })] }, catalogue(live("a", { countInStock: 3 })));
  assert.equal(plan.items[0].quantity, 3);
  assert.equal(plan.items[0].requestedQuantity, 5);
  assert.equal(plan.items[0].quantityAdjusted, true);
});

test("reorder reports lines it cannot restore instead of dropping them silently", () => {
  const plan = buildReorderPlan(
    {
      orderItems: [
        line("gone"),
        line("empty"),
        line("variant", { size: "XXL" }),
        line("badprice"),
        line("ok"),
      ],
    },
    catalogue(live("empty", { countInStock: 0 }), live("variant"), live("badprice", { price: "oops" }), live("ok")),
  );
  assert.deepEqual(
    plan.unavailable.map((entry) => [entry.productId, entry.reason]),
    [["gone", "removed"], ["empty", "out-of-stock"], ["variant", "variant-unavailable"], ["badprice", "unavailable"]],
  );
  assert.deepEqual(plan.items.map((item) => item.productId), ["ok"]);
});

test("reorder never falls back to a different variant and clamps absurd quantities", () => {
  const plan = buildReorderPlan({ orderItems: [line("a", { color: "Neon", quantity: 100000 })] }, catalogue(live("a")));
  assert.equal(plan.items.length, 0);
  assert.equal(plan.unavailable[0].reason, "variant-unavailable");
  const clamped = buildReorderPlan({ orderItems: [line("a", { quantity: 100000 })] }, catalogue(live("a", { countInStock: 500 })));
  assert.equal(clamped.items[0].quantity, 99);
});

test("the stylist prices products exactly like checkout does", () => {
  assert.equal(getEffectiveProductPrice({ price: "199.99", isSale: true, discount: 15 }), 169.99);
  assert.equal(getEffectiveProductPrice({ price: 100, isSale: false, discount: 90 }), 100);
  assert.equal(getEffectiveProductPrice({ price: 100, isSale: true, discount: 150 }), null);
  assert.equal(getEffectiveProductPrice({ price: 0 }), null);
});

test("new server messages have Arabic translations", () => {
  for (const message of [
    "Shipped or delivered orders are kept for records and cannot be deleted",
    "Please verify your email before signing in",
    "You can only review products you have purchased and received",
    "You can keep at most 500 saved products",
  ]) {
    assert.notEqual(translate(message, "ar"), message, message);
  }
});
