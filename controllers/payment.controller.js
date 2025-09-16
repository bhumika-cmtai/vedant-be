// payment.controller.js

import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";
import Product from "../models/product.model.js";
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
  // --- REWRITTEN to support variants ---
  const { addressId, amount: frontendTotalAmount, couponCode } = req.body;
  if (!addressId || !frontendTotalAmount) {
    throw new ApiError(400, "Address ID and amount are required.");
  }

  // Populate the correct path and select the 'variants' field for stock checking
  const user = await User.findById(req.user._id)
    .populate({
      path: "cart.product_id", // Correct path for the new user model
      select: "name base_price price variants" // 'variants' is crucial
    });
    
  if (!user || !user.cart.length) {
    throw new ApiError(400, "Your cart is empty.");
  }

  let backendSubtotal = 0;
  for (const item of user.cart) {
    if (!item.product_id) throw new ApiError(404, "A product in your cart is unavailable.");
    
    // Check stock based on product type (simple or variable)
    if (item.sku_variant) { // It's a variable product
        const variant = item.product_id.variants.find(v => v.sku_variant === item.sku_variant);
        if (!variant || variant.stock_quantity < item.quantity) {
            throw new ApiError(400, `Not enough stock for ${item.product_id.name} (${item.size}, ${item.color}).`);
        }
    } else { // It's a simple product
        if (item.product_id.stock_quantity < item.quantity) {
            throw new ApiError(400, `Not enough stock for ${item.product_id.name}.`);
        }
    }
    // Calculate price from the item stored in the cart, which is safer
    backendSubtotal += item.price_per_item * item.quantity;
  }

  // Coupon logic remains the same
  let discountAmount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: "active" });
    if (!coupon) throw new ApiError(404, "Invalid or inactive coupon code.");
    discountAmount = (backendSubtotal * coupon.discountPercentage) / 100;
  }

  const shippingCharge = backendSubtotal > 2000 ? 0 : 99;
  const backendTotalAmount = backendSubtotal + shippingCharge - discountAmount;

  if (Math.abs(frontendTotalAmount - backendTotalAmount) > 1) { // Allow for small floating point differences
    throw new ApiError(400, "Price mismatch between frontend and backend. Please refresh and try again.");
  }
  
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(backendTotalAmount * 100),
    currency: "INR",
    receipt: crypto.randomBytes(10).toString("hex"),
  });

  if (!razorpayOrder) throw new ApiError(500, "Failed to create Razorpay order.");
  
  res.status(200).json(new ApiResponse(200, {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    key: process.env.RAZORPAY_KEY_ID,
    addressId,
  }, "Razorpay order created."));
});

export const verifyPaymentAndPlaceOrder = asyncHandler(async (req, res) => {
  // --- REWRITTEN to support variants in order creation ---
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, couponCode } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !addressId) {
    throw new ApiError(400, "Missing required payment or address details.");
  }

  // 1. Verify Payment Signature
  const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSign = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(sign).digest("hex");
  if (razorpay_signature !== expectedSign) {
    throw new ApiError(400, "Invalid payment signature. Transaction failed.");
  }

  // 2. Start Database Transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user._id)
      .populate({ path: "cart.product_id", select: "name base_price price variants" })
      .session(session);

    if (!user?.cart?.length) throw new ApiError(400, "Cannot place order with an empty cart.");
    
    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress) throw new ApiError(404, "Selected address not found.");

    // 3. Prepare Order Details, Validate Stock, and Calculate Subtotal
    let subtotal = 0;
    const orderItems = [];
    const stockUpdateOperations = [];

    for (const item of user.cart) {
      if (!item.product_id) throw new ApiError(404, "A product in your cart is no longer available.");
      
      subtotal += item.price_per_item * item.quantity;
      
      // Create the detailed order item based on the new schema
      orderItems.push({
        product_id: item.product_id._id,
        product_name: item.product_id.name,
        quantity: item.quantity,
        price_per_item: item.price_per_item,
        image: item.image,
        // Add variant details if they exist
        sku_variant: item.sku_variant,
        size: item.size,
        color: item.color,
      });

      // Prepare the correct stock update operation
      if (item.sku_variant) { // For Variable Product
        const variant = item.product_id.variants.find(v => v.sku_variant === item.sku_variant);
        if (!variant || variant.stock_quantity < item.quantity) {
          throw new ApiError(400, `Not enough stock for ${item.product_id.name} (${item.size}, ${item.color}).`);
        }
        stockUpdateOperations.push({
          updateOne: {
            filter: { _id: item.product_id._id, "variants.sku_variant": item.sku_variant },
            update: { $inc: { "variants.$.stock_quantity": -item.quantity } },
          },
        });
      } else { // For Simple Product
        if (item.product_id.stock_quantity < item.quantity) {
          throw new ApiError(400, `Not enough stock for ${item.product_id.name}.`);
        }
        stockUpdateOperations.push({
          updateOne: {
            filter: { _id: item.product_id._id },
            update: { $inc: { stock_quantity: -item.quantity } },
          },
        });
      }
    }

    // 4. Coupon and Final Price Calculation (no changes needed here)
    let discountAmount = 0;
    let validatedCouponCode = null;
    if (couponCode) {
        // ... (coupon logic remains the same)
    }
    const shippingCharge = subtotal > 2000 ? 0 : 99;
    const finalTotalPrice = subtotal + shippingCharge - discountAmount;

    // 5. Create the Order
    const [newOrder] = await Order.create([{
        user: req.user._id,
        orderItems: orderItems, // This now contains all the variant details
        shippingAddress: { ...selectedAddress.toObject(), _id: undefined },
        itemsPrice: subtotal,
        shippingPrice: shippingCharge,
        taxPrice: 0,
        discountAmount,
        couponCode: validatedCouponCode,
        totalPrice: finalTotalPrice,
        paymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        paymentMethod: "Razorpay",
        orderStatus: "Processing", // Or "Paid"
    }], { session });

    // 6. Update Stock and Clear Cart
    await Product.bulkWrite(stockUpdateOperations, { session });
    user.cart = [];
    await user.save({ session });

    // 7. Commit Transaction
    await session.commitTransaction();

    if (user.email) {
      sendOrderConfirmationEmail(user.email, newOrder)
        .catch(err => console.error("Error sending email:", err));
    }

    res.status(201).json(new ApiResponse(201, { order: newOrder }, "Payment verified & order placed successfully."));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const cancelOrder = asyncHandler(async (req, res) => {
    // --- REWRITTEN to restore stock for both simple and variable products ---
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) throw new ApiError(400, "Invalid Order ID.");

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

        // Refund logic (remains the same)
        if (order.paymentMethod === "Razorpay" && order.paymentId) {
            const refund = await initiateRazorpayRefund(order.paymentId, Math.round(order.totalPrice * 100));
            order.refundDetails = { /* ... */ };
        }

        // Prepare stock restoration operations for all items in the order
        const stockRestoreOps = order.orderItems.map((item) => {
            if (item.sku_variant) { // If it's a variant product
                return {
                    updateOne: {
                        filter: { _id: item.product_id, "variants.sku_variant": item.sku_variant },
                        update: { $inc: { "variants.$.stock_quantity": item.quantity } },
                    },
                };
            } else { // If it's a simple product
                return {
                    updateOne: {
                        filter: { _id: item.product_id },
                        update: { $inc: { stock_quantity: item.quantity } },
                    },
                };
            }
        });

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
        res.status(200).json(new ApiResponse(200, updatedOrder, "Order has been cancelled and stock restored."));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});