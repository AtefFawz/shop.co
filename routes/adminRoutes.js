const express = require("express");
const adminRoute = express.Router();
const allowedRoles = require("../middlewares/allowedRoles");
const verifyToken = require("../middlewares/verifyToken");
const { ADMIN, MANAGER } = require("../utils/role");
const {
  users,
  UpdateUserRole,
  getUser,
  deleteUser,
  getDashboardStats,
} = require("../controllers/adminController");
adminRoute.use(verifyToken, allowedRoles(ADMIN, MANAGER));
// adminRoute.get("/stats", getAdminStats);
adminRoute.get("/dashboard", getDashboardStats);
adminRoute.get("/users", users);
adminRoute
  .route("/users/:userId")
  .get(getUser)
  .delete(allowedRoles(ADMIN), deleteUser)
  .patch(allowedRoles(ADMIN), UpdateUserRole);

module.exports = { adminRoute };
