import appError from "./appError.js";
import { Fail } from "./httpText.js";

const otpTime = async (user) => {
  const MAX_DAILY_LIMIT = 5;
  const COOLDOWN_TIME = 10 * 60 * 1000;
  //   const COOLDOWN_TIME = 1000;

  if (user.lastOtpRequest) {
    const now = new Date();
    const lastRequest = new Date(user.lastOtpRequest);

    if (now.toDateString() !== lastRequest.toDateString()) {
      user.otpDailyCount = 0;
    }

    if (user.otpDailyCount >= MAX_DAILY_LIMIT) {
      throw appError.create(
        "Maximum daily OTP limit reached. Try again tomorrow.",
        Fail,
        429,
      );
    }

    const timeDiff = now.getTime() - lastRequest.getTime();
    if (timeDiff < COOLDOWN_TIME) {
      const remainingMinutes = Math.ceil(
        (COOLDOWN_TIME - timeDiff) / (60 * 1000),
      );
      throw appError.create(
        `Please wait ${remainingMinutes} minute(s) before requesting a new code.`,
        Fail,
        429,
      );
    }
  }

  user.otpDailyCount = (user.otpDailyCount || 0) + 1;
  user.lastOtpRequest = new Date();
  await user.save();
};

export default otpTime;
