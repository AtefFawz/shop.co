import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import optionalAuth from "../middlewares/optionalAuth.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
import { getEngagements, saveProduct, removeSavedProduct, recordProductView, createPriceAlert, removePriceAlert, getRecommendations, getAdminFeatureInsights } from "../controllers/featureController.js";
import { getPersonalStylistLook } from "../controllers/personalStylistController.js";
import allowedRoles from "../middlewares/allowedRoles.js";
import { ADMIN, MANAGER } from "../utils/role.js";

const router = express.Router();
const limiter = createRateLimit({ windowMs: 60 * 1000, max: 90, namespace: "customer-features", store: "mongo", keyGenerator: (req) => (req.currentUser?.id ? `user:${req.currentUser.id}` : `ip:${req.ip || "unknown"}`) });
// Public, but personalised when a valid session cookie/token is present.
router.get("/recommendations", optionalAuth, limiter, getRecommendations);
const stylistLimiter = createRateLimit({ windowMs: 60 * 1000, max: 18, namespace: "personal-stylist", store: "mongo", keyGenerator: (req) => `ip:${req.ip || req.socket?.remoteAddress || "unknown"}` });
// Public catalogue-only styling endpoint: no account data or third-party model is accessed.
router.post("/stylist", stylistLimiter, getPersonalStylistLook);
router.use(verifyToken, limiter);
router.get("/me", getEngagements);
router.post("/saved/:productId", saveProduct);
router.delete("/saved/:productId", removeSavedProduct);
router.post("/recent/:productId", recordProductView);
router.post("/price-alerts/:productId", createPriceAlert);
router.delete("/price-alerts/:productId", removePriceAlert);
router.get("/admin/insights", allowedRoles(ADMIN, MANAGER), getAdminFeatureInsights);
export default router;
