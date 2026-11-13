import "dotenv/config";
import connectDB from "../config/db.js";
import ProductEngagement from "../models/productEngagementSchema.js";
import Order from "../models/orderSchema.js";
import Review from "../models/reviewSchema.js";
import Notification from "../models/notificationSchema.js";

// autoIndex is off in production, so every index the code depends on is created here.
// Safe to re-run. Run it once after each deployment that changes a schema index.
const dropNonUniqueReviewIndex = async () => {
  const indexes = await Review.collection.indexes();
  const legacy = indexes.find((index) => index.name === "product_1_user_1" && !index.unique);
  if (legacy) {
    await Review.collection.dropIndex(legacy.name);
    console.log("Dropped the old non-unique review index (product_1_user_1).");
  }
};

const steps = [
  ["customer features", () => ProductEngagement.createIndexes()],
  ["order idempotency", () => Order.createIndexes()],
  ["notification TTL", () => Notification.createIndexes()],
  [
    "one review per user and product",
    async () => {
      await dropNonUniqueReviewIndex();
      await Review.createIndexes();
    },
  ],
];

let failed = false;
try {
  await connectDB();
  for (const [label, run] of steps) {
    try {
      await run();
      console.log(`OK    ${label}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL  ${label}: ${error.message}`);
      if (label.startsWith("one review") && /duplicate key/i.test(error.message)) {
        console.error("      Duplicate reviews exist. Remove the extra reviews of each (product, user) pair, then re-run.");
      }
    }
  }
  await ProductEngagement.db.close();
} catch (error) {
  failed = true;
  console.error("Unable to connect:", error.message);
}
process.exitCode = failed ? 1 : 0;
