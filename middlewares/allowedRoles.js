import appError from "../utils/appError.js";
import { Fail } from "../utils/httpText.js";

const allowedRoles = (...roles) => (req, res, next) => {
  if (!req.currentUser?.role) {
    return next(appError.create("Unauthorized: Please login first", Fail, 401));
  }
  if (roles.includes(req.currentUser.role)) return next();
  return next(
    appError.create(
      "Access Denied: You do not have the required permissions",
      Fail,
      403,
    ),
  );
};

export default allowedRoles;
