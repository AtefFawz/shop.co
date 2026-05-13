const express = require("express");
const { signIn, signUp } = require("../controllers/userController");
const verifyToken = require("../middlewares/verifyToken");
const { ADMIN, MANAGER } = require("../utils/role");
const allowedRoles = require("../middlewares/allowedRoles");
const upload = require("../middlewares/multer");
const userRouts = express.Router();

userRouts.post("/signup", upload.single("avatar"), signUp);
userRouts.post("/signin", signIn);

module.exports = { userRouts };
