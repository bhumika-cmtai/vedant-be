import { Router } from 'express';
import {
    createReview,
    getProductReviews,
    deleteReview
} from '../controllers/review.controller.js';
import { authMiddleware } from "../middlewares/auth.middleware.js";


const router = Router();


// Public route to get all reviews for a specific product
router.route("/product/:productId").get(getProductReviews);

// Protected routes - User must be logged in
router.use(authMiddleware);

router.route("/product/:productId").post(createReview);
router.route("/:reviewId").delete(deleteReview);

export default router;