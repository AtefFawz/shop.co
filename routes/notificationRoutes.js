import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
const notificationRouter = express.Router();

import {
  getNotifications,
  markAsRead,
  readAll,
} from "../controllers/notificationController.js";

notificationRouter.use(verifyToken);
const notificationWriteLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  namespace: "notification-write",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});
notificationRouter.get("/", getNotifications);
notificationRouter.patch("/readAll", notificationWriteLimiter, readAll);
notificationRouter.patch("/:id", notificationWriteLimiter, markAsRead);

export { notificationRouter };
