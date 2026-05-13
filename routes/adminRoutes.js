const express = require("express");
const adminRoute = express.Router();
const { getAdminStats } = require("../controllers/adminController");
const allowedRoles = require("../middlewares/allowedRoles");
const verifyToken = require("../middlewares/verifyToken");
const { ADMIN, MANGER } = require("../utils/role");
const {
  users,
  UpdateUserRole,
  getUser,
  deleteUser,
} = require("../controllers/adminController");
adminRoute.use(verifyToken, allowedRoles(ADMIN, MANGER));
adminRoute.get("/stats", getAdminStats);
adminRoute.get("/users", allowedRoles(ADMIN), users);
adminRoute
  .route("/users/:userId")
  .get(allowedRoles(ADMIN), getUser)
  .delete(allowedRoles(ADMIN), deleteUser)
  .patch(allowedRoles(ADMIN), UpdateUserRole);

module.exports = { adminRoute };
