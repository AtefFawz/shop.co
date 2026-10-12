import express from "express";
import {
  getMe,
  updateUser,
  getMyOrders,
  getMyReviews,
} from "../controllers/profileController.js";
import verifyToken from "../middlewares/verifyToken.js";
import { upload } from "../middlewares/multer.js";
const profileRouts = express.Router();
profileRouts.use(verifyToken);
profileRouts.get("/me", getMe);
profileRouts.get("/my-orders", getMyOrders);
profileRouts.get("/my-reviews", getMyReviews);
profileRouts.patch("/me/update", upload.single("avatar"), updateUser);

export { profileRouts };
