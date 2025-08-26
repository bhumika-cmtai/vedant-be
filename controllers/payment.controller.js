import Razorpay from "razorpay";
import crypto from "crypto";
import axios from "axios";
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

// Helper Functions... (No changes in getDelhiveryShippingCharge, cancelDelhiveryShipment, initiateRazorpayRefund)
const getDelhiveryShippingCharge = async (destinationPin, weightInGrams) => {
  const originPin = process.env.PICKUP_LOCATION_PINCODE;
  if (!originPin) {
    throw new ApiError(
      500,
      "Server configuration error: Pickup location pincode is not set."
    );
  }
  const params = {
    md: "E",
    ss: "Delivered",
    pt: "Pre-paid",
    cgm: weightInGrams,
    o_pin: originPin,
    d_pin: destinationPin,
  };
  try {
    const response = await axios.get(
      `${process.env.DELIVERY_ONE_API_URL}/api/kinko/v1/invoice/charges/.json`,
      {
        params,
        headers: {
          Authorization: `Token ${process.env.DELIVERY_ONE_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );
    const chargeData = response.data;
    if (chargeData && chargeData.length > 0 && chargeData[0].total_amount) {
      return parseFloat(chargeData[0].total_amount);
    }
    throw new ApiError(
      400,
      "Could not fetch shipping charges. The destination may be unserviceable."
    );
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error(
      "Error fetching shipping charge from Delhivery:",
      errorMessage
    );
    throw new ApiError(
      400,
      "Failed to calculate shipping cost. The destination may be unserviceable."
    );
  }
};
const cancelDelhiveryShipment = async (trackingNumber) => {
  if (!process.env.DELIVERY_ONE_API_URL || !process.env.DELIVERY_ONE_API_KEY) {
    console.warn(
      "Delhivery API URL/Key not configured, skipping shipment cancellation."
    );
    return { success: true, message: "Skipped: API not configured." };
  }
  const url = `${process.env.DELIVERY_ONE_API_URL}/api/p/edit`;
  const payload = { waybill: trackingNumber, cancellation: "true" };
  try {
    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Token ${process.env.DELIVERY_ONE_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (res.data && res.data.success === false) {
      throw new Error(
        `Delhivery API returned failure: ${res.data.rmk || res.data.message || JSON.stringify(res.data)}`
      );
    }
    console.log(
      "Successfully requested shipment cancellation on Delhivery:",
      res.data
    );
    return res.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error(
      `Failed to cancel Delhivery shipment ${trackingNumber}:`,
      errorMessage
    );
    throw new ApiError(
      500,
      `Could not cancel shipment with Delhivery: ${errorMessage}`
    );
  }
};
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
    throw new Error(
      `Refund failed: ${error.error ? JSON.stringify(error.error) : error.message}`
    );
  }
};

/**
 * =========================================================
 *                *** THE FIX IS HERE ***
 *      OrderID is now guaranteed to be unique by adding a timestamp.
 * =========================================================
 */
const createDelhiveryShipment = async (order, totalWeight) => {
  if (!process.env.DELIVERY_ONE_API_URL || !process.env.DELIVERY_ONE_API_KEY) {
    console.error("Delhivery API credentials are missing in .env");
    return {
      success: false,
      rmk: "Server configuration error for courier service.",
    };
  }

  const { shippingAddress } = order;
  const cleanPhoneNumber = (shippingAddress.phone || "")
    .replace(/\D/g, "")
    .slice(-10);

  // **THE FIX: Making the order ID always unique for Delhivery**
  const uniqueDelhiveryOrderId = `${order._id.toString()}-${Date.now()}`;

  const payload = {
    shipments: [
      {
        name: shippingAddress.fullName,
        add: shippingAddress.street,
        pin: shippingAddress.postalCode,
        city: shippingAddress.city,
        state: shippingAddress.state,
        country: "India",
        phone: cleanPhoneNumber,
        orderid: uniqueDelhiveryOrderId, // Using the new unique ID
        payment_mode: "Prepaid",
        total_amount: parseFloat(order.totalPrice),
        products_desc: order.orderItems
          .map((item) => item.name)
          .slice(0, 5)
          .join(", "),
        quantity: order.orderItems
          .reduce((sum, item) => sum + item.quantity, 0)
          .toString(),
        weight: totalWeight,
      },
    ],
    pickup_location: { name: "home" },
  };

  console.log("--- [DEBUG] DATA SENT TO DELHIHERY API ---");
  console.log(JSON.stringify(payload, null, 2));
  console.log("------------------------------------------");

  const url = `${process.env.DELIVERY_ONE_API_URL}/api/cmu/push.json`;
  const formData = `format=json&data=${JSON.stringify(payload)}`;

  try {
    const res = await axios.post(url, formData, {
      headers: {
        Authorization: `Token ${process.env.DELIVERY_ONE_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const { success, packages, rmk } = res.data;
    if (success && packages && packages.length > 0) {
      return {
        success: true,
        trackingNumber: packages[0].waybill,
        rmk: "Shipment created successfully",
      };
    }
    return { success: false, rmk: rmk || JSON.stringify(res.data) };
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error(
      `Delhivery shipment creation failed for Order ${order._id}:`,
      errorMessage
    );
    return {
      success: false,
      rmk: `Courier API request failed: ${errorMessage}`,
    };
  }
};

// API Controllers (getPriceBreakdown, createRazorpayOrder, etc. have no changes)
export const getPriceBreakdown = asyncHandler(async (req, res) => {
  const { addressId } = req.body;
  if (!addressId) throw new ApiError(400, "Shipping address ID is required.");
  const user = await User.findById(req.user._id)
    .populate("cart.product", "price stock weight")
    .populate("addresses");
  if (!user) throw new ApiError(404, "User not found.");
  if (!user.cart || user.cart.length === 0)
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { breakdown: { subtotal: 0, shipping: 0, gst: 0, total: 0 } },
          "Cart is empty."
        )
      );
  const shippingAddress = user.addresses.id(addressId);
  if (!shippingAddress)
    throw new ApiError(404, "Selected shipping address not found.");
  let backendSubtotal = 0,
    totalWeightInGrams = 0;
  user.cart.forEach((item) => {
    if (item.product) {
      backendSubtotal += item.product.price * item.quantity;
      totalWeightInGrams += (item.product.weight || 0.5) * 1000 * item.quantity;
    }
  });
  const shippingCharge = await getDelhiveryShippingCharge(
    shippingAddress.postalCode,
    totalWeightInGrams
  );
  const backendGstAmount = (backendSubtotal + shippingCharge) * 0.05;
  const backendTotalAmount =
    backendSubtotal + shippingCharge + backendGstAmount;
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          breakdown: {
            subtotal: backendSubtotal,
            shipping: shippingCharge,
            gst: parseFloat(backendGstAmount.toFixed(2)),
            total: parseFloat(backendTotalAmount.toFixed(2)),
          },
        },
        "Price breakdown fetched successfully."
      )
    );
});

