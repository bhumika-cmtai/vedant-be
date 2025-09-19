import { Router } from 'express';
import { 
    getWalletConfig,
    getWalletBalance,
    updatePointValue,
    addRewardRule,
    updateRewardRule,
    deleteRewardRule
} from '../controllers/wallet.controller.js';
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";

const router = Router();

// All routes in this file require a user to be logged in
router.use(authMiddleware);


router.route("/balance").get(getWalletBalance);

router.route("/config").get(getWalletConfig);

// --- ADMIN-ONLY ROUTES ---
router.use(adminMiddleware);

router.route("/config/point-value").patch(updatePointValue);

router.route("/config/rules").post(addRewardRule);

router.route("/config/rules/:minSpend").put(updateRewardRule);

router.route("/config/rules/:minSpend").delete(deleteRewardRule);


export default router;