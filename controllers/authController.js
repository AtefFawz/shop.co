import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import validator from "validator";
import User from "../models/authSchema.js";
import { Success, Fail } from "../utils/httpText.js";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import { USER } from "../utils/role.js";
import { sendEmail } from "../utils/sendEmail.js";
import OTP from "../models/otpSchema.js";
import OAuthCode from "../models/oauthCodeSchema.js";
import SocketTicket from "../models/socketTicketSchema.js";
import otpTime from "../utils/otpTime.js";
import validateUserOtp, { hashOtp } from "../utils/validateUserOtp.js";
import { disconnectUserSockets } from "../utils/socket.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const ACCESS_COOKIE_TTL = 15 * 60 * 1000;
const REFRESH_COOKIE_TTL = 7 * 24 * 60 * 60 * 1000;
const ACCESS_COOKIE = "accessToken";
const REFRESH_COOKIE = "refreshToken";
const FRONTEND_OAUTH_STATE_COOKIE = "shopcoOAuthState";
const BACKEND_OAUTH_STATE_COOKIE = "googleOAuthClientState";
const REFRESH_GRACE_MS = 30 * 1000;
const REFRESH_COOKIE_PATH = "/api/auth";
const EMAIL_CODE_TTL_MS = 15 * 60 * 1000;
const EMAIL_CODE_RESEND_MS = 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
let dummyPasswordHash;
const getDummyPasswordHash = () => {
  dummyPasswordHash ||= bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12);
  return dummyPasswordHash;
};
const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");

const safeEqual = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length > 0 &&
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getSecret = (name) => {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw appError.create(`${name} must be configured with at least 32 characters`, Fail, 500);
  }
  const otherSecretName = name === "SECRET_ACCESS_KEY" ? "REFRESH_SECRET" : "SECRET_ACCESS_KEY";
  if (process.env[otherSecretName] && value === process.env[otherSecretName]) {
    throw appError.create("JWT secrets must be different", Fail, 500);
  }
  return value;
};

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Browser traffic is routed through the same-origin Next.js API rewrite.
  // Lax prevents cross-site form POSTs from carrying session cookies.
  sameSite: "lax",
  path: "/",
});

const setSessionCookies = (res, accessToken, refreshToken) => {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(),
    maxAge: ACCESS_COOKIE_TTL,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_TTL,
  });
  // Drop the legacy refresh cookie scoped to "/" so two cookies never coexist.
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), maxAge: undefined, expires: new Date(0) });

  // Remove the old JavaScript-readable access-token cookie during migration.
  res.clearCookie("token", {
    ...baseCookieOptions(),
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: undefined,
    expires: new Date(0),
  });
};

