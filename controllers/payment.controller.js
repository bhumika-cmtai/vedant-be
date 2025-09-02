// payment.controller.js

import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import { Product } from "../models/product.model.js";
import { Coupon } from "../models/coupon.model.js";
import { sendOrderConfirmationEmail } from "../services/emailService.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function for Razorpay refunds
const initiateRazorpayRefund = async (paymentId, amountInPaisa) => {
  try {
    return await razorpay.payments.refund(paymentId, {
      amount: amountInPaisa,
      speed: "normal",
      notes: { reason: "Order cancelled by customer or admin." },
    });
  } catch (error) {
    if (error.error?.description?.includes("already been fully refunded")) {
      return {
        status: "processed",
        id: "already_refunded",
        amount: amountInPaisa,
      };
    }
    throw new Error(`Refund failed: ${error.error ? JSON.stringify(error.error) : error.message}`);
  }
};


// API Controllers
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  // Add couponCode to the request body
  const { addressId, amount: frontendTotalAmount, couponCode } = req.body;
  console.log("this is create order ")
  if (!addressId || !frontendTotalAmount) {
    throw new ApiError(400, "Address ID and amount are required.");
  }

  const user = await User.findById(req.user._id)
    .populate("cart.product", "name price stock")
    .populate("addresses");
  if (!user || !user.cart.length) {
    throw new ApiError(400, "Your cart is empty.");
  }

  const shippingAddress = user.addresses.id(addressId);
  if (!shippingAddress) {
    throw new ApiError(404, "Selected shipping address not found.");
  }

  let backendSubtotal = 0;
  for (const item of user.cart) {
    if (!item.product || item.product.stock < item.quantity) {
      throw new ApiError(400, `Not enough stock for ${item.product?.name}.`);
    }
    backendSubtotal += item.product.price * item.quantity;
  }

  // --- NEW: Coupon Validation Logic ---
  let discountAmount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      status: "active",
    });

    if (!coupon) {
      throw new ApiError(404, "Invalid or inactive coupon code.");
    }
    // Calculate discount from the percentage
    discountAmount = (backendSubtotal * coupon.discountPercentage) / 100;
  }

  const shippingCharge = backendSubtotal > 2000 ? 0 : 99;
  // Apply the discount to the final amount
  const backendTotalAmount = backendSubtotal + shippingCharge - discountAmount;

  if (Math.abs(frontendTotalAmount - backendTotalAmount) > 1) {
    throw new ApiError(400, "Price mismatch. Please refresh and try again.");
  }
  
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(backendTotalAmount * 100), // Use the discounted amount
    currency: "INR",
    receipt: crypto.randomBytes(10).toString("hex"),
  });

  if (!razorpayOrder) {
    throw new ApiError(500, "Failed to create Razorpay order.");
  }
  
  res.status(200).json(new ApiResponse(200, {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    key: process.env.RAZORPAY_KEY_ID,
    addressId,
  }, "Razorpay order created."));
});

