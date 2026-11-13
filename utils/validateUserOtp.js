import crypto from "node:crypto";
import OTP from "../models/otpSchema.js";
import appError from "./appError.js";
import { Fail } from "./httpText.js";

const OTP_VALIDITY_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const getOtpSecret = () => {
  const secret = process.env.SECRET_ACCESS_KEY;
  if (!secret) throw new Error("SECRET_ACCESS_KEY is not configured");
  return secret;
};

// A 6-digit code has only 10^6 possibilities, so a slow hash (bcrypt) adds no
// real protection. A keyed HMAC is enough; the attempt cap is what stops guessing.
const hashOtp = (email, otp) =>
  crypto.createHmac("sha256", getOtpSecret()).update(`password-reset:${email}:${otp}`).digest("hex");

const hashesMatch = (stored, candidate) => {
  if (typeof stored !== "string" || stored.length !== candidate.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(candidate));
};

const validateUserOtp = async (email, otp) => {
  const normalizedEmail = String(email).trim().toLowerCase();

  // Claim one attempt atomically BEFORE comparing. Parallel guesses therefore
  // cannot all pass an "attempts < 5" check and exceed the cap.
  const otpRecord = await OTP.findOneAndUpdate(
    {
      email: normalizedEmail,
      attempts: { $lt: OTP_MAX_ATTEMPTS },
      createdAt: { $gt: new Date(Date.now() - OTP_VALIDITY_MS) },
    },
    { $inc: { attempts: 1 } },
    { new: true },
  ).select("+otp");

  if (!otpRecord) {
    const exhausted = await OTP.findOneAndDelete({
      email: normalizedEmail,
      attempts: { $gte: OTP_MAX_ATTEMPTS },
    }).select("_id");
    if (exhausted) {
      throw appError.create("Too many failed attempts. Please request a new OTP.", Fail, 429);
    }
    throw appError.create("OTP has expired. Please request a new code.", Fail, 400);
  }

  if (!hashesMatch(otpRecord.otp, hashOtp(normalizedEmail, String(otp)))) {
    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      await OTP.deleteOne({ _id: otpRecord._id });
      throw appError.create("Too many failed attempts. Please request a new OTP.", Fail, 429);
    }
    throw appError.create("Invalid OTP code.", Fail, 400);
  }

  // A correct code does not burn the budget, so verify-otp followed by
  // reset-password still works for a user who mistyped once or twice.
  await OTP.updateOne({ _id: otpRecord._id }, { $inc: { attempts: -1 } });
  return otpRecord;
};

export { hashOtp };
export default validateUserOtp;
