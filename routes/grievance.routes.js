// routes/grievance.routes.js
import { Router } from 'express';
import {
    createGrievance,
    getAllGrievances,
    getMyGrievances,
    getGrievanceById,
    updateGrievance,
} from '../controllers/grievance.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js'; // Assuming you have this
import { adminMiddleware } from '../middlewares/admin.middleware.js'; // Assuming you have this

const router = Router();

// --- User-facing routes (Authentication required) ---

// Create a new grievance
router.route("/").post(authMiddleware, createGrievance);

// Get all grievances for the currently logged-in user
router.route("/my").get(authMiddleware, getMyGrievances);

// Get a single grievance (user can only view their own)
router.route("/:id").get(authMiddleware, getGrievanceById);


// --- Admin-only routes (Authentication and Admin role required) ---
// Apply authMiddleware and adminMiddleware to all routes defined after this line
router.use(authMiddleware, adminMiddleware);

// Get all grievances (for admin dashboard)
router.route("/").get(getAllGrievances);

// Update grievance status or add admin response
router.route("/:id").put(updateGrievance);

export default router;