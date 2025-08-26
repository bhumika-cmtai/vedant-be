// src/routes/product.routes.js (NEW FILE)

import { Router } from "express";
// Admin controller se sirf zaroori function import karein
import { getAllProducts } from "../controllers/admin.controller.js";

const router = Router();

router.route("/").get(getAllProducts);


export default router;