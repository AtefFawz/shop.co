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
    { email: user.email, id: user._id, role: user.role },
    process.env.SECRET_KEY,
    { expiresIn: "1m" },
  );

  const refreshToken = jwt.sign(
    { email: user.email, id: user._id, role: user.role },
    process.env.SECRET_KEY,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};

// Sign Up Process
const signUp = Meddle(async (req, res, next) => {
  let { fullName, email, password, role } = req.body;

  // 1. Validation
  if (!fullName || !email || !password) {
    return next(appError.create("All fields are required", Fail, 400));
  }

  if (!validator.isStrongPassword(password)) {
    return next(appError.create("Password is too weak.", Fail, 400));
  }

  // 2. Check Duplicate
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(appError.create("Email already registered.", Fail, 400));
  }

  // 3. Hash & Avatar
  const hash = await bcrypt.hash(password, 10);
  const avatarName =
    req.file?.path || "https://res.cloudinary.com/.../default.png";

  // 4. Create & Save
  const newUser = new User({
    fullName,
    email,
    password: hash,
    role: USER,
    avatar: avatarName,
  });
  await newUser.save();

  // 5. Tokens Management
  const { accessToken, refreshToken } = generateTokens(newUser);

  // Set Refresh Token in Secure Cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // 6. Response
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

  // 1. Validate input
  if (!email || !password) {
    return next(appError.create("Email and password are required", Fail, 400));
  }

  // 2. Check if user exists
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  // 3. Compare hashed passwords
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return next(appError.create("Invalid email or password", Fail, 401));
  }

  // 4. Generate JWT Tokens
  const { accessToken, refreshToken } = generateTokens(user);

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

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
    return next(appError.create("No refresh token provided", Fail, 401));
  }

  // Verify the refresh token
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return next(appError.create("Invalid refresh token", Fail, 401));
    }

    const newToken = jwt.sign(
      { email: decoded.email, id: decoded.id, role: decoded.role },
      process.env.SECRET_KEY,
      { expiresIn: "15m" },
    );

    res.status(200).json({ status: Success, data: { token: newToken } });
  });
});

// Logout Process
const logout = Meddle(async (req, res, next) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "None",
  });
  res.status(200).json({ status: Success, message: "Logged out successfully" });
});

module.exports = {
  signUp,
  signIn,
  refreshToken,
  logout,
};
