import { Router } from "express";
import {
    submitInquiry,
    getAllInquiries,
    getInquiryById,
    updateInquiry,
    deleteInquiry
} from "../controllers/contact.controller.js";

const router = Router();

router.route("/").post(submitInquiry);



router.route("/admin").get(getAllInquiries);

router.route("/admin/:inquiryId")
    .get(getInquiryById)
    .put(updateInquiry) 
    .delete(deleteInquiry);

export default router;
