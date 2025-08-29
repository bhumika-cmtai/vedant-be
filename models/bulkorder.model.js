import mongoose, { Schema } from 'mongoose';

const bulkOrderSchema = new Schema(
    {
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product', // This creates a reference to your Product model
            required: true,
        },
        name: {
            type: String,
            required: [true, 'Name is required.'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required.'],
            trim: true,
            lowercase: true,
            match: [/.+\@.+\..+/, 'Please provide a valid email address.'],
        },
        phone: {
            type: String,
            required: [true, 'Phone number is required.'],
            trim: true,
        },
        quantity: {
            type: Number,
            required: [true, 'Quantity is required.'],
            min: [10, 'The minimum quantity for a bulk order is 10.'], // Enforce a minimum
        },
        message: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: ['Pending', 'Contacted', 'Resolved', 'Cancelled'], // Predefined list of statuses
            default: 'Pending',
        },
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt fields
    }
);

export const BulkOrder = mongoose.model('BulkOrder', bulkOrderSchema);