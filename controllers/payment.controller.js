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
  const { addressId, amount: frontendTotalAmount } = req.body;
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

  // --- SIMPLIFIED PRICE CALCULATION ---
  let backendSubtotal = 0;
  for (const item of user.cart) {
    if (!item.product || item.product.stock < item.quantity) {
      throw new ApiError(400, `Not enough stock for ${item.product?.name}.`);
    }
    backendSubtotal += item.product.price * item.quantity;
  }


  // Set a fixed shipping charge or a simple rule (e.g., free above a certain amount)
  const shippingCharge = backendSubtotal > 2000 ? 0 : 99; // Example rule
  const backendTotalAmount = backendSubtotal + shippingCharge;
  
  if (Math.abs(frontendTotalAmount - backendTotalAmount) > 1) {
    throw new ApiError(400, "Price mismatch. Please refresh and try again.");
  }
  console.log(process.env.RAZORPAY_KEY_ID)
  console.log(process.env.RAZORPAY_KEY_SECRET)

  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(backendTotalAmount * 100),
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
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId } = req.body;
  
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !addressId) {
    throw new ApiError(400, "Missing payment details.");
  }

  const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest("hex");

  if (razorpay_signature !== expectedSign) {
    throw new ApiError(400, "Invalid payment signature. Transaction failed.");
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const user = await User.findById(req.user._id)
      .populate({ path: "cart.product", select: "name price stock" })
      .populate("addresses")
      .session(session);

    if (!user) throw new ApiError(404, "User not found.");
    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress) throw new ApiError(404, "Selected address not found.");

    let subtotal = 0;
    const items = [];
    const stockOps = [];
    for (const item of user.cart) {
      if (!item.product || item.product.stock < item.quantity) {
        throw new ApiError(400, `Item "${item.product?.name}" is out of stock.`);
      }
      subtotal += item.product.price * item.quantity;
      items.push({
        product: item.product._id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
      });
      stockOps.push({
        updateOne: { filter: { _id: item.product._id }, update: { $inc: { stock: -item.quantity } } },
      });
    }

    if (!items.length) {
      throw new ApiError(400, "Cannot place order with an empty cart.");
    }
    
    const shippingCharge = subtotal > 2000 ? 0 : 99; // Same rule as before
    const finalTotalPrice = subtotal + shippingCharge;
    
    const [newOrder] = await Order.create([{
      user: req.user._id,
      orderItems: items,
      shippingAddress: { ...selectedAddress.toObject(), _id: undefined },
      itemsPrice: subtotal,
      shippingPrice: shippingCharge,
      taxPrice: 0, // Simplified: tax included in total
      totalPrice: finalTotalPrice,
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentMethod: "Razorpay",
      orderStatus: "Processing", // Order is paid and processing
    }], { session });

    await Product.bulkWrite(stockOps, { session });
    user.cart = [];
    await user.save({ session });
    
    await session.commitTransaction();
    
    res.status(201).json(new ApiResponse(201, { order: newOrder }, "Payment verified & order placed successfully."));
  } catch (error) {
    await session.abortTransaction();
    console.error("TRANSACTION FAILED AND ROLLED BACK:", error.message);
    throw error;
  } finally {
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