const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
let validator = require("validator");
const User = require("../modules/userSchema");
const { Success, Error, Fail } = require("../utils/httpText");
const Meddle = require("../middlewares/meddle");
const appError = require("../utils/appError");
const { USER } = require("../utils/role");

// Sign Up Process
const signUp = Meddle(async (req, res, next) => {
  // Extract user from Request
  let { fullName, email, password, role } = req.body;

  // Validate input
  if (!fullName || !email || !password) {
    return next(appError.create("All fields are required", Fail, 400));
  }

  // Normalize email to ensure consistency
  email = validator.normalizeEmail(email) || email;

  // Validate password strength
  const isStrong = validator.isStrongPassword(password);
  if (!isStrong) {
    return next(
      appError.create(
        "Password must be at least 8 characters and include upper, lower, numbers, and symbols.",
        Fail,
        400,
      ),
    );
  }

  const score = validator.isStrongPassword(password, { returnScore: true });
  console.log("Password strength score:", score);

  // Step 1: Find In Data base
  let FindUser = await User.findOne({ email: email });

  //step 2- Check if the data exists in the database before saving
  if (FindUser) {
    return next(
      appError.create(
        "This email is unavailable for registration. If you own this account, please try logging in.",
        Fail,
        400,
      ),
    );
  }

  // Step 3: Hash password before storing in the database
  const hash = await bcrypt.hash(password, 10);

  // Handle avatar upload, if provided. If no file is uploaded, use a default avatar.
  const avatarName = req.file ? req.file.filename : "default-avatar.png";

  //  New user
  const newUser = new User({
    fullName,
    email,
    password: hash,
    role: role || USER,
    avatar: avatarName,
  });

  //Step 4: Save user to the DB
  await newUser.save();

  // Token JWT
  const token = jwt.sign(
    { email: newUser.email, id: newUser._id, role: newUser.role },
    process.env.SECRET_KEY,
    { expiresIn: "60m" },
  );

  res.status(201).json({ status: Success, data: { user: newUser, token } });
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

  // 4. Generate JWT Token
  const token = jwt.sign(
    { email: user.email, id: user._id, role: user.role },
    process.env.SECRET_KEY,
    { expiresIn: "60m" },
  );

  res.status(200).json({
    status: Success,
    data: {
      token,
      user: {
        fullName: user.fullName,
        role: user.role || USER,
        avatar: user.avatar,
      },
    },
  });
});

const users = Meddle(async (req, res, next) => {
  // بنجيب كل اليوزرز بس بنخفي الـ Password للأمان
  const allUsers = await User.find({}, "-password").sort({ createdAt: -1 });

  if (!allUsers) {
    return next(appError.create("Failed to retrieve users", Fail, 500));
  }
  console.log(allUsers);

  if (allUsers.length === 0) {
    return res.status(200).json({
      status: Success,
      message: "No users found",
      data: { users: [] },
    });
  }

  res.status(200).json({
    status: "Success",
    data: { users: allUsers },
  });
});
module.exports = {
  signUp,
  signIn,
  users,
};