const clearSessionCookies = (res) => {
  const options = {
    ...baseCookieOptions(),
    maxAge: undefined,
    expires: new Date(0),
  };
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, { ...options, path: REFRESH_COOKIE_PATH });
  res.clearCookie("token", {
    ...options,
    httpOnly: false,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
};

const clearBackendOAuthStateCookie = (res) => {
  res.clearCookie(BACKEND_OAUTH_STATE_COOKIE, {
    ...baseCookieOptions(),
    maxAge: undefined,
    expires: new Date(0),
    path: "/api/auth/google/callback",
  });
};

const clearFrontendOAuthStateCookie = (res) => {
  res.clearCookie(FRONTEND_OAUTH_STATE_COOKIE, {
    ...baseCookieOptions(),
    maxAge: undefined,
    expires: new Date(0),
  });
};

const issueTokens = async (user) => {
  // Use an atomic increment so concurrent sign-ins cannot reuse a tokenVersion.
  // This project intentionally keeps one active refresh session per account.
  const sessionUser = await User.findByIdAndUpdate(
    user._id,
    { $inc: { tokenVersion: 1 } },
    { new: true, runValidators: true },
  ).select("+tokenVersion");
  if (!sessionUser) throw appError.create("User not found", Fail, 404);

  const payload = {
    id: sessionUser._id.toString(),
    email: sessionUser.email,
    role: sessionUser.role,
    tokenVersion: sessionUser.tokenVersion || 0,
    type: "access",
  };

  const accessToken = jwt.sign(payload, getSecret("SECRET_ACCESS_KEY"), {
    expiresIn: ACCESS_TOKEN_TTL,
    algorithm: "HS256",
  });
  const refreshToken = jwt.sign(
    { ...payload, type: "refresh", jti: crypto.randomUUID() },
    getSecret("REFRESH_SECRET"),
    { expiresIn: REFRESH_TOKEN_TTL, algorithm: "HS256" },
  );

  // Do not let a slower concurrent login overwrite a newer session.
  const stored = await User.updateOne(
    { _id: sessionUser._id, tokenVersion: sessionUser.tokenVersion },
    { $set: { refreshTokenHash: hashToken(refreshToken) } },
  );
  if (stored.modifiedCount !== 1) {
    throw appError.create("A newer sign-in replaced this session. Please try again.", Fail, 409);
  }

  disconnectUserSockets(sessionUser._id);
  return { accessToken, refreshToken };
};

const rotateRefreshSession = async (user, currentRefreshToken) => {
  const tokenVersion = user.tokenVersion || 0;
  const payload = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    tokenVersion,
    type: "access",
  };
  const accessToken = jwt.sign(payload, getSecret("SECRET_ACCESS_KEY"), {
    expiresIn: ACCESS_TOKEN_TTL,
    algorithm: "HS256",
  });
  const refreshToken = jwt.sign(
    { ...payload, type: "refresh", jti: crypto.randomUUID() },
    getSecret("REFRESH_SECRET"),
    { expiresIn: REFRESH_TOKEN_TTL, algorithm: "HS256" },
  );

  // Compare-and-swap guarantees only one concurrent request can rotate a token.
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      refreshTokenHash: hashToken(currentRefreshToken),
      $or: [{ tokenVersion }, { tokenVersion: { $exists: false } }],
    },
    {
      $set: {
        refreshTokenHash: hashToken(refreshToken),
        prevRefreshTokenHash: hashToken(currentRefreshToken),
        prevRefreshRotatedAt: new Date(),
      },
    },
    { new: true },
  ).select("_id");

  return updatedUser ? { accessToken, refreshToken } : null;
};

const hashEmailCode = (email, code) =>
  crypto
    .createHmac("sha256", getSecret("SECRET_ACCESS_KEY"))
    .update(`email-verify:${email}:${code}`)
    .digest("hex");

// Generates a fresh 6-digit code, stores only its HMAC, and emails it.
const issueEmailVerification = async (user, locale) => {
  const code = crypto.randomInt(100000, 1000000).toString();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerificationHash: hashEmailCode(user.email, code),
        emailVerificationExpires: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        emailVerificationAttempts: 0,
        emailVerificationSentAt: new Date(),
      },
    },
  );
  const isArabic = locale === "ar";
  await sendEmail({
    email: user.email,
    subject: isArabic ? "Shop.co - تأكيد البريد الإلكتروني" : "Shop.co - Verify your email",
    message: isArabic
      ? `مرحبًا بك في Shop.co!\nرمز تأكيد البريد الإلكتروني هو: ${code}\nالرمز صالح لمدة 15 دقيقة.`
      : `Welcome to Shop.co!\nYour email verification code is: ${code}\nThis code is valid for 15 minutes.`,
  });
};

const safeUser = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
});

const sendSession = async (user, res, statusCode = 200) => {
  const { accessToken, refreshToken } = await issueTokens(user);
  setSessionCookies(res, accessToken, refreshToken);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.status(statusCode).json({
    status: Success,
    data: { user: safeUser(user) },
  });
};

