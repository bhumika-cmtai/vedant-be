import { Router } from 'express';
import { 
    getWalletConfig,
    setWalletConfig,
    getWalletBalance,
} from '../controllers/wallet.controller.js';
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";

const router = Router();
router.use(authMiddleware);

// --- User Routes ---
router.route("/balance").get(getWalletBalance);

// --- Shared GET, Admin-only PUT ---
router.route("/config")
    .get(getWalletConfig)
    .put(adminMiddleware, setWalletConfig);

export default router;