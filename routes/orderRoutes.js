import express from "express";
const orderRouter = express.Router();
import {
  createOrder,
  getOrders,
  updateOrderStatus,
  deleteOrder,
  getOrderById,
  getOrderInvoice,
  getReorderItems,
} from "../controllers/orderController.js";

import verifyToken from "../middlewares/verifyToken.js";
import allowedRoles from "../middlewares/allowedRoles.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
import { ADMIN, MANAGER } from "../utils/role.js";

orderRouter.use(verifyToken);

const orderMutationLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  namespace: "order-mutation",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});

const createOrderLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  namespace: "order-create",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || req.ip || "unknown"}`,
});

orderRouter.get("/all", allowedRoles(ADMIN, MANAGER), getOrders);
orderRouter.get("/:id/invoice", getOrderInvoice);
orderRouter.get("/:id/reorder", getReorderItems);

orderRouter
  .route("/:id")
  .get(getOrderById)
  .patch(allowedRoles(ADMIN, MANAGER), orderMutationLimiter, updateOrderStatus)
  .delete(orderMutationLimiter, deleteOrder);

orderRouter.route("/").post(createOrderLimiter, createOrder);

export { orderRouter };
