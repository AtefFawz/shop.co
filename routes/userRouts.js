const express = require("express");
const passport = require("passport");
const userRouts = express.Router();
const {
  signIn,
  signUp,
  logout,
  refreshToken,
  googleCallback,
} = require("../controllers/userController");
const { upload } = require("../middlewares/multer");

userRouts.post("/signup", upload.single("avatar"), signUp);
userRouts.post("/signin", signIn);
userRouts.post("/refresh-token", refreshToken);
userRouts.post("/logout", logout);

userRouts.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

userRouts.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  googleCallback,
);

module.exports = { userRouts };