const signUp = Wrapper(async (req, res, next) => {
  const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;

  if (!fullName || !email || !password) {
    return next(appError.create("All fields are required", Fail, 400));
  }
  if (fullName.length < 2 || fullName.length > 100 || !validator.isEmail(email)) {
    return next(appError.create("Invalid request payload", Fail, 400));
  }
  if (typeof password !== "string" || password.length > 128 || !validator.isStrongPassword(password)) {
    return next(appError.create("Password is too weak.", Fail, 400));
  }

  const existingUser = await User.findOne({ email }).select("_id emailVerified googleId +emailVerificationSentAt");
  // A never-verified password account may be someone squatting this address.
  // Let the new sign-up take it over (the real owner proves ownership by code).
  const isReclaimable = existingUser && existingUser.emailVerified === false && !existingUser.googleId;
  if (existingUser && !isReclaimable) {
    return next(appError.create("Email already registered.", Fail, 409));
  }

  // Re-registering an unverified address re-sends a code. Enforce the same cooldown as
  // /resend-verification so this endpoint cannot be used to flood someone's inbox.
  if (
    isReclaimable &&
    existingUser.emailVerificationSentAt &&
    Date.now() - existingUser.emailVerificationSentAt.getTime() < EMAIL_CODE_RESEND_MS
  ) {
    return next(appError.create("Please wait a minute before requesting another verification code.", Fail, 429));
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const avatar = req.file?.path;
  let newUser;
  if (isReclaimable) {
    newUser = await User.findByIdAndUpdate(
      existingUser._id,
      {
        $set: { fullName, password: passwordHash, refreshTokenHash: null, ...(avatar ? { avatar } : {}) },
        $inc: { tokenVersion: 1 },
      },
      { new: true },
    );
  } else {
    newUser = await User.create({
      fullName,
      email,
      password: passwordHash,
      role: USER,
      emailVerified: false,
      ...(avatar ? { avatar } : {}),
    });
  }

  try {
    await issueEmailVerification(newUser, req.locale);
  } catch {
    // The account exists; the customer can request another code.
    return next(appError.create("Account created but the verification email could not be sent. Please request a new code.", Fail, 503));
  }

  // No session is issued until the email address is verified.
  res.setHeader("Cache-Control", "no-store");
  return res.status(201).json({
    status: Success,
    message: "Verification code sent to your email",
    data: { email, requiresEmailVerification: true },
  });
});

const verifyEmail = Wrapper(async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const code = String(req.body.otp || req.body.code || "").trim();
  if (!validator.isEmail(email) || !/^\d{6}$/.test(code)) {
    return next(appError.create("Email and 6-digit code are required", Fail, 400));
  }

  // Count the attempt first (atomic) and compare afterwards, so parallel requests
  // cannot slip past the attempt cap.
  const user = await User.findOneAndUpdate(
    {
      email,
      emailVerified: false,
      emailVerificationExpires: { $gt: new Date() },
      emailVerificationAttempts: { $lt: EMAIL_CODE_MAX_ATTEMPTS },
    },
    { $inc: { emailVerificationAttempts: 1 } },
    { new: true },
  ).select("+emailVerificationHash");

  if (!user || !user.emailVerificationHash || !safeEqual(user.emailVerificationHash, hashEmailCode(email, code))) {
    return next(appError.create("Invalid or expired verification code", Fail, 400));
  }

  const verifiedUser = await User.findOneAndUpdate(
    { _id: user._id, emailVerified: false, emailVerificationHash: user.emailVerificationHash },
    {
      $set: { emailVerified: true },
      $unset: {
        emailVerificationHash: 1,
        emailVerificationExpires: 1,
        emailVerificationAttempts: 1,
        emailVerificationSentAt: 1,
      },
    },
    { new: true },
  );
  if (!verifiedUser) return next(appError.create("Invalid or expired verification code", Fail, 400));

  return sendSession(verifiedUser, res);
});

const resendVerification = Wrapper(async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!validator.isEmail(email)) return next(appError.create("Valid email is required", Fail, 400));

  const user = await User.findOne({ email, emailVerified: false }).select("+emailVerificationSentAt");
  const cooledDown =
    user && (!user.emailVerificationSentAt || Date.now() - user.emailVerificationSentAt.getTime() >= EMAIL_CODE_RESEND_MS);
  if (user && cooledDown) {
    try {
      await issueEmailVerification(user, req.locale);
    } catch {
      return next(appError.create("Failed to send email. Please try again.", Fail, 503));
    }
  }

  // Same response whether or not the account exists, to avoid email enumeration.
  return res.status(200).json({
    status: Success,
    message: "If this email is awaiting verification, a new code has been sent",
  });
});

