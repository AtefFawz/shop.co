import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInvoice } from "../services/invoiceService.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const listJs = (dir) =>
  fs.readdirSync(path.join(root, dir)).filter((file) => file.endsWith(".js")).map((file) => `${dir}/${file}`);

test("invoice sums money in cents (no floating point drift)", () => {
  const invoice = buildInvoice({
    _id: "64b7f0c2a1b2c3d4e5f6a7b8",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    orderItems: [
      { price: 0.1, quantity: 1 },
      { price: 0.2, quantity: 1 },
      { price: 19.99, quantity: 3 },
    ],
    shippingFee: 15,
    totalPrice: 75.07,
    paymentMethod: "cod",
    isPaid: false,
    status: "Pending",
  });
  assert.equal(invoice.subtotal, 60.27);
  assert.equal(invoice.number, "SHOP-E5F6A7B8");
  assert.equal(invoice.paymentStatus, "Unpaid");
  assert.equal(invoice.currency, "EGP");
});

test("invoice tolerates orders with missing or malformed lines", () => {
  const invoice = buildInvoice({ _id: "64b7f0c2a1b2c3d4e5f6a7b8", orderItems: [{ price: "x" }, {}], isPaid: true });
  assert.equal(invoice.subtotal, 0);
  assert.equal(invoice.paymentStatus, "Paid");
  assert.deepEqual(buildInvoice({ _id: "64b7f0c2a1b2c3d4e5f6a7b8" }).items, []);
});

test("controllers never import other controllers (shared logic lives in services)", () => {
  for (const file of listJs("controllers")) {
    assert.doesNotMatch(read(file), /from\s+"\.\/[\w-]+Controller\.js"/, `${file} imports a sibling controller`);
  }
});

test("every private user field is stripped in one place", () => {
  const schema = read("models/authSchema.js");
  for (const field of ["password", "refreshTokenHash", "prevRefreshTokenHash", "emailVerificationHash", "tokenVersion"]) {
    assert.match(schema, new RegExp(`PRIVATE_FIELDS[\\s\\S]*"${field}"`), `${field} is not in PRIVATE_FIELDS`);
  }
});

test("OTP codes are keyed-HMAC hashed and attempts are claimed before comparing", () => {
  const otp = read("utils/validateUserOtp.js");
  assert.doesNotMatch(otp, /from\s+"bcryptjs"/);
  assert.match(otp, /createHmac/);
  assert.ok(otp.indexOf("$inc: { attempts: 1 }") < otp.indexOf("hashesMatch(otpRecord.otp"), "attempt must be counted before the comparison");
});

test("only pending or cancelled orders can ever be deleted", () => {
  assert.match(read("controllers/orderController.js"), /\["Pending", "Cancelled"\]\.includes\(order\.status\)/);
});

test("the duplicate-key handler no longer claims every conflict is a duplicate email", () => {
  const app = read("shop_app.js");
  assert.match(app, /err\.keyPattern\?\.email/);
});
