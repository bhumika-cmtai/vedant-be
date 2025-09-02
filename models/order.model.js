import mongoose from "mongoose";

const shippingAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
  type: { type: String, default: "Home" },
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderItems: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
      },
    ],
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    itemsPrice: { type: Number, required: true },
    shippingPrice: { type: Number, required: true },
    taxPrice: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 }, 
    couponCode: { type: String }, 
    totalPrice: { type: Number, required: true },
    orderStatus: {
      type: String,
      required: true,
      enum: [
        "Pending",
        "Paid",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
      ],
      default: "Paid",
    },
    paymentId: { type: String },
    razorpayOrderId: { type: String },
    paymentMethod: {
      type: String,
      enum: ["COD", "Razorpay"],
      required: true,
      default: "Razorpay",
    },
    shipmentDetails: {
      shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Shipment" },
      trackingNumber: { type: String },
      courier: { type: String },
    },
    refundDetails: {
      refundId: String,
      amount: Number,
      status: String,
      createdAt: Date,
    },
    cancellationDetails: {
      cancelledBy: {
        type: String,
        enum: ["User", "Admin"],
      },
      reason: { type: String },
      cancellationDate: { type: Date },
    },
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);