const signIn = Wrapper(async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = req.body.password;
  if (!email || typeof password !== "string") {
    return next(appError.create("Email and password are required", Fail, 400));
  }

  const user = await User.findOne({ email }).select("+password +tokenVersion +refreshTokenHash");
  if (!user || !user.password) {
    // Spend the same bcrypt time as a real check so response timing does not reveal
    // whether the email is registered.
    await bcrypt.compare(password, await getDummyPasswordHash());
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) return next(appError.create("Invalid email or password", Fail, 401));
  if (user.emailVerified === false) {
    return next(appError.create("Please verify your email before signing in", Fail, 403));
  }

  return sendSession(user, res);
});

const googleCallback = Wrapper(async (req, res, next) => {
  const user = req.user;
  const clientState = req.cookies?.[BACKEND_OAUTH_STATE_COOKIE];
  clearBackendOAuthStateCookie(res);

  if (!user) return next(appError.create("Google authentication failed", Fail, 401));
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(clientState || "")) {
    return next(appError.create("Invalid Google OAuth client state", Fail, 401));
  }

  const frontendURL = process.env.CLIENT_URL;
  if (!frontendURL) return next(appError.create("CLIENT_URL is not configured", Fail, 500));

  // The one-time code is bound to a nonce stored in an HttpOnly cookie on the
  // storefront origin. A code copied into another browser cannot be exchanged.
  const code = crypto.randomBytes(32).toString("base64url");
  await OAuthCode.create({
    codeHash: hashToken(code),
    clientStateHash: hashToken(clientState),
    user: user._id,
    expiresAt: new Date(Date.now() + 60 * 1000),
  });

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const redirectUrl = new URL("/auth/success", frontendURL);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", clientState);
  return res.redirect(redirectUrl.toString());
});

const googleExchange = Wrapper(async (req, res, next) => {
  const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
  const state = typeof req.body.state === "string" ? req.body.state.trim() : "";
  const browserState = req.cookies?.[FRONTEND_OAUTH_STATE_COOKIE];

  if (
    !/^[A-Za-z0-9_-]{40,60}$/.test(code) ||
    !/^[A-Za-z0-9_-]{40,60}$/.test(state) ||
    !safeEqual(browserState, state)
  ) {
    clearFrontendOAuthStateCookie(res);
    return next(appError.create("Invalid or expired Google authorization code", Fail, 401));
  }

  // The authorization code and the HttpOnly browser nonce must both match.
  const authorization = await OAuthCode.findOneAndDelete({
    codeHash: hashToken(code),
    clientStateHash: hashToken(state),
    expiresAt: { $gt: new Date() },
  });
  clearFrontendOAuthStateCookie(res);
  if (!authorization) {
    return next(appError.create("Invalid or expired Google authorization code", Fail, 401));
  }

  const user = await User.findById(authorization.user);
  if (!user) return next(appError.create("User not found", Fail, 404));

  const { accessToken, refreshToken } = await issueTokens(user);
  setSessionCookies(res, accessToken, refreshToken);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.status(200).json({
    status: Success,
    data: { user: safeUser(user) },
  });
});

const forgetPassword = Wrapper(async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!validator.isEmail(email)) {
    return next(appError.create("Valid email is required", Fail, 400));
  }

  const user = await User.findOne({ email }).select("+otpDailyCount +lastOtpRequest");
  // Always return the same public response to prevent email enumeration.
  if (!user) {
    return res.status(200).json({
      status: Success,
      message: "Password reset OTP has been sent to your email",
    });
  }

  let otpRequestedAt;
  try {
    otpRequestedAt = await otpTime(user);
  } catch (error) {
    // Throttled requests get the same public answer as unknown emails; a distinct
    // 429 would reveal that the account exists.
    if (error?.statusCode === 429) {
      return res.status(200).json({
        status: Success,
        message: "Password reset OTP has been sent to your email",
      });
    }
    throw error;
  }
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = hashOtp(user.email, otp);
  await OTP.findOneAndUpdate(
    { email: user.email },
    { $set: { otp: hashedOtp, attempts: 0, createdAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  try {
    const isArabic = req.locale === "ar";
    await sendEmail({
      email: user.email,
      subject: isArabic ? "Shop.co - رمز إعادة تعيين كلمة المرور" : "Shop.co - Password Reset OTP",
      message: isArabic
        ? `مرحبًا بك في Shop.co!\nرمز إعادة تعيين كلمة المرور هو: ${otp}\nالرمز صالح لمدة 10 دقائق.`
        : `Welcome to Shop.co!\nYour password reset code is: ${otp}\nThis code is valid for 10 minutes.`,
    });
  } catch (error) {
    await User.updateOne(
      { _id: user._id, lastOtpRequest: otpRequestedAt },
      { $inc: { otpDailyCount: -1 }, $set: { lastOtpRequest: null } },
    );
    await OTP.deleteOne({ email: user.email });
    return next(appError.create("Failed to send email. Please try again.", Fail, 503));
  }

  return res.status(200).json({
    status: Success,
    message: "Password reset OTP has been sent to your email",
  });
});

const verifyOtp = Wrapper(async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const otp = String(req.body.otp || "").trim();
  if (!email || !/^\d{6}$/.test(otp)) {
    return next(appError.create("Email and OTP are required", Fail, 400));
  }
  await validateUserOtp(email, otp);
  return res.status(200).json({ status: Success, message: "OTP verified successfully" });
});