export const verifyPaymentAndPlaceOrder = asyncHandler(async (req, res) => {
  // Destructure all required fields from the request body, including the couponCode
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    addressId,
    couponCode, // Receive the coupon code from the frontend
  } = req.body;

  // 1. --- Initial Validation ---
  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !addressId
  ) {
    throw new ApiError(400, "Missing required payment or address details.");
  }

  // 2. --- Verify Payment Signature ---
  // This is a critical security step to ensure the payment response is genuinely from Razorpay.
  const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest("hex");

  if (razorpay_signature !== expectedSign) {
    throw new ApiError(400, "Invalid payment signature. Transaction failed.");
  }

  // 3. --- Start Database Transaction ---
  // A transaction ensures that all database operations (creating order, updating stock, clearing cart)
  // either succeed together or fail together, preventing data inconsistency.
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 4. --- Fetch User and Cart Data within the Transaction ---
    const user = await User.findById(req.user._id)
      .populate({ path: "cart.product", select: "name price stock" })
      .populate("addresses")
      .session(session); // Ensure this operation is part of the transaction

    if (!user) throw new ApiError(404, "User not found.");
    if (!user.cart?.length) {
      throw new ApiError(400, "Cannot place order with an empty cart.");
    }

    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress) {
      throw new ApiError(404, "Selected address not found in your profile.");
    }

    // 5. --- Prepare Order Details and Calculate Subtotal ---
    let subtotal = 0;
    const orderItems = [];
    const stockUpdateOperations = [];

    for (const item of user.cart) {
      if (!item.product || item.product.stock < item.quantity) {
        throw new ApiError(
          400,
          `Item "${item.product?.name}" is out of stock. Please remove it from your cart.`
        );
      }
      subtotal += item.product.price * item.quantity;
      orderItems.push({
        product: item.product._id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
      });
      stockUpdateOperations.push({
        updateOne: {
          filter: { _id: item.product._id },
          update: { $inc: { stock: -item.quantity } },
        },
      });
    }

    // 6. --- Dynamic Coupon Validation and Discount Calculation ---
    let discountAmount = 0;
    let validatedCouponCode = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(), // Match code case-insensitively
        status: "active",
      }).session(session); // Ensure coupon check is part of the transaction

      if (coupon) {
        // If coupon is valid, calculate the discount
        discountAmount = (subtotal * coupon.discountPercentage) / 100;
        validatedCouponCode = coupon.code; // Store the official code
      } else {
        // If the coupon has become invalid since the user applied it, fail the transaction.
        throw new ApiError(404, "The applied coupon code is no longer valid.");
      }
    }

    // 7. --- Calculate Final Prices ---
    const shippingCharge = subtotal > 2000 ? 0 : 99; // Example shipping rule
    const finalTotalPrice = subtotal + shippingCharge - discountAmount;

    // 8. --- Create the Order in the Database ---
    const [newOrder] = await Order.create(
      [
        {
          user: req.user._id,
          orderItems: orderItems,
          shippingAddress: { ...selectedAddress.toObject(), _id: undefined },
          itemsPrice: subtotal,
          shippingPrice: shippingCharge,
          taxPrice: 0, // Simplified for this example
          discountAmount, // Save the calculated discount
          couponCode: validatedCouponCode, // Save the validated coupon code
          totalPrice: finalTotalPrice,
          paymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          paymentMethod: "Razorpay",
          orderStatus: "Processing",
        },
      ],
      { session } // Ensure order creation is part of the transaction
    );

    // 9. --- Update Product Stock and Clear User's Cart ---
    await Product.bulkWrite(stockUpdateOperations, { session });
    user.cart = [];
    await user.save({ session });

    // 10. --- Commit the Transaction ---
    // If all previous steps were successful, permanently save the changes to the database.
    await session.commitTransaction();

    if (user.email) {
      sendOrderConfirmationEmail(user.email, newOrder)
        .catch(err => console.error("Error sending Razorpay confirmation email:", err.message));
    }

    // 11. --- Send Successful Response ---
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          { order: newOrder },
          "Payment verified & order placed successfully."
        )
      );
  } catch (error) {
    // 12. --- Abort Transaction on Error ---
    // If any error occurred in the `try` block, roll back all database changes.
    await session.abortTransaction();
    console.error("TRANSACTION FAILED AND ROLLED BACK:", error.message);
    // Rethrow the error to be handled by the global error handler
    throw error;
  } finally {
    // 13. --- End the Session ---
    // Always end the session to release its resources.
    session.endSession();
  }
});


export const cancelOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        throw new ApiError(400, "Invalid Order ID.");
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new ApiError(404, "Order not found.");

        const isOwner = order.user.toString() === req.user._id.toString();
        const isAdmin = req.user.role === "admin";
        if (!isOwner && !isAdmin) throw new ApiError(403, "Not authorized to cancel this order.");

        if (["Shipped", "Delivered", "Cancelled"].includes(order.orderStatus)) {
            throw new ApiError(400, `Order is already ${order.orderStatus.toLowerCase()} and cannot be cancelled.`);
        }

        // Refund only if it was a paid order
        if (order.paymentId) {
            const refund = await initiateRazorpayRefund(order.paymentId, Math.round(order.totalPrice * 100));
            order.refundDetails = {
                refundId: refund.id,
                amount: refund.amount / 100,
                status: refund.status,
                createdAt: new Date(),
            };
        }

        const stockRestoreOps = order.orderItems.map((item) => ({
            updateOne: {
                filter: { _id: item.product },
                update: { $inc: { stock: item.quantity } },
            },
        }));

        if (stockRestoreOps.length > 0) {
            await Product.bulkWrite(stockRestoreOps, { session });
        }

        order.orderStatus = "Cancelled";
        order.cancellationDetails = {
            cancelledBy: isAdmin ? "Admin" : "User",
            reason: req.body.reason || "Cancelled by request",
            cancellationDate: new Date(),
        };

        const updatedOrder = await order.save({ session });
        await session.commitTransaction();
        res.status(200).json(new ApiResponse(200, updatedOrder, "Order has been cancelled successfully."));
    } catch (error) {
        await session.abortTransaction();
        console.error(`Order cancellation failed for ${orderId}. Transaction rolled back. Error:`, error.message);
        throw new ApiError(error.statusCode || 500, `Order cancellation failed: ${error.message}`);
    } finally {
        session.endSession();
    }
});