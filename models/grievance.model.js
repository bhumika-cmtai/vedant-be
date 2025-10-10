// models/grievance.model.js
import mongoose from "mongoose";

const grievanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Assuming you have a User model
        required: true,
    },
    ticketId: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true, // For faster lookup
    },
    fullName: {
        type: String,
        required: true,
        trim: true,
        maxLength: 100,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    phoneNumber: {
        type: String,
        trim: true,
        // You might want to add a regex validator here for phone numbers
    },
    orderId: {
        type: String, // Storing as String for flexibility, or ObjectId if linked to an actual Order model
        trim: true,
        default: null, // Optional field
    },
    natureOfGrievance: {
        type: String,
        required: true,
        default: "Other"
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxLength: 2000,
    },
    status: {
        type: String,
        enum: ["Pending", "In Progress", "Resolved", "Closed", "Rejected"],
        default: "Pending", // Initial status
    },
    adminResponse: {
        type: String,
        trim: true,
        maxLength: 2000,
        default: null, // Admin will fill this
    },
}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

export const Grievance = mongoose.model("Grievance", grievanceSchema);