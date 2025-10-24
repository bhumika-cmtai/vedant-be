import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { checkServiceability,trackOrder } from "../controllers/shipping.controller.js";

const router = Router();
router.use(authMiddleware);

router.route("/serviceability").post(checkServiceability);
router.route("/track/:orderId").get(trackOrder);

export default router;
