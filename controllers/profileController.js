const mongoose = require("mongoose");
const Meddle = require("../middlewares/meddle");
const User = require("../modules/userSchema");
const appError = require("../utils/appError");
const { Success, Fail } = require("../utils/httpText");

const getMe = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return next(
      appError.create("Authentication failed, please login again", Fail, 401),
    );
  }

  const result = await User.findById(userId)
    .populate("orders reviews")
    .lean({ virtuals: true });

  if (!result) {
    return next(appError.create("User not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    data: {
      user: result,
    },
  });
});

const updateUser = Meddle(async (req, res, next) => {
  const currentUserId = req.currentUser?._id || req.currentUser?.id;

  if (!currentUserId || !mongoose.Types.ObjectId.isValid(currentUserId)) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }

  let { fullName } = req.body;
  let updateData = {};

  if (fullName && fullName.trim() !== "") {
    updateData.fullName = fullName.trim();
  }

  if (req.file) {
    updateData.avatar = req.file.path;
  }

  if (Object.keys(updateData).length == 0) {
    return next(
      appError.create("No valid fields provided for update", Fail, 400),
    );
  }

  const updatedUser = await User.findByIdAndUpdate(currentUserId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  console.log(updatedUser);
  if (!updatedUser) {
    return next(appError.create("User was not found", Fail, 404));
  }

  res.status(200).json({
    status: Success,
    message: "Profile updated successfully",
    data: { user: updatedUser },
  });
});

module.exports = { getMe, updateUser };
