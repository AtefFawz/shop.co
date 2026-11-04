import express from "express";
import {
  getMe,
  updateUser,
  getMyOrders,
  getMyReviews,
} from "../controllers/profileController.js";
import verifyToken from "../middlewares/verifyToken.js";
import { upload } from "../middlewares/multer.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
const profileUploadLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  namespace: "profile-upload",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || req.ip || "unknown"}`,
});
const profileRoutes = express.Router();
profileRoutes.use(verifyToken);
profileRoutes.get("/me", getMe);
profileRoutes.get("/my-orders", getMyOrders);
profileRoutes.get("/my-reviews", getMyReviews);
profileRoutes.patch("/me/update", profileUploadLimiter, upload.single("avatar"), updateUser);

export { profileRoutes };
