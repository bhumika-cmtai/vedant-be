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
        product_name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price_per_item: { type: Number, required: true },
        image: { type: String, required: true },
        product_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        // Variant specific details
        sku_variant: { type: String },
        size: { type: String },
        color: { type: String },
        
        userInput: { 
          type: String,
          trim: true 
      },
      },
    ],
    shippingAddress: {
      type: shippingAddressSchema,
      // required: true,
    },
    itemsPrice: { type: Number, required: true },
    shippingPrice: { type: Number },
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
      // This is the Shiprocket Shipment ID, used for most operations
      shiprocketShipmentId: { type: String },
      // This is the Shiprocket Order ID, mainly for reference
      shiprocketOrderId: { type: String },
      // This is the AWB (Air Waybill) / Tracking Number
      trackingNumber: { type: String },
      // Name of the courier company (e.g., Delhivery, XpressBees)
      courier: { type: String },
      // Direct tracking URL you can provide to the customer
      trackingUrl: { type: String },
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
