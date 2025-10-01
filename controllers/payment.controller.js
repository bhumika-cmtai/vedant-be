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
import { WalletConfig } from "../models/walletConfig.model.js";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function for Razorpay refunds
const initiateRazorpayRefund = async (paymentId, amountInPaisa) => {
  try {
    // --- FIX APPLIED HERE ---
    // The refund details must be passed as a single object.
    return await razorpay.payments.refund(paymentId, {
      amount: amountInPaisa,
      speed: "normal",
      notes: { reason: "Order cancelled by customer or admin." },
    });
  } catch (error) {
    // This logic correctly handles cases where a refund was already issued.
    if (error.error?.description?.includes("already been fully refunded")) {
      return {
        status: "processed",
        id: "already_refunded",
        amount: amountInPaisa,
      };
    }
    // Re-throw a more informative error for easier debugging.
    throw new Error(`Refund failed: ${error.error ? JSON.stringify(error.error) : error.message}`);
  }
};



// API Controllers
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  // --- UPDATED: Removed 'amount' from destructuring ---
  const { addressId, couponCode } = req.body;

  // We still need to validate that an address was sent
  if (!addressId) {
    throw new ApiError(400, "An Address ID is required to create an order.");
  }

  const user = await User.findById(req.user._id)
    .populate({
      path: "cart.product",
      select: "name price sale_price stock_quantity variants"
    });
    
  if (!user || !user.cart.length) {
    throw new ApiError(400, "Your cart is empty.");
  }

  // --- Backend price calculation (This is now the single source of truth) ---
  let backendSubtotal = 0;
  for (const item of user.cart) {
    if (!item.product) throw new ApiError(404, "A product in your cart is unavailable.");
    
    // Stock validation
    if (item.sku_variant) {
        const variant = item.product.variants.find(v => v.sku_variant === item.sku_variant);
        if (!variant || variant.stock_quantity < item.quantity) {
            throw new ApiError(400, `Not enough stock for ${item.product.name}.`);
        }
    } else {
        if (item.product.stock_quantity < item.quantity) {
            throw new ApiError(400, `Not enough stock for ${item.product.name}.`);
        }
    }
    // Calculate price using the price stored in the cart item
    backendSubtotal += item.price * item.quantity;
  }

  let discountAmount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: "active" });
    if (coupon) {
        discountAmount = (backendSubtotal * coupon.discountPercentage) / 100;
    }
  }

  const shippingPrice = 90;
  const taxRate = 0.03;
  const taxPrice = (backendSubtotal - discountAmount) * taxRate;
  const backendTotalAmount = (backendSubtotal - discountAmount) + shippingPrice + taxPrice;
  
  // --- REMOVED: The price mismatch validation block has been deleted ---
  // if (Math.abs(frontendTotalAmount - backendTotalAmount) > 1) { ... }

  const razorpayOrder = await razorpay.orders.create({
    // Use the securely calculated backend amount
    amount: Math.round(backendTotalAmount * 100), 
    currency: "INR",
    receipt: `rcpt_${crypto.randomBytes(6).toString("hex")}`,
  });

  if (!razorpayOrder) {
    throw new ApiError(500, "Failed to create Razorpay order.");
  }
  
  res.status(200).json(new ApiResponse(200, {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount, // Send the final calculated amount back to frontend
    key: process.env.RAZORPAY_KEY_ID,
    addressId,
  }, "Razorpay order created successfully."));
});


