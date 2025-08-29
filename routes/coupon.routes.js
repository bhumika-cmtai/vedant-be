import { Router } from "express";
import {
    createCoupon,
    getAllCoupons,
    getCouponByCode,
    updateCoupon,
    deleteCoupon
} from "../controllers/coupon.controller.js";
// import { verifyJWT } from "../middlewares/auth.middleware.js"; // Assuming you have this middleware

const router = Router();

// --- Secure all coupon routes ---
// This middleware will run for all routes defined below
// router.use(verifyJWT);

// --- Routes for creating and fetching all coupons ---
router.route("/")
    .post(createCoupon)
    .get(getAllCoupons);

// --- Routes for updating and deleting a specific coupon ---
router.route("/:couponId")
    .patch(updateCoupon) // PATCH is suitable for partial updates
    .delete(deleteCoupon);

router.route('/code/:code').get(getCouponByCode);

export default router;