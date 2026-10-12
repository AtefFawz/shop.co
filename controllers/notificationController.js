import Wrapper from "../middlewares/wrapper.js";
import mongoose from "mongoose";
import appError from "../utils/appError.js";
import { Success, Fail, Error } from "../utils/httpText.js";
import { USER, ADMIN } from "../utils/role.js";
import Notification from "../modules/notificationSchema.js";

// --> Get All Notifications
const getNotifications = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  const query = req.query;
  const limit = parseInt(query.limit) || 10;
  const page = parseInt(query.page) || 1;
  const skip = (page - 1) * limit;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const filter =
    req.currentUser.role === ADMIN
      ? { recipientRole: ADMIN }
      : {
          recipient: userId,
          recipientRole: USER,
        };

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  const countNotification = await Notification.countDocuments(filter);

  res.status(200).json({
    status: Success,
    results: notifications.length,
    pagination: {
      count: countNotification,
      page,
      limit,
      totalPages: Math.ceil(countNotification / limit),
    },
    data: {
      notifications,
    },
  });
});

const markAsRead = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;
  const { id } = req.params;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(appError.create("Invalid notification ID", Fail, 400));
  }

  const filter =
    req.currentUser.role === ADMIN
      ? {
          _id: id,
          recipientRole: ADMIN,
        }
      : {
          _id: id,
          recipient: userId,
          recipientRole: USER,
        };

  const notification = await Notification.findOneAndUpdate(
    filter,
    { read: true },
    { new: true },
  );

  if (!notification) {
    return next(appError.create("Notification not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    data: { notification },
  });
});

const readAll = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const updateResult = await Notification.updateMany(
    { user: userId, read: false },
    { $set: { read: true } },
  );

  res.status(200).json({
    status: Success,
    data: {
      updateAll: updateResult,
    },
  });
});

export { getNotifications, markAsRead, readAll };
