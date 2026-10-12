import express from "express";
const orderRouter = express.Router();
import {
  createOrder,
  getOrders,
  //   getOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderById,
} from "../controllers/orderController.js";

import verifyToken from "../middlewares/verifyToken.js";
import allowedRoles from "../middlewares/allowedRoles.js";
import { ADMIN } from "../utils/role.js";

orderRouter.use(verifyToken);

orderRouter.get("/all", allowedRoles(ADMIN), getOrders);

orderRouter
  .route("/:id")
  .get(getOrderById)
  .patch(allowedRoles(ADMIN), updateOrderStatus)
  .delete(deleteOrder);

orderRouter.route("/").post(createOrder);
// .get(getOrder);

export { orderRouter };
