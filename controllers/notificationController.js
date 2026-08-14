const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const mongoose = require("mongoose");
const { Success, Fail, Error } = require("../utils/httpText");
const Notification = require("../modules/notificationSchema");

// --> Get All Notifications
const getNotifications = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  // --> Pagination
  const query = req.query;
  const limit = parseInt(query.limit) || 10;
  const page = parseInt(query.page) || 1;
  const skip = (page - 1) * limit;

  // --> Check ID
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  // --> Search about Admin in database
  const notifications = await Notification.find({ user: userId })
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit)
    .lean({ virtuals: true });

  // --> NOTIFICATION COUNT
  const countNotification = await Notification.countDocuments({
    user: userId,
  });

  // --> Response
  res.status(200).json({
    status: Success,
    results: notifications.length,
    pagination: {
      count: countNotification,
      page: page,
      limit: limit,
      totalPages: Math.ceil(countNotification / limit),
    },
    data: {
      notifications,
    },
  });
});


const updateNotification = Meddle(async (req, res, next) => {
  const { id } = req.params;

  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next(appError.create("Invalid Notification ID", Fail, 400));
  }

  const updatedNotification = await Notification.findOneAndUpdate(
    {
      _id: id,
      user: userId,
    },
    {
      $set: {
        read: true,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  ).lean({ virtuals: true });

  if (!updatedNotification) {
    return next(appError.create("Notification not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    data: {
      notification: updatedNotification,
    },
  });
});

const readAll = Meddle(async (req, res, next) => {
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

module.exports = { getNotifications, updateNotification, readAll };
