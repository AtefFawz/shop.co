import express from "express";
import passport from "passport";
import {
  signIn,
  signUp,
  logout,
  refreshToken,
  googleCallback,
  forgetPassword,
  verifyOtp,
  resetPassword,
} from "../controllers/authController.js";
import { upload } from "../middlewares/multer.js";
const authRouts = express.Router();

authRouts.post("/signup", upload.single("avatar"), signUp);
authRouts.post("/signin", signIn);
authRouts.post("/refresh-token", refreshToken);
authRouts.post("/logout", logout);
authRouts.post("/forget-password", forgetPassword);
authRouts.post("/verify-otp", verifyOtp);
authRouts.post("/reset-password", resetPassword);
authRouts.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

authRouts.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  googleCallback,
);

export { authRouts };
