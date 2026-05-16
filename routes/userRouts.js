const express = require("express");
const userRouts = express.Router();
const {
  signIn,
  signUp,
  logout,
  refreshToken,
} = require("../controllers/userController");
const verifyToken = require("../middlewares/verifyToken");
const allowedRoles = require("../middlewares/allowedRoles");
const upload = require("../middlewares/multer");

userRouts.post("/signup", upload.single("avatar"), signUp);
userRouts.post("/signin", signIn);
userRouts.post("/refresh-token", refreshToken);
userRouts.post("/logout", logout);
module.exports = { userRouts };
