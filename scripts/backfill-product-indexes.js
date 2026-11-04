import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/productSchema.js";
import OAuthCode from "../models/oauthCodeSchema.js";
import Order from "../models/orderSchema.js";
import Review from "../models/reviewSchema.js";
import Notification from "../models/notificationSchema.js";
import User from "../models/authSchema.js";
import OTP from "../models/otpSchema.js";
import RateLimitBucket from "../models/rateLimitBucketSchema.js";
import SocketTicket from "../models/socketTicketSchema.js";
import {
  buildProductSearchFields,
  buildProductFilterFields,
  buildProductPriceFields,
  getNumericPrice,
} from "../services/productSearchService.js";
import { buildVariantIndexFields } from "../services/variantIndexService.js";

const BATCH_SIZE = 250;

const run = async () => {
  await connectDB();

  let operations = [];
  let scanned = 0;
  let updated = 0;
  let invalidPrices = 0;

  const cursor = Product.find()
    .select("name nameAr nameEn description descriptionAr descriptionEn category categoryAr categoryEn section sectionAr sectionEn style styleAr styleEn gender genderAr genderEn price discount isSale colors size")
    .lean()
    .cursor({ batchSize: BATCH_SIZE });

  const flush = async () => {
    if (!operations.length) return;
    const result = await Product.bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount || 0;
    operations = [];
  };

  for await (const product of cursor) {
    scanned += 1;
    const update = {
      ...buildProductSearchFields(product),
      ...buildProductFilterFields(product),
      ...buildVariantIndexFields(product),
      ...buildProductPriceFields(product),
    };
    const priceValue = getNumericPrice(product.price);
    if (priceValue === null) invalidPrices += 1;
    const updateOperation = {
      updateOne: {
        filter: { _id: product._id },
        update: priceValue === null
          ? { $set: update, $unset: { priceValue: "", salePriceValue: "" } }
          : { $set: update },
      },
    };
    operations.push(updateOperation);

    if (operations.length >= BATCH_SIZE) await flush();
  }

  await flush();
  // Create only declared indexes; unlike syncIndexes(), this does not drop unrelated legacy indexes.
  await Product.createIndexes();
  // OAuth authorization codes require a TTL index so short-lived records are cleaned automatically.
  await Promise.all([
    OAuthCode.createIndexes(),
    Order.createIndexes(),
    Review.createIndexes(),
    Notification.createIndexes(),
    User.createIndexes(),
    OTP.createIndexes(),
    RateLimitBucket.createIndexes(),
    SocketTicket.createIndexes(),
  ]);

  const existingIndexes = await Product.collection.indexes();
  const oldTextIndex = existingIndexes.find((index) =>
    index.name === "name_text_description_text_section_text_gender_text",
  );
  if (oldTextIndex) await Product.collection.dropIndex(oldTextIndex.name);

  console.log(`Product search/price backfill complete. Scanned: ${scanned}; updated: ${updated}; invalid numeric prices: ${invalidPrices}. Product, OAuth, socket-ticket, rate-limit, and application model indexes were also ensured.`);
};

run()
  .catch((error) => {
    console.error("Product search/price backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
