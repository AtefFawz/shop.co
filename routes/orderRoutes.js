const express = require("express");
const orderRouter = express.Router();
const {
  createOrder,
  getOrders,
  getOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderById,
} = require("../controllers/orderController");

const verifyToken = require("../middlewares/verifyToken");
const allowedRoles = require("../middlewares/allowedRoles");
const { ADMIN } = require("../utils/role");

orderRouter.use(verifyToken);

orderRouter.get("/all", allowedRoles(ADMIN), getOrders);

orderRouter
  .route("/:id")
  .get(getOrderById)
  .patch(allowedRoles(ADMIN), updateOrderStatus)
  .delete(deleteOrder);

orderRouter.route("/").post(createOrder).get(getOrder);

module.exports = { orderRouter };
