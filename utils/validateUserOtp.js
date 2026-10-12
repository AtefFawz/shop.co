import bcrypt from "bcrypt";
import OTP from "../modules/optSchema.js";
import appError from "./appError.js";
import { Fail } from "./httpText.js";

const OTP_VALIDITY_MS = 10 * 60 * 1000;

const validateUserOtp = async (email, otp) => {
  const otpRecord = await OTP.findOne({ email: String(email) });
  if (!otpRecord) {
    throw appError.create(
      "OTP has expired. Please request a new code.",
      Fail,
      400,
    );
  }

  const isExpired =
    Date.now() - new Date(otpRecord.createdAt).getTime() > OTP_VALIDITY_MS;

  if (isExpired) {
    await OTP.deleteOne({ _id: otpRecord._id });
    throw appError.create(
      "OTP has expired. Please request a new code.",
      Fail,
      400,
    );
  }

  const isOtpValid = await bcrypt.compare(String(otp), otpRecord.otp);
  if (!isOtpValid) {
    otpRecord.attempts = (otpRecord.attempts || 0) + 1;
    if (otpRecord.attempts >= 5) {
      await OTP.deleteOne({ _id: otpRecord._id });
      throw appError.create(
        "Too many failed attempts. Please request a new OTP.",
        Fail,
        429,
      );
    }
    await otpRecord.save();
    throw appError.create("Invalid OTP code.", Fail, 400);
  }

  return otpRecord;
};

export default validateUserOtp;
