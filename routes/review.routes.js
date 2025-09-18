import { Router } from 'express';
import { createReview, getProductReviews, deleteReview } from '../controllers/review.controller.js';
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js"; // Import multer

const router = Router();

router.route("/product/:productId").get(getProductReviews);

router.use(authMiddleware);

router.route("/product/:productId").post(
    upload.fields([{ name: 'images', maxCount: 3 }]), 
    createReview
);

router.route("/:reviewId").delete(deleteReview);

export default router;
