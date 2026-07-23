const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
let validator = require("validator");
const User = require("../modules/userSchema");
const { Success, Error, Fail } = require("../utils/httpText");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const { USER } = require("../utils/role");

const generateTokens = (user) => {
  const payload = {
    id: user._id || user.id,
    email: user.email,
    role: user.role,
  };
  const accessToken = jwt.sign(payload, process.env.SECRET_ACCESS_KEY, {
    expiresIn: "15m",
  });

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

const setCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    path: "/",
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

// Refresh Token Process
const refreshToken = Meddle(async (req, res, next) => {
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
const logout = Meddle(async (req, res) => {
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

module.exports = {
  signUp,
  signIn,
  refreshToken,
  logout,
};
