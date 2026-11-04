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
import { createRateLimit } from "../middlewares/rateLimit.js";
import requireTrustedOrigin from "../middlewares/requireTrustedOrigin.js";

const authRouts = express.Router();
const loginLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const accountLoginLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return email ? `email:${email}` : `ip:${req.ip || "unknown"}`;
  },
});
const otpLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const passwordLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 8 });
const refreshLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
const uploadLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 15 });

authRouts.post("/signup", loginLimiter, uploadLimiter, upload.single("avatar"), signUp);
authRouts.post("/signin", loginLimiter, accountLoginLimiter, signIn);
authRouts.post("/refresh-token", refreshLimiter, requireTrustedOrigin, refreshToken);
authRouts.post("/logout", requireTrustedOrigin, logout);
authRouts.post("/forget-password", otpLimiter, forgetPassword);
authRouts.post("/verify-otp", passwordLimiter, verifyOtp);
authRouts.post("/reset-password", passwordLimiter, resetPassword);
authRouts.get("/google", loginLimiter, (req, res, next) => {
  if (!passport._strategy("google")) {
    const error = new Error("Google authentication is not configured");
    error.statusCode = 503;
    return next(error);
  }
  return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});
const googleFailureRedirect = (() => {
  try {
    return process.env.CLIENT_URL
      ? new URL("/login?error=google_auth_failed", process.env.CLIENT_URL).toString()
      : "/login?error=google_auth_failed";
  } catch {
    return "/login?error=google_auth_failed";
  }
})();

authRouts.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: googleFailureRedirect }),
  googleCallback,
);

export { authRouts };
