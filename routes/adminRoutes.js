const express = require("express");
const adminRoute = express.Router();
const { getAdminStats } = require("../controllers/adminController");
const allowedRoles = require("../middlewares/allowedRoles");
const verifyToken = require("../middlewares/verifyToken");
const { ADMIN, MANGER } = require("../utils/role");
// adminRoute.use(verifyToken, allowedRoles(ADMIN, MANGER));
adminRoute.get("/stats", getAdminStats);

module.exports = { adminRoute };
