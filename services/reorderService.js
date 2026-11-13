import { calculateProductPricing } from "./orderPricingService.js";

const MAX_LINE_QUANTITY = 99;

const sameOption = (left, right) =>
  String(left ?? "").trim().toLocaleLowerCase() === String(right ?? "").trim().toLocaleLowerCase();

const findOption = (available, wanted) =>
  (Array.isArray(available) ? available : []).find((value) => sameOption(value, wanted));

/**
 * Turns a past order into a cart plan against the CURRENT catalogue.
 * Prices come from today's product, never from the old order, and the quantity is
 * capped at the stock that exists now. Lines that cannot be re-ordered are returned
 * with a reason instead of being silently dropped.
 *
 * `products` is a Map of productId -> lean product document.
 */
const buildReorderPlan = (order, products) => {
  const items = [];
  const unavailable = [];

  for (const line of order.orderItems || []) {
    const productId = String(line.product?._id || line.product || "");
    const name = line.nameEn || line.name || "";
    const product = products.get(productId);

    if (!product) {
      unavailable.push({ productId, name, reason: "removed" });
      continue;
    }

    const stock = Number(product.countInStock) || 0;
    if (stock <= 0) {
      unavailable.push({ productId, name, reason: "out-of-stock" });
      continue;
    }

    // A size/colour that no longer exists must not fall back to a different variant.
    let size;
    let color;
    if (line.size) {
      size = findOption(product.size, line.size);
      if (!size) {
        unavailable.push({ productId, name, reason: "variant-unavailable" });
        continue;
      }
    }
    if (line.color) {
      color = findOption(product.colors, line.color);
      if (!color) {
        unavailable.push({ productId, name, reason: "variant-unavailable" });
        continue;
      }
    }

    let unitPrice;
    try {
      ({ unitPrice } = calculateProductPricing(product));
    } catch {
      unavailable.push({ productId, name, reason: "unavailable" });
      continue;
    }

    const requestedQuantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(Number(line.quantity) || 1)));
    const quantity = Math.min(requestedQuantity, stock);

    items.push({
      productId,
      product,
      quantity,
      requestedQuantity,
      quantityAdjusted: quantity < requestedQuantity,
      size,
      color,
      unitPrice,
      previousPrice: Number(line.price) || 0,
      priceChanged: Math.abs(unitPrice - (Number(line.price) || 0)) > 0.001,
    });
  }

  return { items, unavailable };
};

export { buildReorderPlan, MAX_LINE_QUANTITY };
