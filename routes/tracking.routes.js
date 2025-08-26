import { Router } from "express";
import { trackOrder } from "../controllers/tracking.controller.js";
// import { retryShipment } from "../controllers/payment.controller.js"; // ✅ use from Razorpay file
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

// 📦 Track an order
router.route("/:orderId").get(authMiddleware, trackOrder);

// 🔁 Retry shipment manually
// router.route("/retry-shipment").post(authMiddleware, retryShipment); // ✅ added this

export default router;
