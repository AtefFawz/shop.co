import express from "express";
const adminRoute = express.Router();
import allowedRoles from "../middlewares/allowedRoles.js";
import verifyToken from "../middlewares/verifyToken.js";
import { ADMIN, MANAGER } from "../utils/role.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
import {
  users,
  UpdateUserRole,
  getUser,
  deleteUser,
  getDashboardStats,
} from "../controllers/adminController.js";
adminRoute.use(verifyToken, allowedRoles(ADMIN, MANAGER));
const adminReadLimiter = createRateLimit({
  windowMs: 60 * 1000,
  max: 120,
  namespace: "admin-read",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});
const adminWriteLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  namespace: "admin-write",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});
// adminRoute.get("/stats", getAdminStats);
adminRoute.get("/dashboard", adminReadLimiter, getDashboardStats);
adminRoute.get("/users", adminReadLimiter, users);
adminRoute
  .route("/users/:userId")
  .get(adminReadLimiter, getUser)
  .delete(allowedRoles(ADMIN), adminWriteLimiter, deleteUser)
  .patch(allowedRoles(ADMIN), adminWriteLimiter, UpdateUserRole);

export { adminRoute };