export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { addressId, amount: frontendTotalAmount } = req.body;
  if (!addressId || !frontendTotalAmount)
    throw new ApiError(400, "Address ID and amount are required.");
  const user = await User.findById(req.user._id)
    .populate("cart.product", "name price stock weight")
    .populate("addresses");
  if (!user || !user.cart.length)
    throw new ApiError(400, "Your cart is empty.");
  const shippingAddress = user.addresses.id(addressId);
  if (!shippingAddress)
    throw new ApiError(404, "Selected shipping address not found.");
  let backendSubtotal = 0,
    totalWeightInGrams = 0;
  for (const item of user.cart) {
    if (!item.product || item.product.stock < item.quantity)
      throw new ApiError(400, `Not enough stock for ${item.product?.name}.`);
    backendSubtotal += item.product.price * item.quantity;
    totalWeightInGrams += (item.product.weight || 0.5) * 1000 * item.quantity;
  }
  const shippingCharge = await getDelhiveryShippingCharge(
    shippingAddress.postalCode,
    totalWeightInGrams
  );
  const backendTotalAmount =
    backendSubtotal +
    shippingCharge +
    (backendSubtotal + shippingCharge) * 0.05;
  if (Math.abs(frontendTotalAmount - backendTotalAmount) > 1)
    throw new ApiError(400, "Price mismatch. Please refresh and try again.");
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(backendTotalAmount * 100),
    currency: "INR",
    receipt: crypto.randomBytes(10).toString("hex"),
  });
  if (!razorpayOrder)
    throw new ApiError(500, "Failed to create Razorpay order.");
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          key: process.env.RAZORPAY_KEY_ID,
          addressId,
        },
        "Razorpay order created."
      )
    );
});

