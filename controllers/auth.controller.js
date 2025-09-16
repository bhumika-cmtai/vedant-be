import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { sendEmail } from "../utils/mailer.js";
import crypto from "crypto";

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if ([name, email, password].some((field) => !field || field.trim() === "")) {
    throw new ApiError(400, "Name, email, and password are required");
  }

  // --- Yahan se internal try...catch block hata diya gaya hai ---
  
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    // Agar user pehle se hai, to seedha error bhejo.
    // asyncHandler is error ko pakad kar client ko bhej dega.
    throw new ApiError(409, "User with this email already exists. Please login.");
  }

  // Naya user banane ka process
  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const emailHtml = `
  <div style="font-family: sans-serif; text-align: center; padding: 20px;">
    <h2>Welcome to Florawear!</h2>
    <p>Hi ${name},</p>
    <p>Thank you for registering. Please use the following OTP to verify your email address. This OTP is valid for 10 minutes.</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; background-color: #f0f0f0; padding: 10px 20px; border-radius: 5px; display: inline-block;">
    ${otp}
    </p>
    <p>If you did not request this, please ignore this email.</p>
  </div>
  `;

  await User.create({
    fullName: name,
    email,
    password,
    role: role && role.toLowerCase() === "admin" ? "admin" : "user",
    otp,
    otpExpiry,
    isVerified: false,
  });

  await sendEmail(email, "Verify Your Email Address", emailHtml);

  return res.status(201).json(new ApiResponse(201, { email }, "User registered. Please check your email for OTP."));
});

const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    console.error("Missing email or OTP:", { email, otp });
    throw new ApiError(400, "Email and OTP are required");
  }

  console.log("Received OTP verification request:", { email, otp }); // Debug log

  const user = await User.findOne({
    email,
    otp,
    otpExpiry: { $gt: Date.now() },
  }).select("+otp +otpExpiry");

  if (!user) {
    console.error("OTP verification failed: Invalid or expired OTP for email", email);
    throw new ApiError(400, "Invalid or expired OTP.");
  }
  user.isVerified = true;
  user.otp = undefined;
  user.otpExpiry = undefined;
  await user.save({ validateBeforeSave: false });
  

  const accessToken = user.generateAccessToken();
  console.log("this is access token ", accessToken)
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "none" 
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .json(
      new ApiResponse(200, { user: loggedInUser, accessToken }, "Email verified. You are now logged in.")
    );
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, "Email and password are required");

  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new ApiError(404, "User with this email does not exist.");
  if (!user.isVerified) throw new ApiError(403, "Email not verified. Please verify your account first.");

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Invalid user credentials.");

  const accessToken = user.generateAccessToken();
  console.log("---accessToken---")
  console.log(accessToken)
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  };

  return res.status(200).cookie("accessToken", accessToken, options)
    .json(new ApiResponse(200, { user: loggedInUser, accessToken }, "User logged in successfully"));
});

const logoutUser = asyncHandler(async (req, res) => {
  // The verifyJWT middleware has already attached the user to the request.
  // We just need to clear the cookie.

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  };

  return res
    .status(200)
    .clearCookie("accessToken", options) // Clear the accessToken cookie
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});


const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "If a user with this email exists, a password reset link has been sent."));
  }

  const resetToken = user.getForgotPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const emailHtml = `
    <div style="font-family: sans-serif; text-align: center; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px; margin: auto;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p style="color: #555; font-size: 16px;">Hi ${user.fullName},</p>
      <p style="color: #555; font-size: 16px;">You requested a password reset for your Chia Seeds E-commerce account. Please click the button below to set a new password. This link is valid for 10 minutes.</p>
      <a href="${resetUrl}" style="background-color: #878fba; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; margin: 20px 0;">
        Reset Password
      </a>
      <p style="color: #555; font-size: 16px;">If you did not request a password reset, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #999;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="font-size: 12px; color: #999; word-break: break-all;">${resetUrl}</p>
    </div>
  `;

  try {
    await sendEmail(email, "Password Reset Request", emailHtml);
    return res
      .status(200)
      .json(new ApiResponse(200, {}, "A password reset link has been sent to your email."));
  } catch (error) {
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(500, "Failed to send password reset email. Please try again later.");
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!password) throw new ApiError(400, "New password is required");

  const forgotPasswordToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ forgotPasswordToken, forgotPasswordExpiry: { $gt: Date.now() } });
  if (!user) throw new ApiError(400, "Invalid or expired password reset token.");

  user.password = password;
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;
  await user.save();
  return res.status(200).json(new ApiResponse(200, {}, "Password has been reset successfully."));
});

const changeCurrentUserPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) throw new ApiError(400, "Old password and new password are required");

  const user = await User.findById(req.user._id).select("+password");
  if (!user) { throw new ApiError(404, "User not found"); }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) { throw new ApiError(401, "Invalid old password"); }

  user.password = newPassword;
  await user.save();
  return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully."));
});

export {
  registerUser,
  verifyOtp,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  changeCurrentUserPassword,
};
