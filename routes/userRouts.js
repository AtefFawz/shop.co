const express = require("express");
const {
  signIn,
  signUp,
  users,
  // allUser,
} = require("../controllers/userController");
const verifyToken = require("../middlewares/verifyToken");
const { ADMIN, MANGER } = require("../utils/role");
const allowedRoles = require("../middlewares/allowedRoles");
const upload = require("../middlewares/multer");
const userRouts = express.Router();

userRouts.post("/signup", upload.single("avatar"), signUp);
userRouts.post("/signin", signIn);
userRouts.get("/admin/users", verifyToken, allowedRoles(ADMIN, MANGER), users);
module.exports = { userRouts };
