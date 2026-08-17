const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const allowedRoles = require("../middlewares/allowedRoles");
const notificationRouter = express.Router();

const {
  getNotifications,
  markAsRead,
  readAll,
} = require("../controllers/notificationController");

notificationRouter.use(verifyToken);
notificationRouter.get("/", getNotifications);
notificationRouter.patch("/readAll", readAll);
notificationRouter.patch("/:id", markAsRead);

module.exports = { notificationRouter };
