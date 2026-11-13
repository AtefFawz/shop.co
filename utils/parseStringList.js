import appError from "./appError.js";
import { Fail } from "./httpText.js";

/**
 * Parse a list supplied as an array, a JSON array string, or a comma-separated
 * string. Callers can tighten the item/count limits for their own data type.
 */
const parseStringList = (
  value,
  fieldName,
  { maxItems = 20, maxItemLength = 100 } = {},
) => {
  if (value === undefined || value === null || value === "") return [];

  let values;
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
      try {
        values = JSON.parse(trimmed);
      } catch {
        throw appError.create(`Invalid ${fieldName} format`, Fail, 400);
      }
      if (!Array.isArray(values)) {
        throw appError.create(`Invalid ${fieldName} format`, Fail, 400);
      }
    } else {
      values = trimmed.split(",");
    }
  } else {
    throw appError.create(
      `${fieldName} must be an array or comma-separated string`,
      Fail,
      400,
    );
  }

  if (
    values.length > maxItems ||
    values.some(
      (item) =>
        typeof item !== "string" ||
        item.trim().length > maxItemLength,
    )
  ) {
    throw appError.create(`Invalid ${fieldName} format`, Fail, 400);
  }

  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
};

export default parseStringList;
