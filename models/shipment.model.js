import mongoose, { Schema } from 'mongoose';

const shipmentSchema = new Schema(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        trackingNumber: { type: String, required: true, unique: true },
        status: {
            type: String,
            enum: ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED'],
            default: 'PENDING',
        },
        courier: { type: String, default: 'Delivery One' },
        shippingAddress: { type: Object, required: true },
    },
    { timestamps: true }
);

export const Shipment = mongoose.model("Shipment", shipmentSchema);