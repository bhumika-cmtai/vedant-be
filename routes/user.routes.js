import { Router } from "express";
import {
  getUserDashboardStats,
  getRecentUserOrders,
  getMyProfile,
  updateMyProfile,
  updateUserAvatar,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getCart,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  placeOrder,
  getMyOrders,
  getSingleOrder,
} from "../controllers/user.controller.js";
// NOTE: Make sure the name of your auth middleware is correct.
// In your controller, it's named 'protect'. Here it's 'authMiddleware'.
// I will use 'authMiddleware' as defined in this file.
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// This middleware requires the user to be authenticated for all subsequent routes.
router.use(authMiddleware);

// =================== FIX IS HERE ===================
// Dashboard routes must match the frontend API calls exactly.
router.route("/dashboard/stats").get(getUserDashboardStats); // Changed from "/dashboard-stats"
router.route("/orders/recent").get(getRecentUserOrders); // Changed from "/recent-orders"
// ===================================================

// Profile
router.route("/profile").get(getMyProfile).patch(updateMyProfile);
router
  .route("/profile/avatar")
  .patch(upload.single("avatar"), updateUserAvatar);

// Address
router.route("/address").get(getAddresses).post(addAddress);
router.route("/address/:addressId").patch(updateAddress).delete(deleteAddress);

// Wishlist
router.route("/wishlist").get(getWishlist).post(addToWishlist);
router.route("/wishlist/:productId").delete(removeFromWishlist);

// Cart
router.route("/cart").get(getCart).post(addToCart);
router.route("/cart/:cartItemId").delete(removeFromCart);
router.route("/cart/quantity/:productId").patch(updateCartQuantity);

// Orders
router.route("/orders").get(getMyOrders).post(placeOrder);
router.route("/orders/:orderId").get(getSingleOrder);

export default router;
