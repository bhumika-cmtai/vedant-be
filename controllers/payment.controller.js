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
import { sendOrderConfirmationEmail,sendServiceNotificationToAdmin  } from "../services/emailService.js";
import { createShiprocketOrder } from "../services/shippingService.js";
import { WalletConfig } from "../models/walletConfig.model.js";
import { TaxConfig } from "../models/taxConfig.model.js";
// import { getShippingRates, createShiprocketOrder } from '../services/shippingService.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


/**
 * @desc Helper function to create an order in Shiprocket after it's been created locally.
 * @param {Order} order - The Mongoose order object.
 * @param {string} userEmail - The email of the user who placed the order.
 */
// export const createShiprocketOrder = async (order, userEmail) => {
//   try {
//       console.log(`Step 1: Creating Shiprocket order for local order ID: ${order._id}`);

//       const orderPayload = {
//           order_id: order._id.toString(),
//           order_date: order.createdAt,
//           pickup_location: "Primary",
//           billing_customer_name: order.shippingAddress.fullName.split(' ')[0],
//           billing_last_name: order.shippingAddress.fullName.split(' ').slice(1).join(' ') || order.shippingAddress.fullName.split(' ')[0],
//           billing_address: order.shippingAddress.street,
//           billing_city: order.shippingAddress.city,
//           billing_pincode: order.shippingAddress.postalCode,
//           billing_state: order.shippingAddress.state,
//           billing_country: order.shippingAddress.country,
//           billing_email: userEmail,
//           billing_phone: order.shippingAddress.phone,
//           shipping_is_billing: true,
//           order_items: order.orderItems.map(item => ({
//               name: item.product_name,
//               sku: item.sku_variant || item.product_id.toString(),
//               units: item.quantity,
//               selling_price: item.price_per_item,
//               hsn: 441122,
//           })),
//           payment_method: order.paymentMethod === 'COD' ? "COD" : "Prepaid",
//           sub_total: order.itemsPrice,
//           length: 10,
//           breadth: 10,
//           height: 10,
//           weight: 0.5
//       };

//       const { data: createOrderResponse } = await shiprocketApi.post('/orders/create/adhoc', orderPayload);
      
//       if (!createOrderResponse.order_id || !createOrderResponse.shipment_id) {
//           console.warn(`Shiprocket API success, but no order_id/shipment_id returned for local order ${order._id}.`, createOrderResponse);
//           return;
//       }

//       const shipmentId = createOrderResponse.shipment_id;
//       console.log(`Step 2: Shiprocket order created [${createOrderResponse.order_id}]. Now generating AWB for shipment [${shipmentId}].`);

//       const { data: awbResponse } = await shiprocketApi.post('/courier/assign/awb', { shipment_id: shipmentId });

//       if (!awbResponse.response?.data?.awb_code) {
//           console.error(`Failed to auto-generate AWB for shipment ${shipmentId}. Message:`, awbResponse.message);
//           await Order.findByIdAndUpdate(order._id, { $set: { "shipmentDetails.shiprocketOrderId": createOrderResponse.order_id, "shipmentDetails.shiprocketShipmentId": shipmentId } });
//           return;
//       }
      
//       const awbData = awbResponse.response.data;
//       console.log(`Step 3: AWB [${awbData.awb_code}] generated. Now scheduling pickup...`);

//       const { data: pickupResponse } = await shiprocketApi.post('/courier/generate/pickup', {
//           shipment_id: [shipmentId]
//       });

//       if (pickupResponse.pickup_status !== "scheduled") {
//            console.warn(`Pickup scheduling failed or was queued for shipment ${shipmentId}. Status:`, pickupResponse.data);
//       } else {
//           console.log(`Step 4: Pickup successfully scheduled for shipment ${shipmentId}.`);
//       }

//       console.log(`Step 5: Updating local database with all shipment details.`);
//       await Order.findByIdAndUpdate(order._id, {
//           $set: {
//               "orderStatus": "Shipped",
//               "shipmentDetails.shiprocketOrderId": createOrderResponse.order_id,
//               "shipmentDetails.shiprocketShipmentId": shipmentId,
//               "shipmentDetails.trackingNumber": awbData.awb_code,
//               "shipmentDetails.courier": awbData.courier_name,
//               "shipmentDetails.trackingUrl": awbData.awb_code_url,
//           }
//       });

//       console.log(`Order ${order._id} fully automated and marked as Shipped.`);
      
