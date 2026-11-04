import { localeFrom, translate } from "../utils/i18n.js";

const localeMiddleware = (req, res, next) => {
  const requestedLocale =
    req.query?.lang || req.get("x-locale") || req.get("accept-language") || "en";
  req.locale = localeFrom(requestedLocale);
  res.locals.locale = req.locale;
  if (req.path.startsWith("/api/auth/")) res.setHeader("Cache-Control", "no-store");

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      if (typeof payload.message === "string") {
        payload.message = translate(payload.message, req.locale);
      }
      if (typeof payload.errorText === "string") {
        payload.errorText = translate(payload.errorText, req.locale);
      }
    }
    return originalJson(payload);
  };

  res.setHeader("Content-Language", req.locale);
  next();
};

export default localeMiddleware;
