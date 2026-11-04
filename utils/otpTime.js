import User from "../models/authSchema.js";
import appError from "./appError.js";
import { Fail } from "./httpText.js";

const otpTime = async (user) => {
  const MAX_DAILY_LIMIT = 5;
  const COOLDOWN_TIME = 10 * 60 * 1000;
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_TIME);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Use a single conditional database update so concurrent reset requests cannot
  // bypass the cooldown or daily quota by overwriting each other's counters.
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      $and: [
        { $or: [{ lastOtpRequest: null }, { lastOtpRequest: { $lte: cooldownCutoff } }] },
        {
          $or: [
            { lastOtpRequest: null },
            { lastOtpRequest: { $lt: dayStart } },
            { otpDailyCount: { $lt: MAX_DAILY_LIMIT } },
          ],
        },
      ],
    },
    [
      {
        $set: {
          otpDailyCount: {
            $cond: [
              {
                $or: [
                  { $eq: [{ $ifNull: ["$lastOtpRequest", null] }, null] },
                  { $lt: ["$lastOtpRequest", dayStart] },
                ],
              },
              1,
              { $add: [{ $ifNull: ["$otpDailyCount", 0] }, 1] },
            ],
          },
          lastOtpRequest: now,
        },
      },
    ],
    { new: true },
  );

  if (updatedUser) return now;

  const latestUser = await User.findById(user._id)
    .select("+otpDailyCount +lastOtpRequest")
    .lean();
  const lastRequest = latestUser?.lastOtpRequest ? new Date(latestUser.lastOtpRequest) : null;

  if ((latestUser?.otpDailyCount || 0) >= MAX_DAILY_LIMIT && lastRequest && lastRequest >= dayStart) {
    throw appError.create("Maximum daily OTP limit reached. Try again tomorrow.", Fail, 429);
  }

  if (lastRequest) {
    const timeDiff = now.getTime() - lastRequest.getTime();
    if (timeDiff < COOLDOWN_TIME) {
      const remainingMinutes = Math.ceil((COOLDOWN_TIME - timeDiff) / 60000);
      throw appError.create(`Please wait ${remainingMinutes} minute(s) before requesting a new code.`, Fail, 429);
    }
  }

  throw appError.create("Too many requests. Please try again later.", Fail, 429);
};

export default otpTime;