export const verifyPaymentAndPlaceOrder = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    addressId,
  } = req.body;
  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !addressId
  ) {
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
      .populate({ path: "cart.product", select: "name price stock weight" })
      .populate("addresses")
      .session(session);
    if (!user) throw new ApiError(404, "User not found.");
    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress)
      throw new ApiError(404, "Selected address not found.");
    let subtotal = 0,
      totalWeightInKg = 0,
      items = [],
      stockOps = [];
    for (const item of user.cart) {
      if (!item.product || item.product.stock < item.quantity) {
        throw new ApiError(
          400,
          `Item "${item.product?.name}" is out of stock.`
        );
      }
      subtotal += item.product.price * item.quantity;
      totalWeightInKg += (item.product.weight || 0.5) * item.quantity;
      items.push({
        product: item.product._id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
      });
      stockOps.push({
        updateOne: {
          filter: { _id: item.product._id },
          update: { $inc: { stock: -item.quantity } },
        },
      });
    }
    if (!items.length) {
      throw new ApiError(400, "Cannot place order with an empty cart.");
    }
    const shippingCharge = await getDelhiveryShippingCharge(
      selectedAddress.postalCode,
      totalWeightInKg * 1000
    );
    const gstAmount = (subtotal + shippingCharge) * 0.05;
    const finalTotalPrice = subtotal + shippingCharge + gstAmount;
    const [newOrder] = await Order.create(
      [
        {
          user: req.user._id,
          orderItems: items,
          shippingAddress: { ...selectedAddress.toObject(), _id: undefined },
          itemsPrice: subtotal,
          shippingPrice: shippingCharge,
          taxPrice: parseFloat(gstAmount.toFixed(2)),
          totalPrice: parseFloat(finalTotalPrice.toFixed(2)),
          paymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          paymentMethod: "Razorpay",
          orderStatus: "Paid",
        },
      ],
      { session }
    );
    const shipmentResult = await createDelhiveryShipment(
      newOrder,
      totalWeightInKg
    );
    if (!shipmentResult.success) {
      throw new ApiError(
        500,
        `Shipment creation failed: ${shipmentResult.rmk}. Your order has been automatically cancelled.`
      );
    }
    newOrder.orderStatus = "Processing";
    newOrder.shipmentDetails = {
      trackingNumber: shipmentResult.trackingNumber,
      courier: "Delhivery",
    };
    await newOrder.save({ session });
    await Product.bulkWrite(stockOps, { session });
    user.cart = [];
    await user.save({ session });
    await session.commitTransaction();
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
    if (!order) {
      throw new ApiError(404, "Order not found.");
    }
    const isOwner = order.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      throw new ApiError(403, "Not authorized to cancel this order.");
    }
    if (["Shipped", "Delivered", "Cancelled"].includes(order.orderStatus)) {
      throw new ApiError(
        400,
        `Order is already ${order.orderStatus.toLowerCase()} and cannot be cancelled.`
      );
    }
    if (order.shipmentDetails?.trackingNumber) {
      await cancelDelhiveryShipment(order.shipmentDetails.trackingNumber);
    }
    if (order.paymentId) {
      const refund = await initiateRazorpayRefund(
        order.paymentId,
        Math.round(order.totalPrice * 100)
      );
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
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          updatedOrder,
          "Order has been cancelled successfully."
        )
      );
  } catch (error) {
    await session.abortTransaction();
    console.error(
      `Order cancellation failed for ${orderId}. Transaction rolled back. Error:`,
      error.message
    );
    throw new ApiError(
      error.statusCode || 500,
      `Order cancellation failed: ${error.message}`
    );
  } finally {
    session.endSession();
  }
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .populate("orderItems.product", "mainImage")
    .sort({ createdAt: -1 });
  res
    .status(200)
    .json(new ApiResponse(200, orders, "User orders fetched successfully."));
});

export const getSingleOrderDetails = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId).populate(
    "orderItems.product",
    "name mainImage"
  );
  if (!order) throw new ApiError(404, "Order not found.");
  if (
    order.user.toString() !== req.user._id.toString() &&
    req.user.role !== "admin"
  ) {
    throw new ApiError(403, "Not authorized to view this order.");
  }
  res.status(200).json(new ApiResponse(200, order, "Order details fetched."));
});
