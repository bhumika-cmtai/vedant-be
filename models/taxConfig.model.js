import mongoose from "mongoose";

const taxConfigSchema = new mongoose.Schema({
    rate: {
        type: Number,
        required: true,
        default: 0.03, // Default to 3%
    }
}, { timestamps: true });

export const TaxConfig = mongoose.model("TaxConfig", taxConfigSchema);