export const verifyPaymentAndPlaceOrder = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, couponCode, pointsToRedeem } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !addressId) {
    throw new ApiError(400, "Missing required payment or address details.");
  }

  const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSign = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(sign).digest("hex");
  if (razorpay_signature !== expectedSign) {
    throw new ApiError(400, "Invalid payment signature.");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user._id)
      .populate({ 
        path: "cart.product", // --- FIX: Using 'product' ---
        select: "name price sale_price stock_quantity variants images"
      })
      .session(session);

    if (!user?.cart?.length) throw new ApiError(400, "Cannot place order with an empty cart.");
    
    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress) throw new ApiError(404, "Selected address not found.");

    let subtotal = 0;
    const orderItems = [];
    const stockUpdateOperations = [];

    for (const item of user.cart) {
      if (!item.product) {
        throw new ApiError(404, `A product in your cart is no longer available.`);
      }

      subtotal += item.price * item.quantity;

      const orderItemData = {
        product_id: item.product._id,
        product_name: item.product.name,
        quantity: item.quantity,
        price_per_item: item.price,
        image: item.image || item.product.images[0],
        sku_variant: item.sku_variant,
        size: item.attributes?.get('size'),
        color: item.attributes?.get('color'),
      };
      orderItems.push(orderItemData);

      if (item.sku_variant) {
        const productVariant = item.product.variants.find(v => v.sku_variant === item.sku_variant);
        if (!productVariant) throw new ApiError(400, `Variant for "${item.product.name}" is no longer available.`);
        if (productVariant.stock_quantity < item.quantity) throw new ApiError(400, `Not enough stock for "${item.product.name}".`);
        stockUpdateOperations.push({
          updateOne: {
            filter: { _id: item.product._id, "variants.sku_variant": item.sku_variant },
            update: { $inc: { "variants.$.stock_quantity": -item.quantity } },
          },
        });
      } else {
        if (item.product.stock_quantity < item.quantity) throw new ApiError(400, `Not enough stock for "${item.product.name}".`);
        stockUpdateOperations.push({
          updateOne: {
            filter: { _id: item.product._id },
            update: { $inc: { stock_quantity: -item.quantity } },
          },
        });
      }
    }

    if (orderItems.length === 0) throw new ApiError(400, "No valid items to place order.");

          // --- Discount Calculation (Correct) ---
          let couponDiscount = 0;
          let validatedCouponCode = null;
          if (couponCode) {
              const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: "active" }).session(session);
              if (coupon) {
                  couponDiscount = (subtotal * coupon.discountPercentage) / 100;
                  validatedCouponCode = coupon.code;
              }
          }
    
          let walletDiscount = 0;
          const pointsToApply = Number(pointsToRedeem) || 0;
          if (pointsToApply > 0) {
              if (pointsToApply > user.wallet) throw new ApiError(400, "You do not have enough points in your wallet.");
              const walletConfig = await WalletConfig.findOne().session(session);
              if (!walletConfig?.rupeesPerPoint) throw new ApiError(500, "Wallet configuration is not set up correctly.");
              walletDiscount = pointsToApply * walletConfig.rupeesPerPoint;
              if (walletDiscount > (subtotal - couponDiscount)) {
                  walletDiscount = subtotal - couponDiscount;
              }
          }
          
          const totalDiscount = couponDiscount + walletDiscount;
    
          // --- Final Price Calculation (Correct) ---
          const shippingPrice = 90;
          const taxRate = 0.03;
          const taxPrice = (subtotal - totalDiscount) > 0 ? (subtotal - totalDiscount) * taxRate : 0;
          const totalPrice = (subtotal - totalDiscount) + shippingPrice + taxPrice;

    const [newOrder] = await Order.create([{
        user: req.user._id,
        orderItems,
        shippingAddress: selectedAddress.toObject(),
        itemsPrice: subtotal,
        shippingPrice,
        taxPrice,
        discountAmount: totalDiscount,
        totalPrice,
        couponCode: validatedCouponCode,
        paymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        paymentMethod: "Razorpay",
        orderStatus: "Processing",
    }], { session });

    await Product.bulkWrite(stockUpdateOperations, { session });
    user.cart = [];
    await user.save({ session, validateBeforeSave: false });

    await session.commitTransaction();

    if (user.email) {
      sendOrderConfirmationEmail(user.email, newOrder).catch(err => console.error("Failed to send email:", err));
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
  console.log("order ko cancel ki request start")
  const { orderId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ApiError(400, "Invalid Order ID format.");
  }

  // Start a Mongoose session for database transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      throw new ApiError(404, "Order not found.");
    }

    // --- SECURITY CHECK ---
    // Check if the requester is the order owner or an admin
    const isOwner = order.user.toString() === req.user._id.toString();
    // Assuming you have a 'role' field in your user model
    const isAdmin = req.user.role === "admin"; 

    if (!isOwner && !isAdmin) {
      throw new ApiError(403, "You are not authorized to cancel this order.");
    }

    // --- STATUS VALIDATION ---
    // Check if the order is already in a final state
    if (["Shipped", "Delivered", "Cancelled"].includes(order.orderStatus)) {
      throw new ApiError(400, `Order is already ${order.orderStatus.toLowerCase()} and cannot be cancelled.`);
    }

    // --- REFUND LOGIC ---
    // If the payment was made via Razorpay, process a refund
    if (order.paymentMethod === "Razorpay" && order.paymentId) {
      const refund = await initiateRazorpayRefund(order.paymentId, Math.round(order.totalPrice * 100));
      
      // Store refund details in the order document
      order.refundDetails = {
        refundId: refund.id,
        amount: refund.amount / 100, // Convert from paisa to rupees
        status: refund.status || "processed",
        createdAt: new Date(),
      };
    }

    // --- STOCK RESTORATION LOGIC ---
    // Prepare stock update operations for all items in the order
    const stockRestoreOps = order.orderItems.map((item) => {
      if (item.sku_variant) {
        // This is a VARIABLE product (e.g., with size/color)
        return {
          updateOne: {
            filter: { _id: item.product_id, "variants.sku_variant": item.sku_variant },
            update: { $inc: { "variants.$.stock_quantity": item.quantity } },
          },
        };
      } else {
        // This is a SIMPLE product
        return {
          updateOne: {
            filter: { _id: item.product_id },
            update: { $inc: { "stock_quantity": item.quantity } },
          },
        };
      }
    });

    // Execute all stock updates in a single database call
    if (stockRestoreOps.length > 0) {
      await Product.bulkWrite(stockRestoreOps, { session });
    }

    // --- UPDATE ORDER STATUS ---
    // Finally, update the order status and cancellation details
    order.orderStatus = "Cancelled";
    order.cancellationDetails = {
      cancelledBy: isAdmin ? "Admin" : "User",
      reason: req.body.reason || "Cancelled by request",
      cancellationDate: new Date(),
    };
    console.log("----order----")
    const updatedOrder = await order.save({ session });

    console.log("-----updatedOrder-----")
    console.log(updatedOrder)

    // If all operations were successful, commit the transaction
    await session.commitTransaction();

    res.status(200).json(new ApiResponse(200, updatedOrder, "Order has been cancelled and stock restored successfully."));

  } catch (error) {
    // If any step fails, abort the entire transaction
    await session.abortTransaction();
    throw error; // Re-throw the error to be handled by your global error handler
  } finally {
    // Always end the session to release resources
    session.endSession();
  }
});