const resetPassword = Wrapper(async (req, res, next) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const otp = String(req.body.otp || "").trim();
  const newPassword = req.body.newPassword;
  if (!email || !/^\d{6}$/.test(otp) || typeof newPassword !== "string") {
    return next(appError.create("Email, OTP, and new password are required", Fail, 400));
  }
  if (newPassword.length > 128 || !validator.isStrongPassword(newPassword)) {
    return next(appError.create("Password is too weak.", Fail, 400));
  }

  // Unknown emails fall through to validateUserOtp, which answers "expired" exactly
  // like a real account with no live code, so this endpoint is not an email oracle.
  const otpRecord = await validateUserOtp(email, otp);
  const consumedOtp = await OTP.deleteOne({ _id: otpRecord._id, email });
  if (consumedOtp.deletedCount !== 1) {
    return next(appError.create("OTP has expired. Please request a new code.", Fail, 400));
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updatedUser = await User.findOneAndUpdate(
    { email },
    {
      $set: { password: passwordHash, refreshTokenHash: null },
      $inc: { tokenVersion: 1 },
    },
    { new: true, runValidators: true },
  ).select("_id");
  if (!updatedUser) return next(appError.create("OTP has expired. Please request a new code.", Fail, 400));
  disconnectUserSockets(updatedUser._id);
  return res.status(200).json({ status: Success, message: "Password has been reset successfully" });
});

const refreshToken = Wrapper(async (req, res, next) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    clearSessionCookies(res);
    return next(appError.create("No refresh token provided", Fail, 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getSecret("REFRESH_SECRET"), { algorithms: ["HS256"] });
  } catch {
    clearSessionCookies(res);
    return next(appError.create("Invalid or expired refresh token", Fail, 401));
  }

  if (decoded.type !== "refresh" || !decoded.id || !Number.isInteger(decoded.tokenVersion)) {
    clearSessionCookies(res);
    return next(appError.create("Invalid refresh token", Fail, 401));
  }

  const candidateHash = hashToken(token);
  const loadUser = () =>
    User.findById(decoded.id).select("+refreshTokenHash +prevRefreshTokenHash +prevRefreshRotatedAt +tokenVersion");
  const versionMatches = (u) => Boolean(u) && (decoded.tokenVersion ?? 0) === (u.tokenVersion ?? 0);
  const isCurrentToken = (u) => Boolean(u?.refreshTokenHash && safeEqual(u.refreshTokenHash, candidateHash));
  // The token that was rotated away a moment ago (e.g. a second tab refreshing at
  // the same time) is still honoured briefly instead of logging the user out.
  const isRecentlyRotated = (u) =>
    Boolean(
      u?.prevRefreshTokenHash &&
        u.prevRefreshRotatedAt &&
        safeEqual(u.prevRefreshTokenHash, candidateHash) &&
        Date.now() - u.prevRefreshRotatedAt.getTime() <= REFRESH_GRACE_MS,
    );

  const rejectSession = () => {
    clearSessionCookies(res);
    return next(appError.create("Invalid or expired refresh token", Fail, 401));
  };

  // Grace path: issue a fresh access token only. Do not rotate the refresh token
  // (the winning request already set the new one) and never clear cookies.
  const respondAccessOnly = (u) => {
    const accessToken = jwt.sign(
      { id: u._id.toString(), email: u.email, role: u.role, tokenVersion: u.tokenVersion || 0, type: "access" },
      getSecret("SECRET_ACCESS_KEY"),
      { expiresIn: ACCESS_TOKEN_TTL, algorithm: "HS256" },
    );
    res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookieOptions(), maxAge: ACCESS_COOKIE_TTL });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ status: Success, data: { refreshed: true, user: safeUser(u) } });
  };

  const user = await loadUser();
  if (!versionMatches(user)) return rejectSession();
  if (isRecentlyRotated(user)) return respondAccessOnly(user);
  if (!isCurrentToken(user)) return rejectSession();

  const rotatedSession = await rotateRefreshSession(user, token);
  if (!rotatedSession) {
    // Lost a simultaneous rotation: re-read and accept if we are in the grace window.
    const fresh = await loadUser();
    if (versionMatches(fresh) && isRecentlyRotated(fresh)) return respondAccessOnly(fresh);
    return rejectSession();
  }

  setSessionCookies(res, rotatedSession.accessToken, rotatedSession.refreshToken);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    status: Success,
    data: { refreshed: true, user: safeUser(user) },
  });
});

