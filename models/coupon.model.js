import mongoose, { Schema } from "mongoose";

const couponSchema = new Schema(
    {
        code: {
            type: String,
            required: [true, "Coupon code is required"],
        },
        discountPercentage: {
            type: Number,
            required: [true, "Discount percentage is required"],
        },
        status: {
            type: String,
            enum: ["active", "inactive"], // Only allows these two values
            default: "active", // Sets a default value for new coupons
        },
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt fields
    }
);

export const Coupon = mongoose.model("Coupon", couponSchema);