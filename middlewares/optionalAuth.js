import verifyToken from "./verifyToken.js";

// For public endpoints that personalise their answer when a valid session exists.
// A missing or invalid token simply means "anonymous"; it never produces a 401.
const optionalAuth = (req, res, next) => {
  const hasCredentials = req.get("authorization") || req.cookies?.accessToken;
  if (!hasCredentials) return next();
  return verifyToken(req, res, () => next());
};

export default optionalAuth;
