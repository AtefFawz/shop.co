import express from "express";
import verifyToken from "../middlewares/verifyToken.js";
const reviewsRouter = express.Router();
import {
  addReview,
  getAllReviews,
  deleteReview,
  // getReviewById,
} from "../controllers/reviewsController.js";
// Check if the user is authenticated before allowing access to review routes
reviewsRouter.use(verifyToken);

// Route to add a review for a product
reviewsRouter.post("/add", addReview);

// Route to delete a review
reviewsRouter.delete("/delete/:id", deleteReview);

// Route to get a review by ID
// reviewsRouter.get("/:id", getReviewById);

// Route to get all reviews
reviewsRouter.get("/", getAllReviews);

// Additional routes for reviews can be added here (e.g., get reviews, delete review, etc.)
export { reviewsRouter };
