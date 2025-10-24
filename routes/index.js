import { Router } from "express";
import authRouter from "./auth.routes.js";
import userRouter from "./user.routes.js";
import adminRouter from "./admin.routes.js";
import productRouter from "./product.routes.js";
import paymentRouter from "./payment.routes.js";
import trackingRouter from "./tracking.routes.js";
import contactRouter from "./contact.routes.js";
import couponRouter from "./coupon.routes.js"
import notificationRouter from './notification.routes.js';
import productsRouter from './products.routes.js';
import bulkOrderRouter from "./bulkorder.routes.js"
import reviewRouter from './review.routes.js';
import walletRouter from './wallet.routes.js';
import taxRouter from './tax.routes.js';
import categoryRouter from './category.routes.js'
import subcategoryRouter from './subcategory.routes.js'
import blogRouter from './blog.routes.js'
import grievanceRouter from './grievance.routes.js'
import testimonialRouter from './testimonial.routes.js'
import reelsRouter from './reel.routes.js'
import shippingRouter from './shipping.routes.js'

const router = Router();
router.use("/auth", authRouter);
router.use("/users", userRouter);
router.use("/admin", adminRouter);
router.use("/product", productRouter);
router.use("/payment", paymentRouter);
router.use("/track", trackingRouter);
router.use("/contact", contactRouter);
router.use("/coupon", couponRouter)
router.use("/notifications",notificationRouter)
router.use("/products",productsRouter)
router.use("/bulk-orders",bulkOrderRouter)
router.use("/reviews", reviewRouter);
router.use("/wallet", walletRouter);
router.use("/tax", taxRouter);
router.use("/categories", categoryRouter);
router.use("/subcategories", subcategoryRouter);
router.use("/blogs", blogRouter);
router.use("/grievances", grievanceRouter);
router.use("/testimonials", testimonialRouter);
router.use("/reels", reelsRouter);
router.use("/shipping", shippingRouter);


export default router;
