import Wrapper from "../middlewares/wrapper.js";
import mongoose from "mongoose";
import appError from "../utils/appError.js";
import { Success, Fail } from "../utils/httpText.js";
import { USER, ADMIN, MANAGER } from "../utils/role.js";
import Notification from "../models/notificationSchema.js";
import { getPagination } from "../utils/pagination.js";

const notificationFilter = (userId, role) =>
  role === ADMIN || role === MANAGER
    ? { recipientRole: { $in: [ADMIN, MANAGER] } }
    : { recipient: userId, recipientRole: USER };

const localizeNotification = (notification, locale) => {
  if (locale !== "ar" || !notification) return notification;
  return {
    ...notification,
    title: notification.titleAr || notification.title,
    message: notification.messageAr || notification.message,
  };
};

const getNotifications = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const { page, limit, skip } = getPagination(req.query, { maxLimit: 100 });
  const clauses = [notificationFilter(userId, req.currentUser.role)];
  if (req.query.unreadOnly === "true") clauses.push({ read: false });
  if (req.query.orderOnly === "true") clauses.push({ order: { $exists: true, $ne: null } });

  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim().slice(0, 100) : "";
  if (req.query.keyword !== undefined && typeof req.query.keyword !== "string") {
    return next(appError.create("Invalid keyword value", Fail, 400));
  }
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clauses.push({
      $or: [
        { title: { $regex: escaped, $options: "i" } },
        { titleAr: { $regex: escaped, $options: "i" } },
        { message: { $regex: escaped, $options: "i" } },
        { messageAr: { $regex: escaped, $options: "i" } },
        { $expr: { $regexMatch: { input: { $convert: { input: "$order", to: "string", onError: "", onNull: "" } }, regex: escaped, options: "i" } } },
      ],
    });
  }
  const filter = clauses.length === 1 ? clauses[0] : { $and: clauses };
  const baseFilter = notificationFilter(userId, req.currentUser.role);
  const [notifications, total, unreadCount, totalCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...baseFilter, read: false }),
    Notification.countDocuments(baseFilter),
  ]);

  return res.status(200).json({
    status: Success,
    results: notifications.length,
    unreadCount,
    totalCount,
    pagination: { count: total, page, limit, totalPages: Math.ceil(total / limit) },
    data: { notifications: notifications.map((item) => localizeNotification(item, req.locale)) },
  });
});

const markAsRead = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?.id || req.currentUser?._id;
  const { id } = req.params;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }
  if (!mongoose.Types.ObjectId.isValid(id)) return next(appError.create("Invalid notification ID", Fail, 400));

  const filter = { _id: id, ...notificationFilter(userId, req.currentUser.role) };
  const notification = await Notification.findOneAndUpdate(filter, { $set: { read: true } }, { new: true });
  if (!notification) return next(appError.create("Notification not found", Fail, 404));

  return res.status(200).json({ status: Success, data: { notification: localizeNotification(notification.toObject(), req.locale) } });
});

const readAll = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?.id || req.currentUser?._id;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  const filter = { ...notificationFilter(userId, req.currentUser.role), read: false };
  const result = await Notification.updateMany(filter, { $set: { read: true } });
  return res.status(200).json({ status: Success, data: { modifiedCount: result.modifiedCount } });
});

export { getNotifications, markAsRead, readAll };
