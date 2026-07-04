const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
let validator = require("validator");
const User = require("../modules/userSchema");
const { Success, Error, Fail } = require("../utils/httpText");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const { USER } = require("../utils/role");

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { email: user.email, id: user._id || user.id, role: user.role },
    process.env.SECRET_KEY,
    { expiresIn: "1m" },
  );

  const refreshToken = jwt.sign(
    {
      email: user.email,
      id: user._id || user.id,
      role: user.role,
      type: "refresh",
    },
    process.env.SECRET_KEY,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};
const setCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    path: "/",
    domain: isProduction ? ".vercel.app" : undefined,
  };
};

// Sign Up Process
const signUp = Meddle(async (req, res, next) => {
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
    req.file?.path || "https://res.cloudinary.com/.../default.png";

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
const signIn = Meddle(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(appError.create("Email and password are required", Fail, 400));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("refreshToken", refreshToken, setCookieOptions());

  res.status(200).json({
    status: Success,
    data: {
      token: accessToken,
      user: {
        fullName: user.fullName,
        role: user.role,
        avatar: user.avatar,
      },
    },
  });
});

// Refresh Token Process

const refreshToken = Meddle(async (req, res, next) => {
  const token = req.cookies.refreshToken;

  if (!token) {
    console.log("❌ No refresh token found in cookies");
    return next(appError.create("No refresh token provided", Fail, 401));
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err || !decoded || decoded.type !== "refresh") {
      console.log(
        "❌ JWT Verification failed or token type mismatch:",
        err?.message,
      );
      return next(appError.create("Invalid refresh token", Fail, 401));
    }

    const userPayload = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    const { accessToken: newToken, refreshToken: newRefreshToken } =
      generateTokens(userPayload);

    res.cookie("refreshToken", newRefreshToken, setCookieOptions());

    return res.status(200).json({
      status: Success,
      data: { token: newToken },
    });
  });
});

// Logout Process
const logout = Meddle(async (req, res, next) => {
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
    path: "/",
    domain: isProduction ? ".vercel.app" : "localhost",
  });
  res.status(200).json({ status: Success, message: "Logged out successfully" });
});

module.exports = {
  signUp,
  signIn,
  refreshToken,
  logout,
};