//   } catch (error) {
//       console.error(`CRITICAL ERROR during Shiprocket automation for local order ${order._id}.`);
//       console.error("Error Response:", error.response?.data || error.message);
//   }
// };



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
  const { addressId, couponCode, pointsToRedeem,shippingPrice  } = req.body;

  // if (!addressId) {
  //   throw new ApiError(400, "An Address ID is required to create an order.");
  // }

  const user = await User.findById(req.user._id)
    .populate({
      path: "cart.product",
      select: "name stock_quantity variants type" // Simplified select
    });
    
  if (!user || !user.cart.length) {
    throw new ApiError(400, "Your cart is empty.");
  }

  const containsPhysicalProduct = user.cart.some(item => item.product.type === 'product');
  if (containsPhysicalProduct && !addressId) {
      throw new ApiError(400, "An Address ID is required for orders with physical products.");
  }

  let backendSubtotal = 0;
  for (const item of user.cart) {
    if (!item.product) throw new ApiError(404, "A product in your cart is unavailable.");
    
    // --- Stock Validation Block ---
    if (item.product.type === 'product') {
      if (item.sku_variant) {
          const variant = item.product.variants.find(v => v.sku === item.sku_variant);
          if (!variant || variant.stock_quantity < item.quantity) {
              throw new ApiError(400, `Not enough stock for ${item.product.name}.`);
          }
      } else {
          if (item.product.stock_quantity < item.quantity) {
              throw new ApiError(400, `Not enough stock for ${item.product.name}.`);
          }
      }
  }
    backendSubtotal += item.price * item.quantity;
  }

  // --- Price Calculation (factoring in points) ---
  let couponDiscount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), status: "active" });
    if (coupon) {
        couponDiscount = (backendSubtotal * coupon.discountPercentage) / 100;
    }
  }

  let walletDiscount = 0;
  const pointsToApply = Number(pointsToRedeem) || 0;
  if (pointsToApply > 0) {
      if (pointsToApply > user.wallet) throw new ApiError(400, "You do not have enough points in your wallet.");
      const walletConfig = await WalletConfig.findOne();
      if (!walletConfig?.rupeesPerPoint) throw new ApiError(500, "Wallet configuration is not set up correctly.");
      walletDiscount = pointsToApply * walletConfig.rupeesPerPoint;
      if (walletDiscount > (backendSubtotal - couponDiscount)) {
          walletDiscount = backendSubtotal - couponDiscount;
      }
  }
  
  const totalDiscount = couponDiscount + walletDiscount;
  
  // const shippingPrice = 90;
  const taxConfig = await TaxConfig.findOne().lean();
  const taxRate = taxConfig?.rate || 0; // Default to 0 if not configured
  const taxableAmount = Math.max(0, backendSubtotal - totalDiscount);
  const taxPrice = taxableAmount * taxRate;
  const finalShippingPrice = containsPhysicalProduct ? (shippingPrice || 0) : 0;
  const backendTotalAmount = taxableAmount + finalShippingPrice + taxPrice;


  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(backendTotalAmount * 100), 
    currency: "INR",
    receipt: `rcpt_${crypto.randomBytes(6).toString("hex")}`,
  });

  if (!razorpayOrder) {
    throw new ApiError(500, "Failed to create Razorpay order.");
  }
  
  res.status(200).json(new ApiResponse(200, {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    key: process.env.RAZORPAY_KEY_ID,
    addressId,
  }, "Razorpay order created successfully."));
});

export const verifyPaymentAndPlaceOrder = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId, couponCode, pointsToRedeem, serviceInputs, shippingPrice   } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
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
        path: "cart.product",
        select: "name stock_quantity variants images type" // Simplified select
      })
      .session(session);

    if (!user?.cart?.length) throw new ApiError(400, "Cannot place order with an empty cart.");
    
    const containsPhysicalProduct = user.cart.some(item => item.product.type === 'product');
    let selectedAddress = null;
    if (containsPhysicalProduct) {
        if (!addressId) throw new ApiError(400, "Address ID is required for physical products.");
        selectedAddress = user.addresses.id(addressId);
        if (!selectedAddress) throw new ApiError(404, "Selected address not found.");
    }

    let subtotal = 0;
    const orderItems = [];
    const stockUpdateOperations = [];

    for (const item of user.cart) {
      if (!item.product) {
        throw new ApiError(404, `A product in your cart is no longer available.`);
      }

      subtotal += item.price * item.quantity;

      let userInputData = undefined;
      if (item.product.type === 'service' && serviceInputs) {
          userInputData = serviceInputs[item._id.toString()];
      }

      orderItems.push({
        product_id: item.product._id,
        product_name: item.product.name,
        product_type: item.product.type, 
        quantity: item.quantity,
        price_per_item: item.price,
        image: item.image || item.product.images[0],
        sku_variant: item.sku_variant, // This is correct, it's from the cart item
        userInput: userInputData, 
      });

      if (item.product.type === 'product') {
        if (item.sku_variant) {
          const variant = item.product.variants.find(v => v.sku === item.sku_variant);
          if (!variant || variant.stock_quantity < item.quantity) throw new ApiError(400, `Not enough stock for "${item.product.name}".`);
          stockUpdateOperations.push({
            updateOne: {
              filter: { _id: item.product._id, "variants.sku": item.sku_variant },
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
          // const shippingPrice = 90;
          const taxConfig = await TaxConfig.findOne().session(session).lean();
          if (!taxConfig) {
              // Yeh ek fallback hai, agar DB mein koi config nahi hai to error dega.
              throw new ApiError(500, "Tax configuration is not set up correctly.");
          }
          const taxRate = taxConfig.rate;
          const taxPrice = (subtotal - totalDiscount) > 0 ? (subtotal - totalDiscount) * taxRate : 0;
          const totalPrice = (subtotal - totalDiscount) + shippingPrice + taxPrice;

    const [newOrder] = await Order.create([{
      user: req.user._id,
      orderItems,
      shippingAddress: selectedAddress ? selectedAddress.toObject() : undefined,
      itemsPrice: subtotal,
      shippingPrice, 
      taxPrice,
      discountAmount: totalDiscount,
      totalPrice,
      couponCode: validatedCouponCode,
      paymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      paymentMethod: "Razorpay",
      orderStatus: "Paid", // The order is paid and ready to be processed
  }], { session });

  if (stockUpdateOperations.length > 0) {
    await Product.bulkWrite(stockUpdateOperations, { session });
  }
  user.cart = [];
  await user.save({ session, validateBeforeSave: false });

  await session.commitTransaction();
  
  // --- POST-ORDER ACTIONS (After successful transaction) ---
  const containsService = orderItems.some(item => item.product_type === 'service');

  // 1. Send to Shiprocket if there's a physical item
  if (containsPhysicalProduct) {
    await createShiprocketOrder(newOrder, user.email);
  }

  // 2. Send notification to admin if there's a service item
  if (containsService) {
    sendServiceNotificationToAdmin(newOrder).catch(err => console.error("Failed to send admin service notification:", err));
  }

  // 3. Send confirmation to user for ALL orders
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