import appError from "../utils/appError.js";
import { Fail } from "../utils/httpText.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const getTrustedOrigins = () =>
  [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ORIGINS || "").split(","),
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : []),
  ]
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value.trim()).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const requireTrustedOrigin = (req, res, next) => {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return next();

  const originHeader = req.get("origin");
  const hasSessionCookie = Boolean(
    req.cookies?.accessToken ||
      req.cookies?.refreshToken ||
      req.cookies?.shopcoOAuthState,
  );
  const isAuthMutation = req.path.startsWith("/api/auth/") || req.baseUrl === "/api/auth";
  const hasBearerAuth = /^Bearer\s+[^\s]+$/i.test(req.get("authorization") || "");

  if (!originHeader) {
    // Cookie-authenticated browser mutations and authentication endpoints must
    // carry an Origin. Bearer-only native/server clients remain supported.
    if (hasSessionCookie || isAuthMutation || !hasBearerAuth) {
      return next(
        appError.create(
          "A trusted Origin header is required for this request",
          Fail,
          403,
        ),
      );
    }
    return next();
  }

  let origin;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    return next(appError.create("Invalid request Origin", Fail, 403));
  }

  if (!getTrustedOrigins().includes(origin)) {
    return next(
      appError.create(
        "Access Denied: You do not have the required permissions",
        Fail,
        403,
      ),
    );
  }

  return next();
};

export default requireTrustedOrigin;
