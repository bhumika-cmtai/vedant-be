import { Router } from "express";
import {
    submitInquiry,
    getAllInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry
} from "../controllers/contact.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
// import { verifyJWT } from "../middlewares/auth.middleware.js"; // Assuming you have auth middleware for admin routes

const router = Router();

// =================================================================
// --- Public Route ---
// =================================================================
// The `upload.single("referenceImage")` middleware will look for a file in the
// form field named "referenceImage" and make it available as `req.file`.
router.route("/").post(
    upload.single("referenceImage"),
    submitInquiry
);

// =================================================================
// --- Admin Routes ---
// =================================================================
// All admin routes are protected by an authentication middleware (e.g., verifyJWT)
// router.use(verifyJWT);

router.route("/admin").get(getAllInquiries);

router.route("/admin/:inquiryId")
    .get(getInquiryById)
    .put(upload.single("referenceImage"), updateInquiry) // Also needs multer for image updates
    .delete(deleteInquiry);

export default router;