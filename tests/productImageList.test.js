import test from "node:test";
import assert from "node:assert/strict";
import parseStringList from "../utils/parseStringList.js";

test("existing Cloudinary image URLs longer than 100 characters are accepted within the image limit", () => {
  const imageUrl = `https://res.cloudinary.com/shopco/image/upload/q_auto,f_auto/v1770000000/shop-co-uploads/${"product-image-".repeat(8)}.webp`;
  assert.ok(imageUrl.length > 100);
  assert.deepEqual(
    parseStringList(JSON.stringify([imageUrl]), "existingImages", {
      maxItems: 4,
      maxItemLength: 2048,
    }),
    [imageUrl],
  );
});

test("existing image lists accept repeated multipart values and remove duplicates", () => {
  const first = `https://res.cloudinary.com/shopco/image/upload/v1/shop-co-uploads/first.webp`;
  const second = `https://res.cloudinary.com/shopco/image/upload/v1/shop-co-uploads/second.webp`;
  assert.deepEqual(
    parseStringList([first, second, first], "existingImages", {
      maxItems: 4,
      maxItemLength: 2048,
    }),
    [first, second],
  );
});

test("image list limits reject too many items and oversized values", () => {
  const options = { maxItems: 4, maxItemLength: 2048 };
  assert.throws(
    () => parseStringList(["a", "b", "c", "d", "e"], "existingImages", options),
    /Invalid existingImages format/,
  );
  assert.throws(
    () => parseStringList(["x".repeat(2049)], "existingImages", options),
    /Invalid existingImages format/,
  );
});

test("ordinary option lists retain their smaller default bounds", () => {
  assert.throws(
    () => parseStringList(["x".repeat(101)], "colors"),
    /Invalid colors format/,
  );
  assert.deepEqual(parseStringList(["Black", "White", "Black"], "colors"), ["Black", "White"]);
});
