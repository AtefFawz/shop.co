import express from "express";
import passport from "passport";
import crypto from "crypto";
import {
  signIn,
  signUp,
  logout,
  refreshToken,
  googleCallback,
  googleExchange,
  createSocketTicket,
  forgetPassword,
  verifyOtp,
  resetPassword,
  verifyEmail,
  resendVerification,
} from "../controllers/authController.js";
import { upload } from "../middlewares/multer.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
import requireTrustedOrigin from "../middlewares/requireTrustedOrigin.js";
import verifyToken from "../middlewares/verifyToken.js";

const authRoutes = express.Router();
const loginLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 10, namespace: "auth-login", store: "mongo", skipSuccessfulRequests: true });
const accountLoginLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  namespace: "auth-account-login",
  store: "mongo",
  // email + IP: an attacker can no longer lock a victim's account from another IP.
  // Only failed attempts count, so a correct login never uses up the quota.
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `email:${email || "none"}|ip:${req.ip || "unknown"}`;
  },
});
const otpLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 5, namespace: "auth-otp", store: "mongo" });
const resendVerificationLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 5, namespace: "auth-resend-verification", store: "mongo" });
const passwordLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 8, namespace: "auth-password", store: "mongo" });
const refreshLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 60, namespace: "auth-refresh", store: "mongo" });
const logoutLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 30, namespace: "auth-logout", store: "mongo" });
const uploadLimiter = createRateLimit({ windowMs: 15 * 60 * 1000, max: 15, namespace: "auth-signup-upload", store: "mongo" });

authRoutes.post("/signup", loginLimiter, uploadLimiter, upload.single("avatar"), signUp);
authRoutes.post("/verify-email", passwordLimiter, verifyEmail);
authRoutes.post("/resend-verification", resendVerificationLimiter, resendVerification);
authRoutes.post("/signin", loginLimiter, accountLoginLimiter, signIn);
authRoutes.post("/refresh-token", refreshLimiter, requireTrustedOrigin, refreshToken);
authRoutes.post("/logout", logoutLimiter, requireTrustedOrigin, logout);
authRoutes.post(
  "/socket-ticket",
  requireTrustedOrigin,
  verifyToken,
  createRateLimit({ windowMs: 60 * 1000, max: 20, namespace: "auth-socket-ticket", store: "mongo" }),
  createSocketTicket,
);
authRoutes.post("/forget-password", otpLimiter, forgetPassword);
authRoutes.post("/verify-otp", passwordLimiter, verifyOtp);
authRoutes.post("/reset-password", passwordLimiter, resetPassword);
const GOOGLE_STATE_COOKIE = "googleOAuthState";
const GOOGLE_CLIENT_STATE_COOKIE = "googleOAuthClientState";
const googleStateCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 5 * 60 * 1000,
  path: "/api/auth/google/callback",
});

const googleClientStateCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 5 * 60 * 1000,
  path: "/api/auth/google/callback",
});

const verifyGoogleOAuthState = (req, res, next) => {
  const expected = req.cookies?.[GOOGLE_STATE_COOKIE];
  const received = typeof req.query.state === "string" ? req.query.state : "";
  res.clearCookie(GOOGLE_STATE_COOKIE, {
    ...googleStateCookieOptions(),
    maxAge: undefined,
    expires: new Date(0),
  });

  const expectedBuffer = typeof expected === "string" ? Buffer.from(expected) : Buffer.alloc(0);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length === 0 ||
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    const error = new Error("Invalid Google OAuth state");
    error.statusCode = 401;
    return next(error);
  }
  return next();
};

authRoutes.get("/google", loginLimiter, (req, res, next) => {
  const clientState = typeof req.query.client_state === "string" ? req.query.client_state : "";
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(clientState)) {
    const error = new Error("Invalid Google OAuth client state");
    error.statusCode = 400;
    return next(error);
  }
  if (!passport._strategy("google")) {
    const error = new Error("Google authentication is not configured");
    error.statusCode = 503;
    return next(error);
  }
  const state = crypto.randomBytes(32).toString("base64url");
  res.cookie(GOOGLE_STATE_COOKIE, state, googleStateCookieOptions());
  res.cookie(GOOGLE_CLIENT_STATE_COOKIE, clientState, googleClientStateCookieOptions());
  return passport.authenticate("google", { scope: ["profile", "email"], state })(req, res, next);
});
authRoutes.post("/google/exchange", loginLimiter, requireTrustedOrigin, googleExchange);
const googleFailureRedirect = (() => {
  try {
    return process.env.CLIENT_URL
      ? new URL("/login?error=google_auth_failed", process.env.CLIENT_URL).toString()
      : "/login?error=google_auth_failed";
  } catch {
    return "/login?error=google_auth_failed";
  }
})();

authRoutes.get(
  "/google/callback",
  verifyGoogleOAuthState,
  passport.authenticate("google", { session: false, failureRedirect: googleFailureRedirect }),
  googleCallback,
);

export { authRoutes };
