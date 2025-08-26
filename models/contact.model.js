import mongoose, { Schema } from "mongoose";

const contactSchema = new Schema(
    {
        fullName: {
            type: String,
            required: [true, "Full Name is required"],
            trim: true,
            index: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            lowercase: true,
            trim: true,
        },
        phoneNumber: {
            type: String,
            trim: true,
        },
        message: {
            type: String,
            required: [true, "Message is required"],
        },
        size: {
            type: String,
            trim: true,
        },
        referenceImage: {
            type: String, // URL from Cloudinary
        },
        status: {
            type: String,
            enum: ["New", "Contacted", "Completed", "Rejected"],
            default: "New",
        },
    },
    {
        timestamps: true,
    }
);

export const Contact = mongoose.model("Contact", contactSchema);