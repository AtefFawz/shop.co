const express = require("express");
const verifyToken = require("../middlewares/verifyToken");
const reviewsRouter = express.Router();
const {
  addReview,
  getAllReviews,
  deleteReview,
  // getReviewById,
} = require("../controllers/reviewsController");
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
module.exports = { reviewsRouter };
