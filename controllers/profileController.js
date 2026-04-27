const Meddle = require("../middlewares/meddle");
const user = require("../modules/userSchema");

const getMe = Meddle(async (req, res, next) => {
  const userId = req.currentUser?._id || req.currentUser?.id;
  console.log("User ID: ", userId);

  if (!userId) {
    return next(
      appError.create("Authentication failed, please login again", "Fail", 401),
    );
  }

  const result = await user.findById(userId).populate("orders reviews");

  console.log("User found: ", result);

  res.status(200).json({
    status: "Success",
    data: {
      user: result,
    },
  });
});

module.exports = { getMe };
