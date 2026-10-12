import express from "express";
const adminRoute = express.Router();
import allowedRoles from "../middlewares/allowedRoles.js";
import verifyToken from "../middlewares/verifyToken.js";
import { ADMIN, MANAGER } from "../utils/role.js";
import {
  users,
  UpdateUserRole,
  getUser,
  deleteUser,
  getDashboardStats,
} from "../controllers/adminController.js";
adminRoute.use(verifyToken, allowedRoles(ADMIN, MANAGER));
// adminRoute.get("/stats", getAdminStats);
adminRoute.get("/dashboard", getDashboardStats);
adminRoute.get("/users", users);
adminRoute
  .route("/users/:userId")
  .get(getUser)
  .delete(allowedRoles(ADMIN), deleteUser)
  .patch(allowedRoles(ADMIN), UpdateUserRole);

export { adminRoute };
