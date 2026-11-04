import crypto from "node:crypto";
import RateLimitBucket from "../models/rateLimitBucketSchema.js";
import appError from "../utils/appError.js";
import { Fail } from "../utils/httpText.js";

const memoryStores = new Map();

const hashKey = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

const consumeMemoryBucket = ({ namespace, key, windowMs, now, maxEntries }) => {
  let store = memoryStores.get(namespace);
  if (!store) {
    store = new Map();
    memoryStores.set(namespace, store);
  }

  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucketKey = `${windowStart}:${hashKey(key)}`;
  let record = store.get(bucketKey);

  if (!record) {
    if (store.size >= maxEntries) {
      const oldestKey = store.keys().next().value;
      if (oldestKey !== undefined) store.delete(oldestKey);
    }
    record = { hits: 0, resetAt: windowStart + windowMs };
    store.set(bucketKey, record);
  }

  record.hits += 1;
  return {
    hits: record.hits,
    resetAt: record.resetAt,
    release: () => {
      record.hits = Math.max(0, record.hits - 1);
    },
  };
};

const consumeMongoBucket = async ({ namespace, key, windowMs, now }) => {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  // Hash identifiers before persistence: email addresses and raw IPs are never stored.
  const bucketId = `${namespace}:${windowStart}:${hashKey(key)}`;
  const update = {
    $inc: { hits: 1 },
    $setOnInsert: { expiresAt: new Date(resetAt + windowMs) },
  };

  let record;
  try {
    record = await RateLimitBucket.findOneAndUpdate(
      { _id: bucketId },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
      .select("hits expiresAt")
      .lean();
  } catch (error) {
    // Two first requests can race to upsert the same _id. The winner creates
    // the bucket; the loser retries as a normal atomic increment.
    if (error?.code !== 11000) throw error;
    record = await RateLimitBucket.findOneAndUpdate(
      { _id: bucketId },
      { $inc: { hits: 1 } },
      { new: true },
    )
      .select("hits expiresAt")
      .lean();
  }

  if (!record) throw new Error("Unable to update shared rate-limit bucket");
  return {
    hits: record.hits,
    resetAt,
    release: () =>
      RateLimitBucket.updateOne({ _id: bucketId, hits: { $gt: 0 } }, { $inc: { hits: -1 } }).catch(() => {}),
  };
};

/**
 * Use the shared MongoDB store for security-sensitive endpoints in production.
 * The memory store is only intended for local development and tests.
 */
const createRateLimit = ({
  windowMs = 15 * 60 * 1000,
  max = 100,
  message,
  keyGenerator,
  maxEntries = 50000,
  skipSuccessfulRequests = false,
  namespace = "api",
  store = process.env.NODE_ENV === "production" ? "mongo" : "memory",
} = {}) => {
  return async (req, res, next) => {
    const now = Date.now();
    const key = String(
      (typeof keyGenerator === "function" && keyGenerator(req)) ||
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown",
    ).slice(0, 300);

    try {
      const record =
        store === "mongo"
          ? await consumeMongoBucket({ namespace, key, windowMs, now })
          : consumeMemoryBucket({ namespace, key, windowMs, now, maxEntries });

      // Count only failed attempts (status >= 400): a successful login must not
      // consume the quota, so legitimate users are never locked out by it.
      if (skipSuccessfulRequests) {
        res.once("finish", () => {
          if (res.statusCode < 400) record.release?.();
        });
      }

      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, max - record.hits)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(record.resetAt / 1000)));

      if (record.hits > max) {
        res.setHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))),
        );
        return next(
          appError.create(
            message || "Too many requests. Please try again later.",
            Fail,
            429,
          ),
        );
      }

      return next();
    } catch (error) {
      // A shared-store failure must not silently downgrade production auth limits
      // to per-instance memory limits.
      if (store === "mongo") {
        console.error("Shared rate-limit store unavailable:", error.message);
        return next(
          appError.create(
            "Security service temporarily unavailable. Please try again.",
            Fail,
            503,
          ),
        );
      }
      return next(error);
    }
  };
};

export { createRateLimit };
