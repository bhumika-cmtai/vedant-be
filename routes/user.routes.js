"user.routes"
import { Router } from "express";
import {
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
  setDefaultAddress
} from "../controllers/user.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// This middleware requires the user to be authenticated for all subsequent routes.
router.use(authMiddleware);

// --- Profile Routes ---
router.route("/profile").get(getMyProfile).patch(updateMyProfile);
router.route("/profile/avatar").patch(upload.single("avatar"), updateUserAvatar);


// --- Address Routes ---
router.route("/address").get(getAddresses).post(addAddress);
router.route("/address/:addressId").patch(updateAddress).delete(deleteAddress);
router.route("/address/default/:addressId").patch(setDefaultAddress);

// --- Wishlist Routes ---
router.route("/wishlist").get(getWishlist).post(addToWishlist);
router.route("/wishlist/:productId").delete(removeFromWishlist);

// --- Cart Routes ---
router.route("/cart").get(getCart).post(addToCart);
router.route("/cart/item/:cartItemId").delete(removeFromCart); // Use a more specific path
router.route("/cart/item/quantity/:productId").patch(updateCartQuantity); // Use a more specific path

// --- Order Routes ---
router.route("/order").post(placeOrder); // For placing a new order
router.route("/orders").get(getMyOrders); // For getting all orders
router.route("/orders/:orderId").get(getSingleOrder); // For a single order

export default router;