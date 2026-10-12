import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import allowedRoles from "../middlewares/allowedRoles.js";
const notificationRouter = express.Router();

import {
  getNotifications,
  markAsRead,
  readAll,
} from "../controllers/notificationController.js";

notificationRouter.use(verifyToken);
notificationRouter.get("/", getNotifications);
notificationRouter.patch("/readAll", readAll);
notificationRouter.patch("/:id", markAsRead);

export { notificationRouter };
