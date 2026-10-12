import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import validator from "validator";
import User from "../modules/authSchema.js";
import { Success, Error, Fail } from "../utils/httpText.js";
import Wrapper from "../middlewares/wrapper.js";
import appError from "../utils/appError.js";
import { USER } from "../utils/role.js";
import { sendEmail } from "../utils/sendEmail.js";
import OTP from "../modules/optSchema.js";
import otpTime from "../utils/otpItem.js";
import validateUserOtp from "../utils/validateUserOtp.js";
const generateTokens = (user) => {
  const payload = {
    id: user._id || user.id,
    email: user.email,
    role: user.role,
  };

  // Generate Access Token and Refresh Token
  const accessToken = jwt.sign(payload, process.env.SECRET_ACCESS_KEY, {
    expiresIn: "15m",
  });

  // Generate Refresh Token
  const refreshToken = jwt.sign(
    {
      ...payload,
      type: "refresh",
    },
    process.env.REFRESH_SECRET,
    {
      expiresIn: "7d",
    },
  );

  return { accessToken, refreshToken };
};

// Set Cookie Options
const setCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: true,
    sameSite: isProduction ? "None" : "Lax",
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    path: "/",
  };
};

// Sign Up Process
const signUp = Wrapper(async (req, res, next) => {
  let { fullName, email, password, role } = req.body;

  if (!fullName || !email || !password) {
    return next(appError.create("All fields are required", Fail, 400));
  }

  if (!validator.isStrongPassword(password)) {
    return next(appError.create("Password is too weak.", Fail, 400));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(appError.create("Email already registered.", Fail, 400));
  }

  const hash = await bcrypt.hash(password, 10);
  const avatarName =
    req.file?.path ||
    "https://res.cloudinary.com/dudit0nty/image/upload/v1777336486/shop-co-uploads/cwmwfgwrwxxqlk65grw4.png";

  const newUser = new User({
    fullName,
    email,
    password: hash,
    role: USER,
    avatar: avatarName,
  });
  await newUser.save();

  const { accessToken, refreshToken } = generateTokens(newUser);

  res.cookie("refreshToken", refreshToken, setCookieOptions());

  res.status(201).json({
    status: Success,
    data: {
      token: accessToken,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        avatar: newUser.avatar,
      },
    },
  });
});

// Sign In Process
const signIn = Wrapper(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(appError.create("Email and password are required", Fail, 400));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  const isMatch = bcrypt.compare(password, user.password);
  if (!isMatch) {
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("refreshToken", refreshToken, setCookieOptions());

  return res.status(200).json({
    status: Success,
    data: {
      token: accessToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    },
  });
});

// Google Auth Callback Controller
const googleCallback = Wrapper(async (req, res, next) => {
  const user = req.user;
  if (!user) {
    return next(appError.create("Google authentication failed", Fail, 401));
  }

  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("refreshToken", refreshToken, setCookieOptions());

  const frontendURL = process.env.CLIENT_URL;

  return res.redirect(
    `${frontendURL}/auth/success?token=${accessToken}&role=${user.role}`,
  );
});

// 1. Forget Password
const forgetPassword = Wrapper(async (req, res, next) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    return next(appError.create("Valid email is required", Fail, 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(appError.create("User not found with this email", Fail, 404));
  }

  //  Check OTP request limits and cooldown
  await otpTime(user);

  // Generate a 6-digit OTP and hash it
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashingOtp = await bcrypt.hash(otp, 10);

  // Store the hashed OTP in the database with an expiration time of 10 minutes
  await OTP.findOneAndUpdate(
    { email: user.email },
    { otp: hashingOtp, attempts: 0, createdAt: new Date() },
    { upsert: true },
  );

  try {
    await sendEmail({
      email: user.email,
      subject: "Shop.co - Password Reset OTP",
      message: `Welcome to Shop.co!\nYour password reset code is: ${otp}\nThis code is valid for 10 minutes.`,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    // If email sending fails, we should decrement the otpDailyCount and reset lastOtpRequest to allow the user to try again without being penalized.
    user.otpDailyCount = Math.max(0, (user.otpDailyCount || 1) - 1);
    user.lastOtpRequest = null;
    await user.save();
    return next(
      appError.create("Failed to send email. Please try again.", Fail, 500),
    );
  }

  return res.status(200).json({
    status: Success,
    message: "Password reset OTP has been sent to your email",
  });
});

// 2. Verify OTP
const verifyOtp = Wrapper(async (req, res, next) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return next(appError.create("Email and OTP are required", Fail, 400));
  }

  await validateUserOtp(email, otp);

  return res.status(200).json({
    status: Success,
    message: "OTP verified successfully",
  });
});

// 3. Reset Password
const resetPassword = Wrapper(async (req, res, next) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return next(
      appError.create("Email, OTP, and new password are required", Fail, 400),
    );
  }

  // Validate the OTP and ensure it's correct and not expired
  await validateUserOtp(email, otp);

  const hashedPassword = await bcrypt.hash(String(newPassword), 10);

  // Update the user's password and delete the OTP record in parallel
  const [user] = await Promise.all([
    User.findOneAndUpdate(
      { email: String(email) },
      { password: hashedPassword },
    ).select("_id"),
    OTP.deleteOne({ email: String(email) }),
  ]);

  if (!user) {
    return next(appError.create("User not found", Fail, 404));
  }

  return res.status(200).json({
    status: Success,
    message: "Password has been reset successfully",
  });
});

// Refresh Token Process
const refreshToken = Wrapper(async (req, res, next) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    return next(appError.create("No refresh token provided", Fail, 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.REFRESH_SECRET);

    if (decoded.type !== "refresh") {
      return next(appError.create("Invalid refresh token", Fail, 401));
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return next(appError.create("User not found", Fail, 404));
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    res.cookie("refreshToken", newRefreshToken, setCookieOptions());

    return res.status(200).json({
      status: Success,
      data: {
        token: accessToken,
      },
    });
  } catch (error) {
    return next(appError.create("Invalid or expired refresh token", Fail, 401));
  }
});

// Logout Process
const logout = Wrapper(async (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    path: "/",
  });

  return res.status(200).json({
    status: Success,
    message: "Logged out successfully",
  });
});

export {
  signUp,
  signIn,
  refreshToken,
  logout,
  googleCallback,
  forgetPassword,
  verifyOtp,
  resetPassword,
};
