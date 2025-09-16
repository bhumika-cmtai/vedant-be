import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  verifyOtp,
  forgotPassword,
  resetPassword,
  changeCurrentUserPassword,
} from "../controllers/auth.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", registerUser);

// Baaki ke routes waise hi rahenge
router.route("/login").post(loginUser);
router.route("/logout").post(authMiddleware, logoutUser); 
router.route("/verify-otp").post(verifyOtp);
router.route("/forgot-password").post(forgotPassword);
router.route("/reset-password/:token").post(resetPassword);
router
  .route("/change-password")
  .post(authMiddleware, changeCurrentUserPassword);



export default router;
