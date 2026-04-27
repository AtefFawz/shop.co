const appError = require("../utils/appError");
const { Fail } = require("../utils/httpText");

const allowedRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = req.currentUser.role;
    // Check if user's role is authorized
    if (roles.includes(userRole)) {
      // Grant access and proceed to next middleware
      next();
    } else {
      // Return 403 Forbidden if role is not allowed
      return next(
        appError.create(
          "Access Denied: You do not have the required permissions",
          Fail,
          403,
        ),
      );
    }
  };
};

module.exports = allowedRoles;
