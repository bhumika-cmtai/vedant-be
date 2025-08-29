import { Router } from "express";
import { getAllProducts } from "../controllers/admin.controller.js";
import { getProductById, getProductBySlug, getProductsWithVideos } from "../controllers/user.controller.js";
const router = Router();


router.route("/")
                .get(getAllProducts)

                router.route("/videos")
                .get(getProductsWithVideos)

router.route("/:productId")
                .get(getProductById)

router.route("/slug/:slug")
                .get(getProductBySlug)




export default router