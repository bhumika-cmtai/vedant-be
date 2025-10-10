import { Router } from "express";
import {
    createBlogPost,
    getAllPublishedBlogs,
    getBlogBySlug,
    getAllBlogs,
    updateBlogPost,
    deleteBlogPost,
} from "../controllers/blog.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";

import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route("/").get(getAllPublishedBlogs);

router.route("/all").get(getAllBlogs);
router.route("/:slug").get(getBlogBySlug);

router.route("/create").post(
    authMiddleware,
    adminMiddleware,
    upload.single("featuredImage"), 
    createBlogPost
);

router.route("/update/:blogId").patch(authMiddleware,
    adminMiddleware,
    upload.single("featuredImage"), 
    updateBlogPost);
router.route("/delete/:blogId").delete(authMiddleware,
    adminMiddleware,deleteBlogPost);

export default router;