const createSocketTicket = Wrapper(async (req, res, next) => {
  const userId = req.currentUser?.id;
  const tokenVersion = req.currentUser?.tokenVersion;
  if (!userId || !Number.isInteger(tokenVersion)) {
    return next(appError.create("Authentication required", Fail, 401));
  }

  const user = await User.findById(userId).select("_id +tokenVersion");
  if (!user || (user.tokenVersion ?? 0) !== tokenVersion) {
    return next(appError.create("Authentication required", Fail, 401));
  }

  const ticket = crypto.randomBytes(32).toString("base64url");
  await SocketTicket.create({
    tokenHash: hashToken(ticket),
    user: user._id,
    tokenVersion,
    expiresAt: new Date(Date.now() + 60 * 1000),
  });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    status: Success,
    data: { ticket, expiresIn: 60 },
  });
});

const logout = Wrapper(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  let revokedUserId = null;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, getSecret("REFRESH_SECRET"), { algorithms: ["HS256"] });
      if (decoded?.type === "refresh" && decoded.id && Number.isInteger(decoded.tokenVersion)) {
        // Compare-and-swap prevents logout racing a refresh rotation or newer login.
        const revokedUser = await User.findOneAndUpdate(
          {
            _id: decoded.id,
            tokenVersion: decoded.tokenVersion,
            refreshTokenHash: hashToken(refreshToken),
          },
          {
            $set: { refreshTokenHash: null },
            $inc: { tokenVersion: 1 },
          },
          { new: true },
        ).select("_id");
        if (revokedUser) revokedUserId = revokedUser._id;
      }
    } catch {
      // Fall through to the access-token fallback. Cookies are always cleared.
    }
  }

  // A refresh cookie may be missing or stale while the short-lived access
  // cookie is still valid. Revoke only the matching tokenVersion so a newer
  // login in another tab/device cannot be invalidated by an older logout.
  if (!revokedUserId) {
    const accessToken = req.cookies?.[ACCESS_COOKIE];
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, getSecret("SECRET_ACCESS_KEY"), {
          algorithms: ["HS256"],
        });
        if (decoded?.type === "access" && decoded.id && Number.isInteger(decoded.tokenVersion)) {
          const revokedUser = await User.findOneAndUpdate(
            { _id: decoded.id, tokenVersion: decoded.tokenVersion },
            {
              $set: { refreshTokenHash: null },
              $inc: { tokenVersion: 1 },
            },
            { new: true },
          ).select("_id");
          if (revokedUser) revokedUserId = revokedUser._id;
        }
      } catch {
        // An invalid/expired access token cannot identify a session to revoke.
      }
    }
  }

  if (revokedUserId) disconnectUserSockets(revokedUserId);
  clearSessionCookies(res);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ status: Success, message: "Logged out successfully" });
});

export {
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
};
