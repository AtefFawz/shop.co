import jwt from "jsonwebtoken";
import User from "../models/authSchema.js";
import appError from "../utils/appError.js";
import { Fail } from "../utils/httpText.js";

const verifyToken = async (req, res, next) => {
  // Everything behind authentication is per-user data; never let a proxy/CDN cache it.
  res.setHeader("Cache-Control", "no-store");
  const authHeader = req.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+([^\s]+)$/i);
  if (authHeader && !bearerMatch) {
    return next(appError.create("Invalid Authorization Format", Fail, 401));
  }

  // Browser sessions use an HttpOnly cookie. Bearer tokens remain supported
  // for explicitly integrated native/server clients.
  const token = bearerMatch?.[1] || req.cookies?.accessToken;
  if (!token) return next(appError.create("Token is required", Fail, 401));

  try {
    const decoded = jwt.verify(token, process.env.SECRET_ACCESS_KEY, {
      algorithms: ["HS256"],
    });

    if (
      decoded?.type !== "access" ||
      !decoded?.id ||
      !Number.isInteger(decoded.tokenVersion) ||
      decoded.tokenVersion < 0
    ) {
      return next(appError.create("Invalid Token", Fail, 401));
    }

    const user = await User.findById(decoded.id).select("role +tokenVersion");
    if (!user || (decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return next(appError.create("Invalid Token", Fail, 401));
    }

    // Use current database role, not a potentially stale role embedded in a JWT.
    req.currentUser = {
      id: user._id.toString(),
      _id: user._id,
      role: user.role,
      email: decoded.email,
      tokenVersion: decoded.tokenVersion,
    };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return next(appError.create("Invalid Token", Fail, 401));
    }
    next(error);
  }
};

export default verifyToken;
