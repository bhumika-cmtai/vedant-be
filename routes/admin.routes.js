import { Router } from "express";
import {
  getAdminDashboardStats,
  getRecentAdminOrders,
  getSalesOverview,
  updateOrderStatus,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserOrders,
  getAllAdminOrders,
  getSingleAdminOrder
} from "../controllers/admin.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { getProductById } from "../controllers/user.controller.js";


const router = Router();
console.log("admin router reached")
// router.use(authMiddleware, adminMiddleware);

router.route("/dashboard").get(getAdminDashboardStats);
router.route("/sales-overview").get(getSalesOverview);

router.route("/orders/recent").get(getRecentAdminOrders);
router.route("/orders/:orderId/status").patch(updateOrderStatus);
router.route("/orders/all").get(getAllAdminOrders);

router.route("/products").post(
  upload.fields([
    {
      name: "images",
      maxCount: 5, // Allow up to 5 images
    },
    {
      name: "video",
      maxCount: 1, // Allow up to 1 video
    },
  ]),
  createProduct
);

// GET all products (with search/filter) & CREATE a new product
router
  .route("/products")
  .get(getAllProducts)
  .post(
    upload.fields([
      { name: "images", maxCount: 5 },
      { name: "video", maxCount: 1 },
    ]),
    createProduct
  );

  
  router
  .route("/products/:productId")
  .get(getProductById)
  .put(
    upload.fields([
      { name: "images", maxCount: 5 },
      { name: "video", maxCount: 1 },
    ]),
    updateProduct
  )
  .delete(deleteProduct);

  router.route("/users").get(getAllUsers);
  router.route("/users/:userId")
    .get(getUserById)
    .put(updateUser) // No multer needed as we're not uploading files
    .delete(deleteUser);
router.route("/users/:userId/orders").get(getUserOrders);

router.route("/orders/:orderId").get(getSingleAdminOrder);


export default router;
