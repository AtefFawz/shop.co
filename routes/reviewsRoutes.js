import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
import { createRateLimit } from "../middlewares/rateLimit.js";
const reviewsRouter = express.Router();
import {
  addReview,
  getAllReviews,
  deleteReview,
} from "../controllers/reviewsController.js";
// Check if the user is authenticated before allowing access to review routes
reviewsRouter.use(verifyToken);

const reviewCreateLimiter = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  namespace: "review-create",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});
const reviewDeleteLimiter = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  namespace: "review-delete",
  store: "mongo",
  keyGenerator: (req) => `user:${req.currentUser?.id || "unknown"}`,
});

// Route to add a review for a product
reviewsRouter.post("/add", reviewCreateLimiter, addReview);

// Route to delete a review
reviewsRouter.delete("/delete/:id", reviewDeleteLimiter, deleteReview);

// Route to get a review by ID
// reviewsRouter.get("/:id", getReviewById);

// Route to get all reviews
reviewsRouter.get("/", getAllReviews);

// Additional routes for reviews can be added here (e.g., get reviews, delete review, etc.)
export { reviewsRouter };
