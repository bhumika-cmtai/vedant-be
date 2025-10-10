import { Router } from 'express';
import { getTaxConfig, setTaxConfig } from '../controllers/tax.controller.js';
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";

const router = Router();

// --- ADMIN-ONLY ROUTES ---
// router.use(authMiddleware, adminMiddleware);

router.route("/config")
    .get(getTaxConfig)
    .put(setTaxConfig);

export default router;