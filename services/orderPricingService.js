import { getNumericPrice } from "./productSearchService.js";

const resolveVariantOption = (requestedValue, availableValues, fieldName, maxLength = 60) => {
  if (requestedValue === undefined || requestedValue === null || requestedValue === "") return undefined;
  if (typeof requestedValue !== "string" || !requestedValue.trim() || requestedValue.trim().length > maxLength) {
    throw new Error(`Invalid ${fieldName} value`);
  }

  const requested = requestedValue.trim().toLocaleLowerCase();
  const available = Array.isArray(availableValues) ? availableValues : [];
  const match = available.find((value) =>
    typeof value === "string" && value.trim().toLocaleLowerCase() === requested,
  );

  if (!match) throw new Error(`Selected ${fieldName} is not available for this product`);
  return match.trim();
};

// Must stay aligned with the storefront's published delivery rule.
const calculateShippingFeeCents = (subtotalCents) =>
  subtotalCents > 0 && subtotalCents < 20000 ? 1500 : 0;

const calculateProductPricing = (product = {}) => {
  const basePrice = getNumericPrice(product.price);
  if (basePrice === null) throw new Error("Invalid product price");

  let discount = 0;
  if (product.isSale) {
    const rawDiscount = product.discount;
    const discountValue = rawDiscount === undefined || rawDiscount === null || rawDiscount === ""
      ? 0
      : Number(rawDiscount);
    if (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 100) {
      throw new Error("Invalid product discount");
    }
    discount = discountValue;
  }
  const baseCents = Math.round(basePrice * 100);
  const unitPriceCents = Math.round(baseCents * (1 - discount / 100));

  return {
    unitPriceCents,
    unitPrice: unitPriceCents / 100,
  };
};

export { resolveVariantOption, calculateProductPricing, calculateShippingFeeCents };
